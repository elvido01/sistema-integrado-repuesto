CREATE OR REPLACE VIEW public.social_performance_latest
WITH (security_invoker = true) AS
SELECT p.id AS post_id,
       p.tenant_id,
       p.platform,
       p.post_type,
       p.producto_id,
       p.title,
       p.external_url,
       p.source_provider,
       p.published_at,
       m.snapshot_date,
       m.captured_at,
       m.views,
       m.likes,
       m.comments,
       m.shares,
       m.saves,
       m.clicks,
       m.reach,
       m.impressions,
       m.origen,
       p.external_post_id
FROM public.social_posts p
LEFT JOIN LATERAL (
  SELECT x.*
  FROM public.social_post_metrics x
  WHERE x.post_id = p.id
  ORDER BY x.captured_at DESC, x.id DESC
  LIMIT 1
) m ON true;
