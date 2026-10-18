import { createClient } from "@supabase/supabase-js";

// Each entry lists the columns the application reads or writes, and the
// migration that creates them.
export const PLANNER_STORAGE_REQUIREMENTS = [
  {
    table: "coach_conversations",
    columns: "id,user_id,title,generation_started_at",
    migration: "20261016000000_create_coach_conversations.sql",
  },
  {
    table: "coach_messages",
    columns: "id,conversation_id,role,content,planner_proposal",
    migration: "20261018000000_create_coach_planner_actions.sql",
  },
  {
    table: "coach_planner_actions",
    columns:
      "id,user_id,conversation_id,source_message_id,action,before_snapshot,after_snapshot,rationale,assumptions,trade_offs,expected_effects,status,created_at,approved_at,applied_at",
    migration: "20261018000000_create_coach_planner_actions.sql",
  },
  {
    table: "coach_recommendations",
    columns:
      "id,user_id,planner_action_id,recommendation_type,target,recommendation,reasoning,impact,confidence,status,created_at,approved_at,rejected_at,plan_changes",
    migration: "20261019000000_create_coach_recommendations.sql",
  },
  {
    table: "coach_recommendations",
    columns:
      "superseded_at,superseded_by_recommendation_id,source_recommendation_id,target_workout_id,target_workout_date",
    migration: "20261020000000_recommendation_supersession.sql",
  },
  {
    table: "coach_memories",
    columns: "memory_key,memory_type,signal,confidence,evidence_count,source,updated_at",
    migration: "20261022000000_athlete_intelligence_memories.sql",
  },
  {
    table: "training_plans",
    columns: "user_id,plan,updated_at",
    migration: "20261023000000_create_training_plans.sql",
  },
  {
    table: "daily_plan_approvals",
    columns: "id,user_id,plan_date,session_id,workout_summary,briefing,approved_at",
    migration: "20261021000000_create_daily_plan_approvals.sql",
  },
] as const;

export type PlannerStorageProblem = {
  table: string;
  migration: string;
  code: string;
  message: string;
};

export function isMissingStorageError(error: { code?: string } | null | undefined) {
  return ["42P01", "PGRST205", "42703", "PGRST204"].includes(error?.code ?? "");
}

/**
 * Probes each required table/column set with the public anon key. RLS makes
 * the result empty, but a missing table or column still produces an error.
 */
export async function checkPlannerStorage(): Promise<PlannerStorageProblem[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return [
      {
        table: "(all)",
        migration: "",
        code: "NO_CONFIG",
        message: "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set.",
      },
    ];
  }
  const client = createClient(url, key, { auth: { persistSession: false } });
  const problems: PlannerStorageProblem[] = [];
  await Promise.all(
    PLANNER_STORAGE_REQUIREMENTS.map(async ({ table, columns, migration }) => {
      const { error } = await client.from(table).select(columns).limit(1);
      if (error && isMissingStorageError(error)) {
        problems.push({ table, migration, code: error.code ?? "", message: error.message });
      }
    }),
  );
  return problems;
}

export function formatPlannerStorageProblems(problems: PlannerStorageProblem[]) {
  const migrations = [...new Set(problems.map((problem) => problem.migration).filter(Boolean))];
  return [
    "Planner storage is incomplete:",
    ...problems.map((problem) => `  - ${problem.table}: ${problem.message} (${problem.code})`),
    migrations.length
      ? `Apply: ${migrations.map((name) => `supabase/migrations/${name}`).join(", ")} (e.g. \`supabase db push\`, or paste the file into the Supabase SQL editor).`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
