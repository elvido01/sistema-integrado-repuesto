-- Keep verified provider publications and daily measurement snapshots distinct.
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS source_provider text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS social_posts_external_identity_idx
  ON public.social_posts (tenant_id, platform, external_post_id)
  WHERE external_post_id IS NOT NULL AND external_post_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS social_posts_source_identity_idx
  ON public.social_posts (tenant_id, source_provider, source_record_id, platform)
  WHERE source_provider IS NOT NULL AND source_record_id IS NOT NULL;

ALTER TABLE public.social_post_metrics
  ADD COLUMN IF NOT EXISTS snapshot_date date;

CREATE UNIQUE INDEX IF NOT EXISTS social_post_metrics_daily_source_idx
  ON public.social_post_metrics (post_id, origen, snapshot_date)
  WHERE snapshot_date IS NOT NULL;

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
       m.origen
FROM public.social_posts p
LEFT JOIN LATERAL (
  SELECT x.*
  FROM public.social_post_metrics x
  WHERE x.post_id = p.id
  ORDER BY x.captured_at DESC, x.id DESC
  LIMIT 1
) m ON true;
