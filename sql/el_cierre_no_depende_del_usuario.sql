-- =====================================================================
-- Los gastos del dia no dependen de quien abra el cierre
-- ---------------------------------------------------------------------
-- (2026-08-20) El Cierre de Caja de Caminero Motors pedia RD$24,200 de
-- mas que el dashboard, mirando los dos el mismo dia y la misma empresa.
--
-- Las dos pantallas suman lo mismo. La diferencia esta en COMO leen:
--
--   Dashboard        get_caja_excedente_dashboard()   SECURITY DEFINER
--                    la funcion lee por su cuenta; RLS no le aplica.
--   Cierre de Caja   supabase.from('gastos_diarios')  PostgREST
--                    pasa por RLS, con la identidad de quien esta mirando.
--
-- Y la politica de lectura de gastos_diarios resolvia la empresa asi:
--
--     tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
--
-- `profiles.tenant_id` es la empresa de ORIGEN del usuario, no la empresa
-- en la que esta trabajando ahora. Todas las demas tablas de dinero
-- —facturas, recibos_ingreso, pagos_suplidores, compras— usan
-- `get_user_tenant()`, que si respeta el selector de empresa.
--
-- Medido en produccion, sobre los MISMOS 10 gastos de hoy:
--
--     usuario    trabaja en         gastos que ve      suma
--     yerlin     Caminero Motors         10        24,200.00
--     odalys     Caminero Motors          0             0.00   <--
--     el dueno   (cualquiera)             0             0.00   <--
--
-- odalys entra a Caminero por el selector de empresa: get_user_tenant()
-- dice Caminero, profiles.tenant_id dice MotoPrestamos. Al dueno le pasa
-- por otra via: su profiles.tenant_id es NULL, y `tenant_id IN (NULL)`
-- no es falso, es NULL — no encaja con ninguna fila, en ninguna empresa.
--
-- >>> LO PEOR NO ES QUE FALLE, ES QUE NO AVISA <<<
-- Una fila que RLS esconde no da error: devuelve cero filas, igual que un
-- dia sin gastos. El cierre resta cero y pide ese efectivo como si
-- estuviera en la gaveta. El descuadre aparece al contar los billetes,
-- cuando ya nadie se acuerda de quien tecleo que.
--
-- >>> UN CIERRE QUE CAMBIA SEGUN QUIEN LO ABRA NO ES UN CIERRE <<<
-- El dinero que salio de la gaveta salio igual, lo haya tecleado quien lo
-- haya tecleado. Aqui gastos_diarios pasa a usar la misma regla que ya
-- tienen las demas tablas de dinero.
--
-- Va tambien `solicitudes_compras`, con el mismo defecto: de ahi sale la
-- lista "Falta por entregar" de Pago a Terceros, y por eso reaparecian
-- como pendientes los GPS y seguros ya entregados hoy.
--
-- >>> ESTO NO ABRE NADA <<<
-- get_user_tenant() devuelve UNA empresa: la activa. Se pasa de "la
-- empresa de donde vengo" a "la empresa donde estoy", no de una a todas.
-- La politica de superadmin de solicitudes_compras se deja como estaba.
--
-- Idempotente.
-- =====================================================================

-- ------------------------------------------------------------
-- gastos_diarios  (rol: authenticated; no tiene politica de DELETE
-- y no se le agrega: borrar un gasto pasa por su RPC)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant users can read gastos_diarios"   ON public.gastos_diarios;
CREATE POLICY "Tenant users can read gastos_diarios"
  ON public.gastos_diarios FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "Tenant users can insert gastos_diarios" ON public.gastos_diarios;
CREATE POLICY "Tenant users can insert gastos_diarios"
  ON public.gastos_diarios FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "Tenant users can update gastos_diarios" ON public.gastos_diarios;
CREATE POLICY "Tenant users can update gastos_diarios"
  ON public.gastos_diarios FOR UPDATE TO authenticated
  USING      (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- ------------------------------------------------------------
-- solicitudes_compras  (rol: PUBLIC, como estaban)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS solicitudes_compras_tenant_select ON public.solicitudes_compras;
CREATE POLICY solicitudes_compras_tenant_select
  ON public.solicitudes_compras FOR SELECT
  USING (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS solicitudes_compras_tenant_insert ON public.solicitudes_compras;
CREATE POLICY solicitudes_compras_tenant_insert
  ON public.solicitudes_compras FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS solicitudes_compras_tenant_update ON public.solicitudes_compras;
CREATE POLICY solicitudes_compras_tenant_update
  ON public.solicitudes_compras FOR UPDATE
  USING (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS solicitudes_compras_tenant_delete ON public.solicitudes_compras;
CREATE POLICY solicitudes_compras_tenant_delete
  ON public.solicitudes_compras FOR DELETE
  USING (tenant_id = public.get_user_tenant());

SELECT public.registrar_migracion('el_cierre_no_depende_del_usuario.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Se mira con los ojos de odalys, que es el caso que fallaba: entra a
-- Caminero Motors por el selector de empresa y hasta ahora los gastos de
-- ese dia le daban cero.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"1f8fc4a1-b716-4ff8-a020-802b2d7730f2","role":"authenticated"}';

SELECT
  'odalys'                                                     AS usuario,
  public.get_user_tenant()::text                               AS trabaja_en,
  (SELECT count(*) FROM public.gastos_diarios g
    WHERE g.tenant_id = public.get_user_tenant()
      AND g.fecha = (now() AT TIME ZONE 'America/Santo_Domingo')::date
      AND COALESCE(g.anulado, false) = false)                  AS gastos_de_hoy_que_ve,
  (SELECT COALESCE(SUM(g.monto), 0) FROM public.gastos_diarios g
    WHERE g.tenant_id = public.get_user_tenant()
      AND g.fecha = (now() AT TIME ZONE 'America/Santo_Domingo')::date
      AND COALESCE(g.anulado, false) = false
      AND g.cuenta_bancaria_id IS NULL
      AND COALESCE(g.afecta_caja, true) = true)                AS sale_de_la_gaveta,
  (SELECT count(*) FROM public.solicitudes_compras s
    WHERE s.tenant_id = public.get_user_tenant())              AS solicitudes_que_ve,
  CASE WHEN (SELECT count(*) FROM public.gastos_diarios g
              WHERE g.tenant_id = public.get_user_tenant()
                AND g.fecha = (now() AT TIME ZONE 'America/Santo_Domingo')::date
                AND COALESCE(g.anulado, false) = false) > 0
       THEN 'OK  ya ve los gastos de la empresa donde trabaja'
       ELSE 'REVISAR: sigue sin verlos (o hoy no hubo gastos)' END AS estado;
