-- VIGILANTE: quien no puede pagar hoy, y por que.
--
-- >>> POR QUE EXISTE <<<
-- La regla "primero la mora y el interes, despues el capital" se rompio DOS
-- VECES en dos dias, y las dos las descubrio el dueno en el mostrador con un
-- cliente delante:
--
--   17/08  Un prestamo a cuota fija no se podia pagar: la regla exigia cubrir
--          el interes de TODAS las cuotas futuras (60,610) antes de tocar el
--          capital. 70 prestamos parados 3h25m.
--   18/08  ANDRES CARPIO no podia pagar su PT-0026583 porque su OTRO prestamo,
--          el PT-0026375, tenia 124.51 de interes corriente sin cobrar. 16
--          clientes expuestos, 21 horas.
--
-- Ninguna prueba las vio. Las pruebas del proyecto son de JavaScript y esta
-- regla vive en plpgsql: no hay nada que la ejercite. Esto lo suple.
--
-- >>> COMO MIDE <<<
-- Llama a get_prestamos_cliente, que es LA MISMA funcion que alimenta la
-- pantalla de cobro. No replica la formula del interes corriente ni la de la
-- mora: si manana cambian, el vigilante cambia solo. Una copia de esa
-- aritmetica seria un segundo sitio donde equivocarse.
--
-- >>> QUE SIGNIFICA "PRIMERO SU INTERES/MORA" <<<
-- NO significa que el prestamo no se pueda cobrar. Significa que a ESE
-- prestamo no se le puede echar dinero al CAPITAL sin cubrir antes su
-- propio interes corriente y su propia mora.
--
-- Con el PT-0026375 de ANDRES CARPIO, que debe 124.51 de interes:
--     paga 100     -> todo al interes                        ENTRA
--     paga 124.51  -> cubre el interes justo                 ENTRA
--     paga 200     -> 124.51 al interes, 75.49 al capital    ENTRA
--     paga 200 marcando los 200 como CAPITAL                 se rechaza
--
-- Y si el cajero solo teclea el monto y deja que el sistema reparta, no se
-- bloquea nunca: ese camino ya va en orden -- mora, interes, capital -- y ni
-- siquiera pasa por la validacion. El rechazo aparece solo cuando alguien
-- marca las casillas a mano y pone capital dejando el interes colgando.
--
-- >>> COMO SE LEE <<<
-- Un prestamo BLOQUEA cuando tiene interes corriente o mora propios sin
-- cobrar. Eso es correcto y es la regla del dueno: a ese prestamo hay que
-- cobrarle lo suyo antes del capital.
--
-- Lo que NO puede pasar, y es lo que hay que vigilar:
--   * un prestamo que bloquea con interes corriente 0.00 y mora 0.00
--   * un cliente que no puede pagar un prestamo libre por culpa de otro
--
-- La ultima consulta es la lista de vigilancia: los clientes con un prestamo
-- bloqueado y otro libre. Son exactamente los que rompio el fallo del 18/08.
-- Si alguno de ellos se queja de que no puede pagar el LIBRE, la regla
-- volvio a mezclarse.

-- Solo lectura. La suplantacion es local a la transaccion y no deja rastro.
BEGIN;

SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub',  (SELECT id FROM public.profiles
              WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
              ORDER BY created_at LIMIT 1),
    'role', 'authenticated')::text,
  true);

-- ===================================================================
-- 1. PRESTAMO POR PRESTAMO
-- ===================================================================
WITH clientes AS (
  SELECT DISTINCT p.cliente_id
  FROM public.prestamos p
  WHERE p.tenant_id = public.get_user_tenant() AND p.estado = 'activo'
),
estado AS (
  SELECT c.cliente_id, public.get_prestamos_cliente(c.cliente_id) AS e FROM clientes c
),
filas AS (
  SELECT s.cliente_id, f.c FROM estado s, json_array_elements(s.e->'cuotas') f(c)
),
por_prestamo AS (
  SELECT
    cliente_id,
    (c->>'prestamo_id')::uuid AS prestamo_id,
    MAX(c->>'prestamo_numero') AS prestamo,
    round(SUM(COALESCE((c->>'capital_pend')::numeric, 0)), 2) AS capital_pend,
    round(SUM(CASE WHEN COALESCE(c->>'es_interes_corriente','false') = 'true'
                   THEN COALESCE((c->>'interes_pend')::numeric, 0) ELSE 0 END), 2) AS interes_corriente,
    round(SUM(COALESCE((c->>'mora_pend')::numeric, 0)), 2) AS mora
  FROM filas
  WHERE (c->>'prestamo_id') IS NOT NULL
  GROUP BY cliente_id, (c->>'prestamo_id')::uuid
)
SELECT
  cl.nombre AS cliente,
  pp.prestamo,
  pp.capital_pend,
  pp.interes_corriente,
  pp.mora,
  CASE WHEN pp.interes_corriente > 0.01 OR pp.mora > 0.01
       THEN 'PRIMERO su interes/mora, despues el capital'
       ELSE 'capital libre' END AS situacion,
  COUNT(*) OVER (PARTITION BY pp.cliente_id) AS prestamos_del_cliente
