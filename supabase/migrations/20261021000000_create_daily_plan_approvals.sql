CREATE TABLE IF NOT EXISTS public.daily_plan_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_date date NOT NULL,
  session_id text,
  workout_summary text NOT NULL CHECK (char_length(workout_summary) BETWEEN 1 AND 300),
  briefing jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_date)
);

ALTER TABLE public.daily_plan_approvals ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.daily_plan_approvals TO authenticated;

DROP POLICY IF EXISTS "Users can read own daily plan approvals" ON public.daily_plan_approvals;
CREATE POLICY "Users can read own daily plan approvals"
  ON public.daily_plan_approvals FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own daily plan approvals" ON public.daily_plan_approvals;
CREATE POLICY "Users can insert own daily plan approvals"
  ON public.daily_plan_approvals FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own daily plan approvals" ON public.daily_plan_approvals;
CREATE POLICY "Users can update own daily plan approvals"
  ON public.daily_plan_approvals FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
