ALTER TABLE public.garments
  ADD COLUMN thumbnail_key text,
  ADD COLUMN thumbnail_mime text,
  ADD CONSTRAINT garment_thumbnail_owner CHECK (thumbnail_key IS NULL OR thumbnail_key LIKE user_id::text || '/%'),
  ADD CONSTRAINT garment_thumbnail_pair CHECK (
    (thumbnail_key IS NULL AND thumbnail_mime IS NULL) OR
    (thumbnail_key IS NOT NULL AND thumbnail_mime IS NOT NULL AND thumbnail_mime IN ('image/webp','image/png','image/jpeg'))
  );
