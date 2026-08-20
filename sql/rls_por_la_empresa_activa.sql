-- =====================================================================
-- Se acaba `profiles.tenant_id` dentro de RLS
-- ---------------------------------------------------------------------
-- (2026-08-20) Continuacion de el_cierre_no_depende_del_usuario.sql, que
-- arreglo gastos_diarios y solicitudes_compras porque estaban costando
-- RD$24,200 en un cierre. Quedaban siete tablas con el mismo defecto:
-- resolver la empresa con
--
--     (SELECT tenant_id FROM profiles WHERE id = auth.uid())
--
-- que es la empresa de ORIGEN del usuario, en vez de get_user_tenant(),
-- que es la empresa donde esta trabajando.
--
-- >>> AQUI EL DEFECTO CORTA PARA LOS DOS LADOS <<<
-- En gastos_diarios solo escondia filas. En estas tablas varias ya tienen
-- ADEMAS su politica nueva con get_user_tenant(), y las politicas
-- permisivas se suman: la vieja no tapa nada, AGREGA. Un usuario de
-- MotoPrestamos trabajando en Caminero podia leer los documentos fiscales
-- y la configuracion de MotoPrestamos desde adentro de Caminero. No es un
-- dato de dinero, pero es la empresa equivocada igual.
--
-- Dos tratamientos distintos, segun lo que haya:
--
--   REDUNDANTES  config_empresa y documentos_fiscales ya tienen la
--                politica buena. La vieja solo agrega la empresa de
--                origen: se BORRA y no queda hueco.
--   UNICAS       integraciones_fiscales, crm_tienda_leads, tenants y los
--                dos contadores no tienen otra: se REESCRIBEN. Borrarlas
--                dejaria la tabla sin lectura.
--
-- Lo que NO cambia: quien puede. Donde habia `role = 'admin'` sigue
-- habiendo `role = 'admin'`; solo se cambia CUAL empresa. Y en
-- config_empresa el borrado no afloja nada, porque la politica que queda
-- (tenant_update_config_empresa) ya permitia a cualquier usuario de la
-- empresa escribir — las permisivas se suman, y la mas suelta ya mandaba.
--
-- >>> ESTO NO ABRE NADA <<<
-- get_user_tenant() devuelve UNA empresa: la activa. Y para el usuario
-- que nunca cambia de empresa devuelve exactamente profiles.tenant_id,
-- asi que para casi todo el mundo no cambia nada.
--
-- Idempotente.
-- =====================================================================

-- ------------------------------------------------------------
-- REDUNDANTES: se borran (ya existe la politica con get_user_tenant)
-- ------------------------------------------------------------
-- config_empresa  <- queda tenant_select/insert/update/delete_config_empresa
DROP POLICY IF EXISTS tenant_read_config          ON public.config_empresa;
DROP POLICY IF EXISTS tenant_admin_insert_config  ON public.config_empresa;
DROP POLICY IF EXISTS tenant_admin_update_config  ON public.config_empresa;

-- documentos_fiscales  <- queda tenant_select/insert/update_docs_fiscales
--                         y doc_fiscal_superadmin_select
DROP POLICY IF EXISTS doc_fiscal_select ON public.documentos_fiscales;
DROP POLICY IF EXISTS doc_fiscal_insert ON public.documentos_fiscales;
DROP POLICY IF EXISTS doc_fiscal_update ON public.documentos_fiscales;

-- ------------------------------------------------------------
-- UNICAS: se reescriben (borrarlas dejaria la tabla sin lectura)
-- ------------------------------------------------------------
-- integraciones_fiscales — el gate de admin se mantiene tal cual.
-- La lee SupabaseAuthContext para saber si la empresa factura fiscal:
-- con la version vieja, a quien cambiaba de empresa le daba "no" siempre.
DROP POLICY IF EXISTS integ_fiscal_select ON public.integraciones_fiscales;
CREATE POLICY integ_fiscal_select ON public.integraciones_fiscales
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS integ_fiscal_insert ON public.integraciones_fiscales;
CREATE POLICY integ_fiscal_insert ON public.integraciones_fiscales
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant()
              AND EXISTS (SELECT 1 FROM public.profiles p
                           WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS integ_fiscal_update ON public.integraciones_fiscales;
CREATE POLICY integ_fiscal_update ON public.integraciones_fiscales
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant()
         AND EXISTS (SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS integ_fiscal_delete ON public.integraciones_fiscales;
CREATE POLICY integ_fiscal_delete ON public.integraciones_fiscales
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant()
         AND EXISTS (SELECT 1 FROM public.profiles p
                      WHERE p.id = auth.uid() AND p.role = 'admin'));

-- crm_tienda_leads
DROP POLICY IF EXISTS "Tenant admin can view leads" ON public.crm_tienda_leads;
CREATE POLICY "Tenant admin can view leads" ON public.crm_tienda_leads
  FOR ALL
  USING (tenant_id = public.get_user_tenant());

-- tenants — la lee ProductFormModal para saber si la empresa tiene tienda.
-- superadmin_full_access se queda intacta.
DROP POLICY IF EXISTS tenant_read_own ON public.tenants;
CREATE POLICY tenant_read_own ON public.tenants
  FOR SELECT
  USING (id = public.get_user_tenant());

-- Contadores de numeracion: nadie los lee desde el front, pero una
-- numeracion que depende de la empresa de origen es una bomba de tiempo.
DROP POLICY IF EXISTS tenant_factura_counters_select ON public.tenant_factura_counters;
CREATE POLICY tenant_factura_counters_select ON public.tenant_factura_counters
  FOR SELECT
  USING (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS tenant_carta_ruta_counters_select ON public.tenant_carta_ruta_counters;
CREATE POLICY tenant_carta_ruta_counters_select ON public.tenant_carta_ruta_counters
  FOR SELECT
  USING (tenant_id = public.get_user_tenant());

SELECT public.registrar_migracion('rls_por_la_empresa_activa.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- No puede quedar NINGUNA politica que resuelva la empresa leyendo
-- profiles.tenant_id. Si aparece una nueva manana, esta consulta la
-- encuentra.
SELECT
  COALESCE(string_agg(c.relname||'.'||p.polname, ', ' ORDER BY c.relname), '(ninguna)') AS politicas_que_siguen_usando_profiles,
  CASE WHEN count(*) = 0
       THEN 'OK  toda la RLS resuelve la empresa con get_user_tenant()'
       ELSE 'REVISAR: quedan '||count(*)||' politicas atadas a la empresa de origen' END AS estado
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relnamespace = 'public'::regnamespace
  AND (pg_get_expr(p.polqual, p.polrelid)      LIKE '%profiles.tenant_id%'
    OR pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%profiles.tenant_id%');
