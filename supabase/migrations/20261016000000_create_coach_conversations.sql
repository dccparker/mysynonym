CREATE TABLE IF NOT EXISTS public.coach_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  generation_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_conversations_user_updated_idx
  ON public.coach_conversations (user_id, updated_at DESC);

ALTER TABLE public.coach_conversations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.coach_conversations TO authenticated;

DROP POLICY IF EXISTS "Users can read their own Coach conversations"
  ON public.coach_conversations;
CREATE POLICY "Users can read their own Coach conversations"
  ON public.coach_conversations
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own Coach conversations"
  ON public.coach_conversations;
CREATE POLICY "Users can create their own Coach conversations"
  ON public.coach_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own Coach conversations"
  ON public.coach_conversations;
CREATE POLICY "Users can update their own Coach conversations"
  ON public.coach_conversations
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE TABLE IF NOT EXISTS public.coach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.coach_conversations (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 12000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_messages_conversation_id_id_key
    UNIQUE (conversation_id, id)
);

CREATE INDEX IF NOT EXISTS coach_messages_conversation_created_idx
  ON public.coach_messages (conversation_id, created_at, id);

ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON TABLE public.coach_messages TO authenticated;

DROP POLICY IF EXISTS "Users can read messages in their own Coach conversations"
  ON public.coach_messages;
CREATE POLICY "Users can read messages in their own Coach conversations"
  ON public.coach_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.coach_conversations
      WHERE coach_conversations.id = coach_messages.conversation_id
        AND coach_conversations.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can add messages to their own Coach conversations"
  ON public.coach_messages;
CREATE POLICY "Users can add messages to their own Coach conversations"
  ON public.coach_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.coach_conversations
      WHERE coach_conversations.id = coach_messages.conversation_id
        AND coach_conversations.user_id = (SELECT auth.uid())
    )
  );
