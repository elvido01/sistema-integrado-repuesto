-- =====================================================================
-- Registro de contribuyentes de la DGII + cliente desde el RNC (11/11/2026)
-- ---------------------------------------------------------------------
-- La DGII publica el listado completo de RNC (DGII_RNC.zip, botones TXT/CSV
-- de la Consulta RNC). Se carga aquí con scripts/cargar-rnc-dgii.mjs y se
-- refresca cada semana. La lupa del RNC en Ventas lo consulta:
--   * si el cliente ya existe en la empresa → se escoge;
--   * si no, y está en la DGII → se crea con su razón social (crédito fiscal);
--   * si no está inscrito → se avisa (un e-CF a un RNC que no existe se cae).
-- Son datos públicos de la DGII: los lee cualquier usuario autenticado.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.dgii_contribuyentes (
  rnc              text PRIMARY KEY,          -- solo dígitos (9 RNC, 11 cédula)
  razon_social     text NOT NULL,
  nombre_comercial text,
  actividad        text,
  estado           text,                      -- ACTIVO, SUSPENDIDO, DADO DE BAJA...
  regimen          text,
  actualizado_en   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dgii_contribuyentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dgii_contribuyentes_leer ON public.dgii_contribuyentes;
CREATE POLICY dgii_contribuyentes_leer ON public.dgii_contribuyentes
  FOR SELECT TO authenticated USING (true);
-- Escritura: solo el cargador (service role), que salta RLS.

-- Busca el cliente por RNC/cédula en la empresa activa; si no existe y la
-- DGII lo tiene, lo crea. SECURITY INVOKER: el insert pasa por el RLS de
-- clientes (tenant = get_user_tenant()).
CREATE OR REPLACE FUNCTION public.cliente_desde_rnc(p_doc text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $f$
DECLARE
  d   text := regexp_replace(coalesce(p_doc, ''), '\D', '', 'g');
  t   uuid := get_user_tenant();
  c   public.clientes;
  k   public.dgii_contribuyentes;
  cod text;
BEGIN
  IF t IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_empresa');
  END IF;
  IF length(d) NOT IN (9, 11) OR d ~ '^0+$' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'formato');
  END IF;

  -- Ya es cliente: por su RNC (guardado con o sin guiones), nunca por el
  -- código (otro cliente puede tener ese código con otro RNC).
  SELECT * INTO c FROM public.clientes
   WHERE tenant_id = t
     AND regexp_replace(coalesce(rnc, ''), '\D', '', 'g') = d
   ORDER BY coalesce(activo, true) DESC, created_at
   LIMIT 1;
  IF FOUND THEN
    IF c.activo IS FALSE THEN
      -- Desactivado a propósito: no se escoge ni se duplica.
      RETURN jsonb_build_object('ok', false, 'motivo', 'inactivo', 'nombre', c.nombre, 'codigo', c.codigo);
    END IF;
    SELECT * INTO k FROM public.dgii_contribuyentes WHERE rnc = d;
    RETURN jsonb_build_object('ok', true, 'existente', true, 'cliente', to_jsonb(c),
                              'estado_dgii', k.estado);
  END IF;

  SELECT * INTO k FROM public.dgii_contribuyentes WHERE rnc = d;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_inscrito',
      'cargado', EXISTS (SELECT 1 FROM public.dgii_contribuyentes LIMIT 1));
  END IF;

  -- Código = RNC; si ese código ya lo usa otro cliente, uno libre.
  cod := d;
  IF EXISTS (SELECT 1 FROM public.clientes WHERE tenant_id = t AND codigo = cod) THEN
    cod := 'C' || d;
    WHILE EXISTS (SELECT 1 FROM public.clientes WHERE tenant_id = t AND codigo = cod) LOOP
      cod := 'C' || d || '-' || substr(md5(random()::text), 1, 3);
    END LOOP;
  END IF;

  INSERT INTO public.clientes (tenant_id, codigo, nombre, rnc, tipo_ncf, activo)
  VALUES (t, cod, upper(btrim(k.razon_social)), d, '01', true)
  RETURNING * INTO c;

  RAISE LOG 'cliente_desde_rnc: tenant % creó cliente % (%) desde la DGII', t, c.id, d;
  RETURN jsonb_build_object('ok', true, 'existente', false, 'cliente', to_jsonb(c),
                            'estado_dgii', k.estado, 'nombre_comercial', k.nombre_comercial);
END;
$f$;

-- La búsqueda por dígitos del RNC sin recorrer todos los clientes.
CREATE INDEX IF NOT EXISTS clientes_tenant_rnc_digitos_idx
  ON public.clientes (tenant_id, (regexp_replace(coalesce(rnc, ''), '\D', '', 'g')));

REVOKE ALL ON FUNCTION public.cliente_desde_rnc(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cliente_desde_rnc(text) TO authenticated;

SELECT public.registrar_migracion('dgii_contribuyentes.sql');
