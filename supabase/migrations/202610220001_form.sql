-- Run once with the project database owner. App data stays behind Node.js APIs.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'form_api') THEN CREATE ROLE form_api NOLOGIN; END IF;
END $$;
GRANT form_api TO CURRENT_USER;
GRANT USAGE ON SCHEMA public, auth TO form_api;
GRANT EXECUTE ON FUNCTION auth.uid() TO form_api;

CREATE TABLE public.garments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  category text NOT NULL CHECK (category IN ('top','bottom','shoes','outer','accessory')),
  source_url text NOT NULL DEFAULT '', features text NOT NULL DEFAULT '' CHECK (length(features) <= 240),
  image_key text NOT NULL CHECK (image_key LIKE user_id::text || '/%'),
  mime text NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/webp')),
  archived integer NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,id)
);
CREATE TABLE public.looks (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 40), state jsonb NOT NULL,
  image_key text CHECK (image_key LIKE user_id::text || '/%'),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,id)
);
CREATE TABLE public.drafts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  state jsonb NOT NULL, revision integer NOT NULL CHECK (revision > 0), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_requests (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL, request_key text NOT NULL CHECK (length(request_key) = 64), result jsonb,
  PRIMARY KEY(user_id,day,request_key)
);
CREATE INDEX garments_owner_created ON public.garments(user_id,created_at DESC);
CREATE INDEX looks_owner_created ON public.looks(user_id,created_at DESC,id DESC);
CREATE INDEX ai_requests_day ON public.ai_requests(day);

ALTER TABLE public.garments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.looks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_only ON public.garments TO form_api USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY owner_only ON public.looks TO form_api USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY owner_only ON public.drafts TO form_api USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY owner_only ON public.ai_requests TO form_api USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.garments, public.looks, public.drafts, public.ai_requests FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.garments, public.looks, public.drafts TO form_api;
GRANT SELECT, UPDATE(result) ON public.ai_requests TO form_api;

-- Serialize the quota reservation across users/instances; never hold this lock during an AI call.
CREATE FUNCTION public.reserve_ai_attempt(p_key text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  owner_id uuid := auth.uid();
  today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  inserted integer;
BEGIN
  IF owner_id IS NULL OR length(p_key) <> 64 THEN RAISE EXCEPTION 'Invalid request'; END IF;
  PERFORM pg_advisory_xact_lock(18273, 1);
  DELETE FROM public.ai_requests WHERE day < today - 7;
  IF (SELECT count(*) FROM public.ai_requests WHERE user_id = owner_id AND day = today) >= 5
     OR (SELECT count(*) FROM public.ai_requests WHERE day = today) >= 50 THEN RETURN false; END IF;
  INSERT INTO public.ai_requests(user_id,day,request_key) VALUES(owner_id,today,p_key) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_attempt(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_attempt(text) TO form_api;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('wardrobe','wardrobe',false,1600000,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=1600000,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY form_photo_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'wardrobe' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));
CREATE POLICY form_photo_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'wardrobe' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));
CREATE POLICY form_photo_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'wardrobe' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));
