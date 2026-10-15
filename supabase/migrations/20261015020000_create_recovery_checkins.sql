CREATE TABLE IF NOT EXISTS public.recovery_checkins (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  check_in_date date NOT NULL,
  check_in jsonb NOT NULL CHECK (jsonb_typeof(check_in) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, check_in_date)
);

ALTER TABLE public.recovery_checkins ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.recovery_checkins TO authenticated;

DROP POLICY IF EXISTS "Users can read their own recovery check-ins" ON public.recovery_checkins;
CREATE POLICY "Users can read their own recovery check-ins"
  ON public.recovery_checkins
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own recovery check-ins" ON public.recovery_checkins;
CREATE POLICY "Users can create their own recovery check-ins"
  ON public.recovery_checkins
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own recovery check-ins" ON public.recovery_checkins;
CREATE POLICY "Users can update their own recovery check-ins"
  ON public.recovery_checkins
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