FROM por_prestamo pp
JOIN public.clientes cl ON cl.id = pp.cliente_id
ORDER BY (pp.interes_corriente > 0.01 OR pp.mora > 0.01) DESC,
         pp.interes_corriente + pp.mora DESC,
         cl.nombre;

COMMIT;

-- ===================================================================
-- 2. EL RESUMEN
-- ===================================================================
-- Si "bloquean" se dispara de un dia para otro sin que nadie haya cambiado
-- la cartera, la regla se rompio otra vez.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id FROM public.profiles
      WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' ORDER BY created_at LIMIT 1),
    'role','authenticated')::text, true);

WITH clientes AS (
  SELECT DISTINCT p.cliente_id FROM public.prestamos p
  WHERE p.tenant_id = public.get_user_tenant() AND p.estado = 'activo'
),
estado AS (SELECT c.cliente_id, public.get_prestamos_cliente(c.cliente_id) AS e FROM clientes c),
filas AS (SELECT s.cliente_id, f.c FROM estado s, json_array_elements(s.e->'cuotas') f(c)),
pp AS (
  SELECT cliente_id, (c->>'prestamo_id')::uuid AS pid,
    round(SUM(CASE WHEN COALESCE(c->>'es_interes_corriente','false')='true'
                   THEN COALESCE((c->>'interes_pend')::numeric,0) ELSE 0 END),2) AS ic,
    round(SUM(COALESCE((c->>'mora_pend')::numeric,0)),2) AS mora
  FROM filas WHERE (c->>'prestamo_id') IS NOT NULL
  GROUP BY cliente_id, (c->>'prestamo_id')::uuid
)
SELECT count(*) AS prestamos_activos,
       count(*) FILTER (WHERE ic > 0.01 OR mora > 0.01)    AS bloquean,
       count(*) FILTER (WHERE ic > 0.01)                   AS con_interes_corriente,
       count(*) FILTER (WHERE mora > 0.01)                 AS con_mora,
       count(*) FILTER (WHERE ic <= 0.01 AND mora <= 0.01) AS libres,
       count(DISTINCT cliente_id)                          AS clientes
FROM pp;
COMMIT;

-- ===================================================================
-- 3. LA LISTA DE VIGILANCIA
-- ===================================================================
-- Clientes con un prestamo bloqueado Y otro libre. Son los que rompio el
-- fallo del 18/08: el interes de uno tapaba el capital del otro.
--
-- Los marcados LIBRE tienen que poder pagarse HOY. Si alguno de esos
-- clientes vuelve a la caja diciendo que no puede abonar al libre, la regla
-- se volvio a mezclar y hay que mirar registrar_pago_prestamo.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', (SELECT id FROM public.profiles
      WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' ORDER BY created_at LIMIT 1),
    'role','authenticated')::text, true);

WITH clientes AS (
  SELECT DISTINCT p.cliente_id FROM public.prestamos p
  WHERE p.tenant_id = public.get_user_tenant() AND p.estado = 'activo'
),
estado AS (SELECT c.cliente_id, public.get_prestamos_cliente(c.cliente_id) AS e FROM clientes c),
filas AS (SELECT s.cliente_id, f.c FROM estado s, json_array_elements(s.e->'cuotas') f(c)),
pp AS (
  SELECT cliente_id, (c->>'prestamo_id')::uuid AS pid,
    MAX(c->>'prestamo_numero') AS prestamo,
    round(SUM(CASE WHEN COALESCE(c->>'es_interes_corriente','false')='true'
                   THEN COALESCE((c->>'interes_pend')::numeric,0) ELSE 0 END),2) AS ic,
    round(SUM(COALESCE((c->>'mora_pend')::numeric,0)),2) AS mora
  FROM filas WHERE (c->>'prestamo_id') IS NOT NULL
  GROUP BY cliente_id, (c->>'prestamo_id')::uuid
),
mixtos AS (
  SELECT cliente_id FROM pp GROUP BY cliente_id
  HAVING count(*) FILTER (WHERE ic > 0.01 OR mora > 0.01) > 0
     AND count(*) FILTER (WHERE ic <= 0.01 AND mora <= 0.01) > 0
)
SELECT cl.nombre AS cliente, pp.prestamo, pp.ic AS interes_corriente, pp.mora,
       CASE WHEN pp.ic > 0.01 OR pp.mora > 0.01
            THEN 'PRIMERO su interes/mora'
            ELSE 'capital libre (tiene que poder pagarse hoy)' END AS situacion
FROM pp
JOIN mixtos m ON m.cliente_id = pp.cliente_id
JOIN public.clientes cl ON cl.id = pp.cliente_id
ORDER BY cl.nombre, situacion DESC;
COMMIT;
