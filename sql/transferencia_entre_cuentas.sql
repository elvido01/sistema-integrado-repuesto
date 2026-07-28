-- =====================================================================
-- Transferencia entre cuentas bancarias (con cambio de moneda)
-- ---------------------------------------------------------------------
-- (2026-07-28) Hasta ahora solo se podía registrar un ingreso o un retiro
-- suelto en cada cuenta. Para mover plata de una cuenta a otra había que
-- hacer dos apuntes a mano y confiar en que cuadraran.
--
-- Esta función lo hace de una sola vez y ATÓMICO: o entran los dos
-- movimientos o no entra ninguno. Nunca queda la salida sin su entrada.
--
-- >>> LA TASA <<<
-- Si las dos cuentas son de la misma moneda, la tasa se ignora y entra lo
-- mismo que sale. Si son de monedas distintas, la tasa es OBLIGATORIA y se
-- expresa como en todo el sistema: RD$ por US$ (ej. 61.25).
--
--   de RD$ a US$   ->  entran   monto / tasa      (61,250 a 61.25 = US$1,000)
--   de US$ a RD$   ->  entran   monto * tasa      (US$1,000 a 61.25 = 61,250)
--
-- Sale el monto que se escribe (en la moneda de la cuenta de origen) y entra
-- el convertido. El concepto de cada movimiento dice la otra cuenta y la tasa
-- usada, para que al leer el historial se entienda sin buscar en otro lado.
--
-- Las dos filas comparten el mismo origen_id, así que se pueden encontrar
-- juntas: son las dos patas de la misma transferencia.
--
-- >>> POR QUE NO SE USA get_user_tenant() PARA EL PERMISO <<<
-- Esa funcion devuelve la EMPRESA ACTIVA del usuario, que sale de
-- usuario_tenant_activo y puede quedar sin resolver segun como se entro a la
-- sesion (dio "No se pudo determinar el tenant" al transferir entre dos
-- cuentas que el usuario si podia ver).
--
-- El permiso se valida contra el dato firme: A QUE EMPRESAS PERTENECE EL
-- USUARIO (profiles + usuarios_empresas), mas la financiera vinculada de
-- cualquiera de ellas. Asi no depende de cual este "activa".
--
-- >>> CUENTAS COMPARTIDAS <<<
-- El modulo muestra las cuentas propias Y las de la financiera vinculada (un
-- dealer opera las de su financiera). Por eso se aceptan las dos, con la misma
-- regla que registrar_movimiento_bancario_compartido: dueño = quien llama, o
-- la financiera vinculada.
--
-- Cada movimiento se graba a nombre del DUEÑO de su cuenta, no de quien lo
-- hace. Y si el dinero se mueve desde otra empresa, el concepto lo dice
-- ("· via <empresa>") para que en el historial no aparezca de la nada.
--
-- No permite transferir a la misma cuenta ni montos <= 0.
-- =====================================================================

-- 'transferencia_interna' ya está permitido en el CHECK de origen_tipo.

-- ¿El usuario alcanza esa empresa? Por pertenencia directa (profiles o
-- usuarios_empresas) o porque es la financiera vinculada de una suya.
CREATE OR REPLACE FUNCTION public.usuario_alcanza_tenant(p_uid uuid, p_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_uid IS NOT NULL AND p_tenant IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = p_uid
               AND (p.tenant_id = p_tenant OR COALESCE(p.is_superadmin, false)))
    OR EXISTS (SELECT 1 FROM public.usuarios_empresas ue
                WHERE ue.user_id = p_uid AND ue.tenant_id = p_tenant)
    -- la financiera vinculada de cualquiera de sus empresas
    OR EXISTS (
      SELECT 1 FROM public.config_empresa ce
       WHERE ce.financiera_tenant_id = p_tenant
         AND (EXISTS (SELECT 1 FROM public.profiles p2
                       WHERE p2.id = p_uid AND p2.tenant_id = ce.tenant_id)
              OR EXISTS (SELECT 1 FROM public.usuarios_empresas ue2
                          WHERE ue2.user_id = p_uid AND ue2.tenant_id = ce.tenant_id)))
  );
