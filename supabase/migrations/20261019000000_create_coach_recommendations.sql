CREATE TABLE IF NOT EXISTS public.coach_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  planner_action_id uuid UNIQUE
    REFERENCES public.coach_planner_actions (id) ON DELETE SET NULL,
  recommendation_type text NOT NULL CHECK (recommendation_type IN (
    'missed_workout',
    'recovery_adjustment',
    'volume_reduction',
    'volume_increase',
    'schedule_conflict',
    'race_preparation',
    'injury_prevention',
    'recovery_week',
    'training_load_adjustment'
  )),
  target text NOT NULL DEFAULT 'training_plan' CHECK (target IN (
    'training_plan',
    'workout',
    'recovery_plan',
    'nutrition_plan',
    'race_plan',
    'calendar_availability'
  )),
  recommendation text NOT NULL CHECK (char_length(recommendation) BETWEEN 1 AND 2000),
  reasoning jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reasoning) = 'array'),
  impact jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(impact) = 'object'),
  confidence text NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  -- "expired" is set when the plan changed before the athlete decided.
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  plan_changes jsonb CHECK (plan_changes IS NULL OR jsonb_typeof(plan_changes) = 'object'),
  CONSTRAINT coach_recommendations_decision_timestamps CHECK (
    (status = 'approved' AND approved_at IS NOT NULL AND rejected_at IS NULL)
    OR (status = 'rejected' AND rejected_at IS NOT NULL AND approved_at IS NULL)
    OR (status IN ('pending', 'expired') AND approved_at IS NULL AND rejected_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS coach_recommendations_user_created_idx
  ON public.coach_recommendations (user_id, created_at DESC);

ALTER TABLE public.coach_recommendations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.coach_recommendations TO authenticated;

DROP POLICY IF EXISTS "Users can read their own Coach recommendations"
  ON public.coach_recommendations;
CREATE POLICY "Users can read their own Coach recommendations"
  ON public.coach_recommendations
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own Coach recommendations"
  ON public.coach_recommendations;
CREATE POLICY "Users can create their own Coach recommendations"
  ON public.coach_recommendations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND status = 'pending'
    AND (
      planner_action_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.coach_planner_actions
        WHERE coach_planner_actions.id = planner_action_id
          AND coach_planner_actions.user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Users can update their own Coach recommendations"
  ON public.coach_recommendations;
CREATE POLICY "Users can update their own Coach recommendations"
  ON public.coach_recommendations
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
