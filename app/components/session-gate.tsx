"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { clearLocalAthleteData, pushPlanIfChanged, syncTrainingPlan } from "../lib/plan-sync-service";
import { supabase } from "../lib/supabase";
import { TRAINING_PLAN_UPDATED_EVENT } from "../lib/workout-storage";

/**
 * Keeps protected pages behind sign-in, isolates browser-stored data per
 * account, and backs the weekly plan up to Supabase.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "signed-in">("checking");

  useEffect(() => {
    let active = true;
    let userId: string | null = null;
    let timer: number | undefined;

    const schedulePush = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (userId) void pushPlanIfChanged(userId);
      }, 1500);
    };

    const handleSession = (id: string | null) => {
      if (!active) return;
      if (!id) {
        userId = null;
        clearLocalAthleteData();
        router.replace("/login");
        return;
      }
      if (userId !== id) {
        userId = id;
        void syncTrainingPlan(id).finally(() => active && setState("signed-in"));
      }
    };

    void supabase.auth.getSession().then(({ data }) => handleSession(data.session?.user.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") queueMicrotask(() => handleSession(null));
      else if (session) queueMicrotask(() => handleSession(session.user.id));
    });

    // Plan screens write localStorage directly, so also check periodically.
    const interval = window.setInterval(schedulePush, 10_000);
    window.addEventListener(TRAINING_PLAN_UPDATED_EVENT, schedulePush);
    const flush = () => {
      if (document.visibilityState === "hidden" && userId) void pushPlanIfChanged(userId);
    };
    document.addEventListener("visibilitychange", flush);

    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener(TRAINING_PLAN_UPDATED_EVENT, schedulePush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [router]);

  if (state === "checking") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-[#87938b]" role="status">
        <LoaderCircle aria-hidden="true" className="mr-2 animate-spin" size={16} />
        Loading your account…
      </div>
    );
  }
  return <>{children}</>;
}
