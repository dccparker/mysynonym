"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "../lib/supabase";
import { listRecommendations } from "../lib/coach-recommendations";
import {
  RECOMMENDATION_TYPE_LABELS,
  type CoachRecommendation,
  type RecommendationStatus,
} from "../lib/coach-recommendation-types";
import { ConfidenceBadge, ImpactList } from "./recommendation-card";

const STATUS_LABELS: Record<RecommendationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  superseded: "Superseded",
};

const STATUS_TONES: Record<RecommendationStatus, string> = {
  pending: "text-amber-200",
  approved: "text-[#b8f36b]",
  rejected: "text-red-200",
  expired: "text-[#87938b]",
  superseded: "text-[#87938b]",
};

function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function RecommendationHistory() {
  const [items, setItems] = useState<CoachRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          if (active) setItems([]);
          return;
        }
        const recommendations = await listRecommendations(supabase);
        if (active) {
          setItems(recommendations);
          setError("");
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Please try again.");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void load();
    const { data } = supabase.auth.onAuthStateChange(() => void load());
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <section
      aria-labelledby="recommendation-history-heading"
      className="rounded-lg border border-white/[0.07] bg-[#111714] p-4 sm:p-5"
    >
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden="true" className="text-[#b8f36b]" size={16} />
        <h2 className="text-sm font-semibold text-[#e5ebe6]" id="recommendation-history-heading">
          Coach Recommendations
        </h2>
        {!isLoading && (
          <span className="ml-auto text-[10px] text-[#78857d]">
            {items.length} {items.length === 1 ? "recommendation" : "recommendations"}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs text-[#f0b47c]">
          Recommendations could not be loaded: {error}
        </p>
      )}
      {isLoading ? (
        <p className="mt-4 text-xs text-[#87938b]">Loading recommendations…</p>
      ) : items.length === 0 && !error ? (
        <p className="mt-4 rounded-lg border border-white/[0.06] bg-[#0b100e] p-3 text-xs text-[#87938b]">
          No coach recommendations yet. Tell the AI Coach about a missed workout or schedule change.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {items.map((item) => {
            const decided = item.approvedAt ?? item.rejectedAt;
            const open = openId === item.id;
            return (
              <li key={item.id} className="rounded-lg border border-white/[0.06] bg-[#0b100e] p-3 text-xs text-[#c2cdc5]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold text-[#e5ebe6]">
                    {RECOMMENDATION_TYPE_LABELS[item.recommendationType]}
                  </span>
                  <span className={`font-semibold ${STATUS_TONES[item.status]}`}>
                    {STATUS_LABELS[item.status]}
                  </span>
                  <span className="text-[#78857d]">Recommended {formatDate(item.createdAt)}</span>
                  {decided && (
                    <span className="text-[#78857d]">
                      {item.approvedAt ? "Approved" : "Rejected"} {formatDate(decided)}
                    </span>
                  )}
                </div>
                <p className="mt-2 break-words">{item.recommendation}</p>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? "" : item.id)}
                  className="mt-2 font-semibold text-[#b8f36b] hover:underline"
                >
                  {open ? "Hide details" : "Details"}
                </button>
                {open && (
                  <div className="mt-2 space-y-3">
                    {item.status === "superseded" && (
                      <p className="text-[#87938b]">
                        Replaced by a revised recommendation{item.supersededAt ? ` on ${formatDate(item.supersededAt)}` : ""}.
                      </p>
                    )}
                    {item.sourceRecommendationId && (
                      <p className="text-[#87938b]">Revises an earlier recommendation.</p>
                    )}
                    <div>
                      <p className="font-semibold text-[#a6b1a9]">Why</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {item.reasoning.map((line, index) => <li key={index}>{line}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold text-[#a6b1a9]">Impact</p>
                      <ImpactList impact={item.impact} />
                    </div>
                    <p className="flex items-center gap-2 font-semibold text-[#a6b1a9]">
                      Confidence <ConfidenceBadge confidence={item.confidence} />
                    </p>
                    {item.planChanges && item.planChanges.changes.length > 0 && (
                      <div>
                        <p className="font-semibold text-[#a6b1a9]">
                          {item.status === "approved" ? "Plan changes" : "Proposed plan changes"}
                        </p>
                        {item.planChanges.changes.map((change) => (
                          <p key={`${change.entityId}-${change.summary}`} className="mt-1 break-words">
                            {change.summary}
                            {change.before && <><br /><span className="text-red-200">− {change.before}</span></>}
                            {change.after && <><br /><span className="text-[#b8f36b]">+ {change.after}</span></>}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
