CREATE TABLE IF NOT EXISTS public.workout_histories (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  workouts jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(workouts) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_histories ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.workout_histories TO authenticated;

DROP POLICY IF EXISTS "Users can read their own workout history" ON public.workout_histories;
CREATE POLICY "Users can read their own workout history"
  ON public.workout_histories
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own workout history" ON public.workout_histories;
CREATE POLICY "Users can create their own workout history"
  ON public.workout_histories
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own workout history" ON public.workout_histories;
CREATE POLICY "Users can update their own workout history"
  ON public.workout_histories
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
