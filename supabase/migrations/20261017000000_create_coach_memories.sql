ALTER TABLE public.coach_messages
  ADD COLUMN IF NOT EXISTS memory_observation jsonb;

CREATE TABLE IF NOT EXISTS public.coach_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  source_message_id uuid NOT NULL UNIQUE
    REFERENCES public.coach_messages (id) ON DELETE CASCADE,
  category text NOT NULL
    CHECK (category IN ('recurring_preference', 'profile_information')),
  detail text NOT NULL CHECK (char_length(detail) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_memories_user_created_idx
  ON public.coach_memories (user_id, created_at DESC);

ALTER TABLE public.coach_memories ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON TABLE public.coach_memories TO authenticated;

DROP POLICY IF EXISTS "Users can read their own Coach memories"
  ON public.coach_memories;
CREATE POLICY "Users can read their own Coach memories"
  ON public.coach_memories
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own Coach memories"
  ON public.coach_memories;
CREATE POLICY "Users can create their own Coach memories"
  ON public.coach_memories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.coach_messages
      JOIN public.coach_conversations
        ON coach_conversations.id = coach_messages.conversation_id
      WHERE coach_messages.id = source_message_id
        AND coach_messages.role = 'assistant'
        AND coach_messages.memory_observation ->> 'category' = category
        AND coach_messages.memory_observation ->> 'detail' = detail
        AND coach_conversations.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can remove their own Coach memories"
  ON public.coach_memories;
CREATE POLICY "Users can remove their own Coach memories"
  ON public.coach_memories
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
