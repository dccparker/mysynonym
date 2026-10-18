-- Server-side copy of the athlete's weekly plan so it survives cleared browser
-- storage, device changes and account switching.
CREATE TABLE IF NOT EXISTS public.training_plans (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  plan jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(plan) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.training_plans TO authenticated;

DROP POLICY IF EXISTS "Users can read their own training plan" ON public.training_plans;
CREATE POLICY "Users can read their own training plan"
  ON public.training_plans FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own training plan" ON public.training_plans;
CREATE POLICY "Users can create their own training plan"
  ON public.training_plans FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own training plan" ON public.training_plans;
CREATE POLICY "Users can update their own training plan"
  ON public.training_plans FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