$$;

GRANT EXECUTE ON FUNCTION public.usuario_alcanza_tenant(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.transferir_entre_cuentas(
  p_origen_id  uuid,
  p_destino_id uuid,
  p_monto      numeric,
  p_tasa       numeric DEFAULT NULL,
  p_concepto   text    DEFAULT NULL,
  p_fecha      date    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_tenant   uuid := public.get_user_tenant();   -- solo para el rastro "vía"
  v_yo       text;
  o          record;
  d          record;
  v_fecha    date := COALESCE(p_fecha, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  v_monto    numeric := round(COALESCE(p_monto, 0), 2);
  v_destino  numeric;
  v_tasa     numeric := COALESCE(p_tasa, 0);
  v_par      uuid := gen_random_uuid();   -- une las dos patas
  v_txt      text;
  v_concepto text := NULLIF(btrim(COALESCE(p_concepto, '')), '');
BEGIN
  -- Diagnostico: si auth.uid() viene vacio, decir QUE se esta viendo, en vez
  -- de un "no hay sesion" a secas que no deja avanzar.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() vacío. rol=% | jwt.claims=% | jwt.sub=% | get_user_tenant=%',
      current_user,
      COALESCE(left(current_setting('request.jwt.claims', true), 120), '(sin claims)'),
      COALESCE(current_setting('request.jwt.claim.sub', true), '(sin sub)'),
      COALESCE(public.get_user_tenant()::text, '(null)');
  END IF;
  IF p_origen_id = p_destino_id THEN
    RAISE EXCEPTION 'La cuenta de origen y la de destino son la misma';
  END IF;
  IF v_monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor que cero'; END IF;

  SELECT * INTO o FROM public.cuentas_bancarias WHERE id = p_origen_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta de origen no encontrada'; END IF;
  SELECT * INTO d FROM public.cuentas_bancarias WHERE id = p_destino_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta de destino no encontrada'; END IF;

  -- El usuario debe tener acceso a las DOS cuentas: por pertenecer a la
  -- empresa dueña, o porque esa empresa es la financiera vinculada de alguna
  -- a la que sí pertenece.
  IF NOT public.usuario_alcanza_tenant(v_uid, o.tenant_id) THEN
    RAISE EXCEPTION 'No tiene acceso a la cuenta de origen (%)', o.banco;
  END IF;
  IF NOT public.usuario_alcanza_tenant(v_uid, d.tenant_id) THEN
    RAISE EXCEPTION 'No tiene acceso a la cuenta de destino (%)', d.banco;
  END IF;

  -- Si se mueve plata entre empresas distintas, dejarlo dicho en el concepto.
  IF o.tenant_id <> d.tenant_id
     OR (v_tenant IS NOT NULL AND o.tenant_id <> v_tenant) THEN
    SELECT nombre INTO v_yo FROM public.config_empresa
     WHERE tenant_id = COALESCE(v_tenant, o.tenant_id);
    v_yo := ' · vía ' || COALESCE(v_yo, 'otra empresa');
  ELSE
    v_yo := '';
  END IF;

  -- ---------- la conversión ----------
  IF o.moneda = d.moneda THEN
    v_destino := v_monto;
    v_txt := '';
  ELSE
    IF v_tasa <= 0 THEN
      RAISE EXCEPTION 'Falta la tasa de cambio: vas de % a %, hay que indicar cuántos RD$ vale un US$',
        o.moneda, d.moneda;
    END IF;
    IF o.moneda = 'USD' AND d.moneda = 'DOP' THEN
      v_destino := round(v_monto * v_tasa, 2);
    ELSIF o.moneda = 'DOP' AND d.moneda = 'USD' THEN
      v_destino := round(v_monto / v_tasa, 2);
    ELSE
      RAISE EXCEPTION 'Solo se puede convertir entre DOP y USD (vienen % y %)', o.moneda, d.moneda;
    END IF;
    v_txt := ' (tasa ' || trim(to_char(v_tasa, 'FM999990.0099')) || ')';
  END IF;

  IF v_destino <= 0 THEN
    RAISE EXCEPTION 'La conversión da cero: revisa el monto y la tasa';
  END IF;

  -- ---------- las dos patas ----------
  INSERT INTO public.movimientos_bancarios
    (tenant_id, cuenta_id, tipo, monto, concepto, origen_tipo, origen_id, fecha, usuario_id)
  VALUES (
    o.tenant_id, p_origen_id, 'SALIDA', v_monto,
    COALESCE(v_concepto || ' — ', '') || 'Transferencia a ' || d.banco
      || COALESCE(' ' || NULLIF(d.alias, ''), '') || v_txt || v_yo,
    'transferencia_interna', v_par, v_fecha, auth.uid());

  INSERT INTO public.movimientos_bancarios
    (tenant_id, cuenta_id, tipo, monto, concepto, origen_tipo, origen_id, fecha, usuario_id)
  VALUES (
    d.tenant_id, p_destino_id, 'ENTRADA', v_destino,
    COALESCE(v_concepto || ' — ', '') || 'Transferencia desde ' || o.banco
      || COALESCE(' ' || NULLIF(o.alias, ''), '') || v_txt || v_yo,
    'transferencia_interna', v_par, v_fecha, auth.uid());

  RETURN json_build_object(
    'ok', true,
    'par_id', v_par,
    'sale',  json_build_object('cuenta', o.banco, 'moneda', o.moneda, 'monto', v_monto),
    'entra', json_build_object('cuenta', d.banco, 'moneda', d.moneda, 'monto', v_destino),
    'tasa', CASE WHEN o.moneda = d.moneda THEN NULL ELSE v_tasa END);
END;
$$;

GRANT EXECUTE ON FUNCTION public.transferir_entre_cuentas(uuid, uuid, numeric, numeric, text, date) TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('transferencia_entre_cuentas.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) La función quedó creada
SELECT to_regprocedure('public.transferir_entre_cuentas(uuid,uuid,numeric,numeric,text,date)')::text AS firma;
-- esperado: no NULL

-- 2) 'transferencia_interna' está permitido como origen
SELECT pg_get_constraintdef(oid) AS regla
FROM pg_constraint
WHERE conrelid = 'public.movimientos_bancarios'::regclass
  AND conname LIKE '%origen_tipo%';
-- esperado: la lista debe incluir 'transferencia_interna'

-- 3) DIAGNOSTICO: quien alcanza cada caja chica (si algo falla, mirar aquí)
SELECT p.email,
       public.usuario_alcanza_tenant(p.id, c.tenant_id) AS alcanza,
       c.banco || ' ' || COALESCE(c.alias, '') || ' (' || c.moneda || ')' AS cuenta
FROM public.cuentas_bancarias c
CROSS JOIN public.profiles p
WHERE c.banco = 'CAJA CHICA'
  AND p.email IS NOT NULL
ORDER BY p.email, c.moneda;
-- el usuario que transfiere debe salir con alcanza = true en LAS DOS

-- 4) Transferencias hechas (las dos patas juntas por origen_id)
SELECT m.origen_id, m.fecha,
       string_agg(c.banco || ' ' || m.tipo || ' ' || m.moneda_txt, '  ->  ' ORDER BY m.tipo DESC) AS movimiento
FROM (SELECT mb.*, mb.monto::text AS moneda_txt FROM public.movimientos_bancarios mb
      WHERE mb.origen_tipo = 'transferencia_interna') m
JOIN public.cuentas_bancarias c ON c.id = m.cuenta_id
GROUP BY m.origen_id, m.fecha
ORDER BY m.fecha DESC;
-- cada transferencia debe salir con SUS DOS patas
