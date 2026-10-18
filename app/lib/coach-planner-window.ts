import type { PlannedSession } from "./training-plan.ts";

// The Coach only needs the planner around today. Sending a whole multi-week
// training block with full workout structure exceeded the request limits.
const PAST_DAYS = 14;
const FUTURE_DAYS = 28;
const MAX_SESSIONS = 50;

function dateString(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function shift(today: string, days: number) {
  const date = new Date(`${today}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dateString(date);
}

export function compactPlannerForCoach(planner: PlannedSession[], today: string): PlannedSession[] {
  const from = shift(today, -PAST_DAYS);
  const to = shift(today, FUTURE_DAYS);
  const origin = new Date(`${today}T00:00:00`).getTime();
  const distance = (session: PlannedSession) =>
    Math.abs(new Date(`${session.date}T00:00:00`).getTime() - origin);
  return planner
    .filter((session) => session.date >= from && session.date <= to)
    .sort((a, b) => distance(a) - distance(b))
    .slice(0, MAX_SESSIONS)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((session) => ({
      ...session,
      activities: session.activities.slice(0, 6).map((activity) => ({
        id: activity.id,
        activityType: activity.activityType,
        ...(activity.workoutType ? { workoutType: activity.workoutType } : {}),
        durationMinutes: activity.durationMinutes,
        ...(activity.distance === undefined ? {} : { distance: activity.distance }),
        intensity: activity.intensity,
        instructions: activity.instructions.slice(0, 300),
        purpose: activity.purpose.slice(0, 300),
      })),
    }));
}
