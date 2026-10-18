"use client";

import { useCallback, useEffect, useState } from "react";
import { useAthleteProfile } from "../lib/athlete-profile";
import { groupInsights, MEMORY_TYPE_LABELS, type DerivedMemory } from "../lib/athlete-intelligence";
import { syncAthleteMemories } from "../lib/athlete-intelligence-service";
import { localRecoveryDate, RECOVERY_CHECKINS_UPDATED_EVENT } from "../lib/recovery-checkin";
import { supabase } from "../lib/supabase";
import { TRAINING_PLAN_UPDATED_EVENT, WORKOUTS_UPDATED_EVENT } from "../lib/workout-storage";
import { readPlan } from "./daily-coaching-plan";

const GROUPS = [
  { id: "strengths", title: "Top Strengths", empty: "Strengths appear as the coach sees consistent results.", tone: "text-[#b8f36b]" },
  { id: "watchAreas", title: "Watch Areas", empty: "Nothing concerning right now.", tone: "text-amber-300" },
  { id: "emerging", title: "Emerging Trends", empty: "Trends appear after a couple of weeks of data.", tone: "text-sky-300" },
] as const;

export function CoachInsights() {
  const { profile, isProfileLoaded } = useAthleteProfile();
  const [memories, setMemories] = useState<DerivedMemory[] | null>(null);

  const refresh = useCallback(async () => {
    if (!isProfileLoaded) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setMemories([]);
      return;
    }
    setMemories(await syncAthleteMemories(data.user.id, profile, readPlan(), localRecoveryDate()));
  }, [isProfileLoaded, profile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const handler = () => void refresh();
    const events = [TRAINING_PLAN_UPDATED_EVENT, WORKOUTS_UPDATED_EVENT, RECOVERY_CHECKINS_UPDATED_EVENT];
    events.forEach((name) => window.addEventListener(name, handler));
    return () => events.forEach((name) => window.removeEventListener(name, handler));
  }, [refresh]);

  if (memories === null) return null;
  const insights = groupInsights(memories);

  return (
    <section className="rounded-lg border border-white/[0.07] bg-[#111714] p-5" aria-label="Coach Insights">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#b8f36b]">Coach Insights</p>
      <p className="mt-1 text-sm text-white/60">What your coach has learned from your training, recovery and decisions.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {GROUPS.map((group) => (
          <div key={group.id}>
            <h3 className={`text-xs font-semibold uppercase tracking-wide ${group.tone}`}>{group.title}</h3>
            {insights[group.id].length === 0 ? (
              <p className="mt-2 text-sm text-white/45">{group.empty}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {insights[group.id].map((item) => (
                  <li key={item.key} className="text-sm text-white/80">
                    {item.memory}
                    <span className="mt-0.5 block text-[11px] text-white/40">
                      {MEMORY_TYPE_LABELS[item.type]} · {item.confidence} confidence
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
