-- =====================================================================
-- Un canal se quedo mudo
-- ---------------------------------------------------------------------
-- (2026-08-24) El dueno aviso de que dejaron de llegar conversaciones de
-- TikTok. Se investigo y no habia nada roto:
--
--   19/08 13:23   1,341 mensajes de golpe, en UN minuto
--   19/08 13:24-13:45   goteo de 1 a 3 por minuto
--   19/08 16:17   el ultimo
--   desde entonces:  nada
--
-- Eso no es un flujo cortandose: es alguien que abrio tiktok.com en el
-- navegador, el puente vacio de golpe lo que habia, siguio goteando
-- mientras la pestana estuvo abierta, y se callo al cerrarla.
--
-- El puente de TikTok (tt-mirror.js) y el de Instagram (ig-mirror.js) son
-- content scripts: SOLO existen mientras su pagina esta abierta. WhatsApp
-- no depende de eso porque tiene webhook de Meta.
--
-- >>> LO QUE DE VERDAD FALLO <<<
-- No fue TikTok. Fue que pasaron CINCO DIAS sin un solo mensaje y nadie
-- se entero. El unico chip que existe —get_omni_mirror_status— mira una
-- sola plataforma, y lo dice su propio SQL:
--
--     WHERE tenant_id = v_tenant AND platform = 'whatsapp'
--
-- TikTok e Instagram pueden estar muertos semanas sin que nada avise. Es
-- el mismo patron del cilindro: silencioso, y te enteras cuando ya
-- perdiste clientes.
--
-- >>> EL UMBRAL SALE DE CADA CANAL, NO DE LA CABEZA <<<
-- Se midio el ritmo real de Morla en 90 dias antes de escribir el numero:
--
--   whatsapp    70 dias activos   hueco mayor normal:  4 dias
--   instagram    7 dias activos   hueco mayor normal: 24 dias
--   tiktok       1 dia  activo    sin ritmo que medir
--
-- INSTAGRAM PASA HASTA 24 DIAS SIN UN MENSAJE Y ES NORMAL. Un umbral fijo
-- de 48 horas lo haria sonar cada semana — exactamente el ruido que estos
-- centinelas existen para evitar. Cada canal se compara consigo mismo.
--
-- Para un canal sin historial suficiente (TikTok, con un solo dia) no hay
-- ritmo que calcular y se usa un piso de 3 dias. En cuanto acumule unos
-- dias de uso, se calibra solo.
--
-- >>> LO QUE ESTO NO PUEDE SABER <<<
-- Con el historial de Instagram es IMPOSIBLE distinguir "el puente esta
-- roto" de "nadie ha escrito": sus huecos normales llegan a 24 dias. Este
-- centinela lo dira a los 25, no antes. No se finge una certeza que los
-- datos no dan.
--
-- Idempotente. Requiere centinelas_del_flujo.sql.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.centinela_canal_mudo(p_tenant_id uuid)
RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH dias AS (
    -- Un dia con actividad, en hora de aqui. La ventana del dia en texto
    -- pelado correria el dia cuatro horas.
    SELECT m.platform,
           (COALESCE(m.enviado_en, m.created_at) AT TIME ZONE 'America/Santo_Domingo')::date AS d
    FROM public.sales_messages m
    WHERE m.tenant_id = p_tenant_id
      AND COALESCE(m.enviado_en, m.created_at) >= now() - interval '120 days'
    GROUP BY 1, 2
  ),
  huecos AS (
    SELECT platform, d - lag(d) OVER (PARTITION BY platform ORDER BY d) AS h
    FROM dias
  ),
  ritmo AS (
    SELECT platform,
           count(*) FILTER (WHERE h IS NOT NULL) AS n_huecos,
           COALESCE(max(h), 0)                   AS hueco_mayor
    FROM huecos GROUP BY platform
  ),
  vol AS (
    SELECT m.platform,
           count(*) AS total,
           max(COALESCE(m.enviado_en, m.created_at)) AS ultimo
    FROM public.sales_messages m
    WHERE m.tenant_id = p_tenant_id
    GROUP BY 1
  ),
  juicio AS (
    SELECT v.platform, v.total, v.ultimo,
           (CURRENT_DATE - (v.ultimo AT TIME ZONE 'America/Santo_Domingo')::date) AS callado,
           CASE
             -- Con historial: su propio hueco mayor mas un dia de margen.
             WHEN r.n_huecos >= 5 THEN GREATEST(r.hueco_mayor + 1, 3)
             -- Sin ritmo que medir todavia.
             ELSE 3
           END AS umbral,
           r.hueco_mayor, r.n_huecos
    FROM vol v
    LEFT JOIN ritmo r ON r.platform = v.platform
    -- Un canal con cuatro mensajes en su vida no es un canal.
    WHERE v.total >= 20
  )
  SELECT
    j.platform,
    format('%s lleva %s dias sin recibir un mensaje', upper(j.platform), j.callado),
    format('%s no recibe nada desde el %s (%s dias). %s %s',
           upper(j.platform),
           to_char(j.ultimo AT TIME ZONE 'America/Santo_Domingo', 'DD/MM'),
           j.callado,
           CASE WHEN j.n_huecos >= 5
                THEN format('Lo normal en este canal es que no pase de %s dias.', j.hueco_mayor)
                ELSE 'Este canal no tiene todavia historial suficiente para saber su ritmo.' END,
           CASE
             WHEN j.platform IN ('tiktok', 'instagram')
               THEN format('Este puente solo funciona con %s.com abierto en el navegador: si la pestana esta cerrada, no entra nada.',
                           j.platform)
             WHEN j.platform = 'whatsapp'
               THEN 'Revisa que WhatsApp Web tenga la sesion iniciada y el panel abierto.'
             ELSE ''
           END),
    NULL::numeric,
    jsonb_build_object('canal', j.platform, 'dias_callado', j.callado,
                       'umbral_dias', j.umbral, 'hueco_normal', j.hueco_mayor,
                       'ultimo_mensaje', j.ultimo, 'mensajes_totales', j.total)
  FROM juicio j
  WHERE j.callado > j.umbral
  ORDER BY j.callado DESC;
