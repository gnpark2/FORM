ALTER TABLE public.garments ADD COLUMN subcategories jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(subcategories) = 'array' AND jsonb_array_length(subcategories) <= 12);

CREATE TABLE public.subcategories (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  category text NOT NULL CHECK (category IN ('top','bottom','shoes','outer','accessory')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 24),
  PRIMARY KEY(user_id,id), UNIQUE(user_id,category,name)
);
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_only ON public.subcategories TO form_api
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.subcategories FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcategories TO form_api;
