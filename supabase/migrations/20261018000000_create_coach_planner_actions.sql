ALTER TABLE public.coach_messages
  ADD COLUMN IF NOT EXISTS planner_proposal jsonb;

CREATE TABLE IF NOT EXISTS public.coach_planner_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL
    REFERENCES public.coach_conversations (id) ON DELETE CASCADE,
  source_message_id uuid NOT NULL UNIQUE
    REFERENCES public.coach_messages (id) ON DELETE CASCADE,
  action jsonb NOT NULL,
  before_snapshot jsonb NOT NULL CHECK (jsonb_typeof(before_snapshot) = 'array'),
  after_snapshot jsonb NOT NULL CHECK (jsonb_typeof(after_snapshot) = 'array'),
  rationale text NOT NULL CHECK (char_length(rationale) BETWEEN 1 AND 1000),
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(assumptions) = 'array'),
  trade_offs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(trade_offs) = 'array'),
  expected_effects jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(expected_effects) = 'array'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'applied', 'stale', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  applied_at timestamptz,
  CONSTRAINT coach_planner_action_source_owner
    FOREIGN KEY (conversation_id, source_message_id)
    REFERENCES public.coach_messages (conversation_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS coach_planner_actions_user_created_idx
  ON public.coach_planner_actions (user_id, created_at DESC);

ALTER TABLE public.coach_planner_actions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.coach_planner_actions TO authenticated;

DROP POLICY IF EXISTS "Users can read their own Coach planner actions"
  ON public.coach_planner_actions;
CREATE POLICY "Users can read their own Coach planner actions"
  ON public.coach_planner_actions
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own Coach planner actions"
  ON public.coach_planner_actions;
CREATE POLICY "Users can create their own Coach planner actions"
  ON public.coach_planner_actions
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
        AND coach_messages.conversation_id = coach_planner_actions.conversation_id
        AND coach_messages.role = 'assistant'
        AND coach_messages.planner_proposal = jsonb_build_object(
          'action', action,
          'rationale', rationale,
          'assumptions', assumptions,
          'tradeOffs', trade_offs,
          'expectedEffects', expected_effects
        )
        AND coach_conversations.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update their own Coach planner actions"
  ON public.coach_planner_actions;
CREATE POLICY "Users can update their own Coach planner actions"
  ON public.coach_planner_actions
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
