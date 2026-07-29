-- =====================================================================
-- REPUESTOS MORLA: comprobante fiscal propio (B01 autorizado por DGII)
-- ---------------------------------------------------------------------
-- (2026-07-29) Morla ya tiene su propia autorización de la DGII y deja de
-- facturar bajo el nombre prestado.
--
--   Solicitud 6009893715 del 27/07/2026 — APROBADA
--   Tipo:         FACTURA DE CRÉDITO FISCAL (01)
--   Autorización: 6005403789
--   Rango:        B0100000001 → B0100000015
--   Vence:        31/12/2027
--
--   Nombre comercial:  Repuestos Morla
--   Razón social:      ELVIDO MANUEL CAMINERO MORLA
--   RNC:               028-0099156-0
--   Contribuyente:     Persona física
--
-- >>> LA SECUENCIA VIEJA SE APAGA <<<
-- Había una secuencia B01 del 300 al 500 (usados hasta el 341) a nombre de
-- "MPN Y CAMINERO MOTORS", el arreglo de cuando Morla no tenía RNC propio.
-- Se DESACTIVA, no se borra: queda su historial y se puede reactivar con un
-- clic desde Configuración → Comprobantes si hiciera falta.
--
-- El motor elige la secuencia activa más reciente (get_next_ncf ordena por
-- created_at DESC), así que la nueva toma el relevo sola. Dejar las dos
-- activas sería el problema: se seguiría emitiendo a nombre ajeno.
--
-- >>> OJO: SOLO APROBARON 15 DE LAS 100 SOLICITADAS <<<
-- El propio mensaje de la DGII dice por qué: "Omisión en envío Formato 606
-- en los períodos F606/202512, F606/202511". Mientras esos 606 no se envíen,
-- la DGII seguirá aprobando cantidades cortas. Con 15 comprobantes la
-- alerta se pone en 5 restantes, que da tiempo a pedir más.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) Tipo de contribuyente (persona física / jurídica)
-- ------------------------------------------------------------
-- Lo pide la DGII para el e-CF y cambia cómo se identifica al emisor. No
-- existía en config_empresa: una empresa a nombre de una persona no se podía
-- distinguir de una sociedad.
ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS tipo_contribuyente text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'config_empresa_tipo_contribuyente_chk') THEN
    ALTER TABLE public.config_empresa
      ADD CONSTRAINT config_empresa_tipo_contribuyente_chk
      CHECK (tipo_contribuyente IS NULL OR tipo_contribuyente IN ('fisica', 'juridica'));
  END IF;
END $$;

COMMENT ON COLUMN public.config_empresa.tipo_contribuyente IS
  'fisica = el RNC es la cédula de una persona (la razón social es su nombre); juridica = sociedad.';

-- ------------------------------------------------------------
-- 2) Los datos fiscales de Repuestos Morla
-- ------------------------------------------------------------
UPDATE public.config_empresa
   SET nombre             = 'REPUESTOS MORLA',              -- el que se muestra
       razon_social       = 'ELVIDO MANUEL CAMINERO MORLA', -- el que responde ante la DGII
       rnc                = '028-0099156-0',
       tipo_contribuyente = 'fisica'
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------
-- 3) Apagar la secuencia prestada y encender la propia
-- ------------------------------------------------------------
DO $$
DECLARE
  v_morla uuid := '00000000-0000-0000-0000-000000000001';
  v_apagadas int;
  v_id uuid;
