-- Coach Memory Engine: derived athlete-intelligence memories live in the
-- existing coach_memories table next to athlete-confirmed chat memories.

ALTER TABLE public.coach_memories
  ALTER COLUMN source_message_id DROP NOT NULL;

ALTER TABLE public.coach_memories
  ADD COLUMN IF NOT EXISTS memory_key text,
  ADD COLUMN IF NOT EXISTS memory_type text,
  ADD COLUMN IF NOT EXISTS signal text,
  ADD COLUMN IF NOT EXISTS confidence text,
  ADD COLUMN IF NOT EXISTS evidence_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'chat',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.coach_memories
  DROP CONSTRAINT IF EXISTS coach_memories_category_check;
ALTER TABLE public.coach_memories
  ADD CONSTRAINT coach_memories_category_check
  CHECK (category IN ('recurring_preference', 'profile_information', 'athlete_pattern'));

ALTER TABLE public.coach_memories
  DROP CONSTRAINT IF EXISTS coach_memories_memory_type_check;
ALTER TABLE public.coach_memories
  ADD CONSTRAINT coach_memories_memory_type_check
  CHECK (memory_type IS NULL OR memory_type IN (
    'training_consistency', 'recovery_trends', 'injury_limitation',
    'preference', 'goal_progress'
  ));

ALTER TABLE public.coach_memories
  DROP CONSTRAINT IF EXISTS coach_memories_signal_check;
ALTER TABLE public.coach_memories
  ADD CONSTRAINT coach_memories_signal_check
  CHECK (signal IS NULL OR signal IN ('strength', 'watch', 'trend'));

ALTER TABLE public.coach_memories
  DROP CONSTRAINT IF EXISTS coach_memories_confidence_check;
ALTER TABLE public.coach_memories
  ADD CONSTRAINT coach_memories_confidence_check
  CHECK (confidence IS NULL OR confidence IN ('Low', 'Medium', 'High'));

ALTER TABLE public.coach_memories
  DROP CONSTRAINT IF EXISTS coach_memories_source_check;
ALTER TABLE public.coach_memories
  ADD CONSTRAINT coach_memories_source_check
  CHECK (source IN ('chat', 'workout_history', 'recovery_history',
                    'recommendation_history', 'plan_adherence', 'profile'));

-- One derived memory per topic per athlete; NULL keys (chat memories) never collide.
ALTER TABLE public.coach_memories
  DROP CONSTRAINT IF EXISTS coach_memories_user_key_unique;
ALTER TABLE public.coach_memories
  ADD CONSTRAINT coach_memories_user_key_unique UNIQUE (user_id, memory_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coach_memories TO authenticated;

DROP POLICY IF EXISTS "Users can create derived Coach memories" ON public.coach_memories;
CREATE POLICY "Users can create derived Coach memories"
  ON public.coach_memories FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND source_message_id IS NULL
    AND category = 'athlete_pattern'
    AND memory_key IS NOT NULL
    AND memory_type IS NOT NULL
  );

DROP POLICY IF EXISTS "Users can update derived Coach memories" ON public.coach_memories;
CREATE POLICY "Users can update derived Coach memories"
  ON public.coach_memories FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND category = 'athlete_pattern')
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND source_message_id IS NULL
    AND category = 'athlete_pattern'
  );

CREATE INDEX IF NOT EXISTS coach_memories_user_type_idx
  ON public.coach_memories (user_id, memory_type);
