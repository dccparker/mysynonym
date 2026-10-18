-- Recommendation continuity: a revised recommendation supersedes the pending
-- one for the same workout, and both stay in history.

ALTER TABLE public.coach_planner_actions
  DROP CONSTRAINT IF EXISTS coach_planner_actions_status_check;
ALTER TABLE public.coach_planner_actions
  ADD CONSTRAINT coach_planner_actions_status_check
  CHECK (status IN ('pending', 'approved', 'applied', 'stale', 'rejected', 'superseded'));

ALTER TABLE public.coach_recommendations
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by_recommendation_id uuid
    REFERENCES public.coach_recommendations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_recommendation_id uuid
    REFERENCES public.coach_recommendations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_workout_id text,
  ADD COLUMN IF NOT EXISTS target_workout_date date;

ALTER TABLE public.coach_recommendations
  DROP CONSTRAINT IF EXISTS coach_recommendations_status_check;
ALTER TABLE public.coach_recommendations
  ADD CONSTRAINT coach_recommendations_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'superseded'));

ALTER TABLE public.coach_recommendations
  DROP CONSTRAINT IF EXISTS coach_recommendations_decision_timestamps;
ALTER TABLE public.coach_recommendations
  ADD CONSTRAINT coach_recommendations_decision_timestamps CHECK (
    (status = 'approved' AND approved_at IS NOT NULL AND rejected_at IS NULL)
    OR (status = 'rejected' AND rejected_at IS NOT NULL AND approved_at IS NULL)
    OR (status = 'superseded' AND superseded_at IS NOT NULL
        AND approved_at IS NULL AND rejected_at IS NULL)
    OR (status IN ('pending', 'expired') AND approved_at IS NULL AND rejected_at IS NULL)
  );

-- Backfill target workout details for existing recommendations.
UPDATE public.coach_recommendations AS recommendation
SET target_workout_id = COALESCE(
      action.action ->> 'sessionId',
      'week:' || (action.action ->> 'weekStarting')
    )
FROM public.coach_planner_actions AS action
WHERE action.id = recommendation.planner_action_id
  AND recommendation.target_workout_id IS NULL;

-- Close duplicate pending rows (keep the newest) so the unique index can be created.
UPDATE public.coach_recommendations AS older
SET status = 'superseded', superseded_at = now()
WHERE older.status = 'pending'
  AND older.target_workout_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.coach_recommendations AS newer
    WHERE newer.user_id = older.user_id
      AND newer.target_workout_id = older.target_workout_id
      AND newer.status = 'pending'
      AND (newer.created_at, newer.id) > (older.created_at, older.id)
  );

UPDATE public.coach_planner_actions AS action
SET status = 'superseded'
FROM public.coach_recommendations AS recommendation
WHERE recommendation.planner_action_id = action.id
  AND recommendation.status = 'superseded'
  AND action.status = 'pending';

-- At most one pending recommendation per user and target workout.
CREATE UNIQUE INDEX IF NOT EXISTS coach_recommendations_one_pending_per_target
  ON public.coach_recommendations (user_id, target_workout_id)
  WHERE status = 'pending' AND target_workout_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS coach_recommendations_user_target_idx
  ON public.coach_recommendations (user_id, target_workout_id, created_at DESC);