BEGIN
  -- La vieja: se desactiva, NO se borra (su historial dice qué se emitió).
  UPDATE public.secuencias_ncf
     SET activo = false, updated_at = now()
   WHERE tenant_id = v_morla
     AND activo = true
     AND NOT (tipo_ncf = '01' AND serie = 'B' AND secuencia_desde = 1 AND secuencia_hasta = 15);
  GET DIAGNOSTICS v_apagadas = ROW_COUNT;
  RAISE NOTICE 'Secuencias anteriores desactivadas: %', v_apagadas;

  -- La nueva. Si ya existe (script corrido dos veces) se actualiza sin tocar
  -- ultimo_emitido, para no regalar ni repetir comprobantes.
  SELECT id INTO v_id FROM public.secuencias_ncf
   WHERE tenant_id = v_morla AND tipo_ncf = '01' AND serie = 'B'
     AND secuencia_desde = 1 AND secuencia_hasta = 15;

  IF v_id IS NULL THEN
    INSERT INTO public.secuencias_ncf
      (tenant_id, tipo_ncf, serie, secuencia_desde, secuencia_hasta, ultimo_emitido,
       fecha_solicitud, fecha_vencimiento, nombre_emisor, alerta_cuando_queden, activo)
    VALUES
      (v_morla, '01', 'B', 1, 15, 0,
       DATE '2026-07-27', DATE '2027-12-31', 'ELVIDO MANUEL CAMINERO MORLA', 5, true);
    RAISE NOTICE 'Secuencia B0100000001–B0100000015 creada (vence 31/12/2027).';
  ELSE
    UPDATE public.secuencias_ncf
       SET activo = true,
           fecha_solicitud = DATE '2026-07-27',
           fecha_vencimiento = DATE '2027-12-31',
           nombre_emisor = 'ELVIDO MANUEL CAMINERO MORLA',
           alerta_cuando_queden = 5,
           updated_at = now()
     WHERE id = v_id;
    RAISE NOTICE 'La secuencia ya existía — se dejó activa y al día (ultimo_emitido intacto).';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('ncf_repuestos_morla.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Los datos fiscales que van a salir en la factura
SELECT nombre AS nombre_comercial, razon_social, rnc, tipo_contribuyente
FROM public.config_empresa
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
-- esperado: REPUESTOS MORLA | ELVIDO MANUEL CAMINERO MORLA | 028-0099156-0 | fisica

-- 2) Qué secuencia está activa y cuál es el PRÓXIMO comprobante
SELECT s.serie || s.tipo_ncf || lpad(
         (CASE WHEN s.ultimo_emitido < s.secuencia_desde THEN s.secuencia_desde
               ELSE s.ultimo_emitido + 1 END)::text, 8, '0') AS proximo_ncf,
       s.serie || s.tipo_ncf || lpad(s.secuencia_desde::text, 8, '0') AS desde,
       s.serie || s.tipo_ncf || lpad(s.secuencia_hasta::text, 8, '0') AS hasta,
       s.secuencia_hasta - GREATEST(s.ultimo_emitido, s.secuencia_desde - 1) AS restantes,
       s.fecha_vencimiento, s.nombre_emisor, s.activo
FROM public.secuencias_ncf s
WHERE s.tenant_id = '00000000-0000-0000-0000-000000000001'
ORDER BY s.activo DESC, s.created_at DESC;
-- esperado: la ACTIVA es B0100000001 → B0100000015, 15 restantes,
--           vence 31/12/2027, a nombre de ELVIDO MANUEL CAMINERO MORLA.
--           La vieja (300–500, MPN Y CAMINERO MOTORS) queda con activo=false.

-- 3) Prueba en seco: lo que devolvería el motor al facturar
--    (informativo — get_next_ncf necesita sesión, aquí se replica la cuenta)
SELECT 'Al facturar saldría: ' || s.serie || s.tipo_ncf || lpad(
         (CASE WHEN s.ultimo_emitido < s.secuencia_desde THEN s.secuencia_desde
               ELSE s.ultimo_emitido + 1 END)::text, 8, '0') AS resultado
FROM public.secuencias_ncf s
WHERE s.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND s.activo AND s.tipo_ncf = '01' AND s.fecha_vencimiento >= CURRENT_DATE
ORDER BY s.created_at DESC LIMIT 1;
-- esperado: B0100000001
