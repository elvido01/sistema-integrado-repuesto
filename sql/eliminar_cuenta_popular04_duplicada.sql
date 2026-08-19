-- =====================================================================
-- Se elimina la cuenta POPULAR 04 duplicada de Caminero Motors
-- ---------------------------------------------------------------------
-- (2026-08-19) La cuenta 004110544 del Banco Popular estaba metida DOS
-- veces en el sistema:
--
--   bb840b28…  BANCO POPULAR — MotoPréstamos Los Naranjos   (la buena,
--              compartida, y la que ve todo el mundo)
--   8b3c6fce…  POPULAR 04    — Caminero Motors              (la copia)
--
-- La copia solo la veia Caminero Motors, y por eso al facturar o cerrar
-- caja aparecian dos "Popular 04" en la lista. Alguien ya la habia
-- marcado poniendole "(duplicada - usar la de MotoPréstamos)" en el
-- alias, pero seguia ahi y se seguia eligiendo por error.
--
-- >>> ESTO BORRA DINERO. LEER ANTES DE RE-EJECUTAR <<<
-- movimientos_bancarios.cuenta_id tiene ON DELETE CASCADE: borrar la
-- cuenta se lleva sus movimientos SIN avisar. Por eso aqui se borran a
-- mano primero — para que quede escrito que se sabia lo que se estaba
-- destruyendo— y por eso van copiados abajo uno por uno.
--
-- LO QUE HABIA (saldo_inicial 10,000 + movimientos = RD$135,000):
--
--   29/07  SALIDA    10,000.00  ARREGLO DE CUENTA
--                               (anulaba el saldo inicial ficticio)
--   31/07  SALIDA   500,460.99  Pago suplidor TERUEL & CIA (PS-000013)
--   31/07  ENTRADA  500,460.99  CORRECION ERROR PAGO
--                               (^ ese par se anula entre si)
--   31/07  ENTRADA  135,000.00  Cierre de caja — turno 1 (2026-07-31)
--   11/08  ENTRADA   44,400.00  Cierre de caja — turno 1 (2026-08-11)
--   11/08  SALIDA    44,400.00  ERROR DE CUENTA AL GRABAR — Transferencia
--                               (^ ese par tambien se anula entre si)
--
-- De todo eso, lo unico con efecto real era el cierre de caja del 31/07
-- por RD$135,000. Se comprobo cuenta por cuenta, del 30/07 al 03/08, que
-- ese cierre NO estaba registrado en ninguna otra cuenta del grupo.
--
-- El dueño decidio borrarlo igual, sabiendo eso, el 19/08/2026. Pesa a
-- favor que ese cierre venia mal cuadrado de origen: efectivo_en_caja
-- 135,000 contra un desglose de 85,000, diferencia -50,000.
--
-- Los cierres de caja (cierres_caja) NO se tocan: siguen enteros, lo que
-- se va es el apunte bancario que los depositaba en la cuenta equivocada.
--
-- Idempotente: si ya se corrio, no encuentra nada y no hace nada.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) LOS MOVIMIENTOS, A MANO Y NO POR CASCADA
-- ------------------------------------------------------------
DELETE FROM public.movimientos_bancarios
 WHERE cuenta_id = '8b3c6fce-5426-466c-a45a-3a0c0e7857df';

-- ------------------------------------------------------------
-- 2) LA CUENTA
-- ------------------------------------------------------------
-- Con tenant_id en el WHERE aunque el id ya sea unico: si algun dia este
-- archivo se corre contra otra base, que no borre una cuenta cualquiera.
DELETE FROM public.cuentas_bancarias
 WHERE id = '8b3c6fce-5426-466c-a45a-3a0c0e7857df'
   AND tenant_id = 'b39506c3-27dc-467d-830b-096731b83113';

SELECT public.registrar_migracion('eliminar_cuenta_popular04_duplicada.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  CASE WHEN NOT EXISTS (SELECT 1 FROM public.cuentas_bancarias
                         WHERE id='8b3c6fce-5426-466c-a45a-3a0c0e7857df')
       THEN 'OK  la duplicada ya no esta' ELSE '*** FALLO *** sigue ahi' END AS cuenta,
  (SELECT count(*) FROM public.movimientos_bancarios
    WHERE cuenta_id='8b3c6fce-5426-466c-a45a-3a0c0e7857df')                 AS movimientos_huerfanos,
  CASE WHEN EXISTS (SELECT 1 FROM public.cuentas_bancarias
                     WHERE id='bb840b28-6b68-4183-b501-37fe96e241e5')
       THEN 'OK  la buena sigue intacta' ELSE '*** FALLO ***' END           AS cuenta_buena,
  (SELECT count(*) FROM public.cierres_caja
    WHERE id IN ('c0ae0196-9112-4b00-8056-7a49959da8d0',
                 'de1e71a0-44dc-418a-8157-11fb64a2dc1c'))                   AS cierres_intactos,
  (SELECT string_agg(banco || ' / ' || COALESCE(alias,''), ' | ' ORDER BY banco)
     FROM public.cuentas_bancarias
    WHERE tenant_id='b39506c3-27dc-467d-830b-096731b83113')                 AS cuentas_propias_caminero;