$fn$;

INSERT INTO public.centinelas (clave, titulo, familia, severidad, funcion, descripcion, orden) VALUES
  ('canal_mudo', 'Un canal de venta se quedo mudo',
   'silencio', 'amarillo', 'centinela_canal_mudo',
   'Canal que recibia mensajes y dejo de hacerlo mas alla de su propio ritmo. TikTok e Instagram dependen de tener su pagina abierta.', 45)
ON CONFLICT (clave) DO UPDATE
  SET titulo = EXCLUDED.titulo, familia = EXCLUDED.familia,
      severidad = EXCLUDED.severidad, funcion = EXCLUDED.funcion,
      descripcion = EXCLUDED.descripcion, orden = EXCLUDED.orden;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('centinela_canal_mudo.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Lo que ve hoy, con el porque de cada decision al lado.
SELECT (h).huella AS canal, (h).titulo
FROM (SELECT public.centinela_canal_mudo('00000000-0000-0000-0000-000000000001'::uuid) h) t;

-- Y el cuadro completo: por que suena TikTok y por que NO suena Instagram.
WITH dias AS (
  SELECT m.platform, (COALESCE(m.enviado_en,m.created_at) AT TIME ZONE 'America/Santo_Domingo')::date d
  FROM public.sales_messages m
  WHERE m.tenant_id='00000000-0000-0000-0000-000000000001'
    AND COALESCE(m.enviado_en,m.created_at) >= now()-interval '120 days'
  GROUP BY 1,2),
huecos AS (SELECT platform, d - lag(d) OVER (PARTITION BY platform ORDER BY d) h FROM dias),
ritmo AS (SELECT platform, count(*) FILTER (WHERE h IS NOT NULL) n, COALESCE(max(h),0) mayor FROM huecos GROUP BY 1)
SELECT v.platform,
       (CURRENT_DATE - (max(COALESCE(v.enviado_en,v.created_at)) AT TIME ZONE 'America/Santo_Domingo')::date) AS callado,
       CASE WHEN r.n >= 5 THEN GREATEST(r.mayor+1,3) ELSE 3 END AS umbral,
       CASE WHEN (CURRENT_DATE - (max(COALESCE(v.enviado_en,v.created_at)) AT TIME ZONE 'America/Santo_Domingo')::date)
                 > CASE WHEN r.n >= 5 THEN GREATEST(r.mayor+1,3) ELSE 3 END
            THEN 'SUENA' ELSE 'callado a proposito' END AS veredicto
FROM public.sales_messages v
LEFT JOIN ritmo r ON r.platform = v.platform
WHERE v.tenant_id='00000000-0000-0000-0000-000000000001'
GROUP BY v.platform, r.n, r.mayor
ORDER BY 2 DESC;
