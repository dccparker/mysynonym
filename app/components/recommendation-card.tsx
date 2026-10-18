"use client";

import { useState } from "react";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import type {
  CoachMessage,
  CoachPlannerActionStatus,
  SavedCoachPlannerAction,
} from "../lib/coach-chat-types";
import { splitProposalDetails } from "../lib/coach-chat-types";
import {
  IMPACT_LABELS,
  RECOMMENDATION_TYPE_LABELS,
  type RecommendationConfidence,
  type RecommendationImpact,
} from "../lib/coach-recommendation-types";
import type { PlannedSession } from "../lib/training-plan";

function sessionMinutes(session: PlannedSession) {
  return session.activities.reduce((total, activity) => total + activity.durationMinutes, 0);
}

function describeSession(session: PlannedSession) {
  const intensities = [...new Set(session.activities.map((activity) => activity.intensity))].join("/");
  return `${session.date} (${session.day}) · ${session.title} · ${sessionMinutes(session)} min · ${intensities}`;
}

function diffPlans(before: PlannedSession[], after: PlannedSession[]) {
  const beforeById = new Map(before.map((session) => [session.id, session]));
  const afterById = new Map(after.map((session) => [session.id, session]));
  return {
    removed: before.filter((session) => !afterById.has(session.id)),
    added: after.filter((session) => !beforeById.has(session.id)),
    changed: after.flatMap((session) => {
      const previous = beforeById.get(session.id);
      return previous && JSON.stringify(previous) !== JSON.stringify(session)
        ? [{ before: previous, after: session }]
        : [];
    }),
  };
}

export const CONFIDENCE_LABELS: Record<RecommendationConfidence, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const CONFIDENCE_STYLES: Record<RecommendationConfidence, string> = {
  high: "border-[#b8f36b]/40 bg-[#b8f36b]/10 text-[#b8f36b]",
  medium: "border-amber-300/40 bg-amber-300/10 text-amber-200",
  low: "border-red-300/40 bg-red-300/10 text-red-200",
};

export function ConfidenceBadge({ confidence }: { confidence: RecommendationConfidence }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CONFIDENCE_STYLES[confidence]}`}
    >
      {CONFIDENCE_LABELS[confidence]}
    </span>
  );
}

export function ImpactList({ impact }: { impact: RecommendationImpact }) {
  return (
    <ul className="mt-1 space-y-0.5">
      {(Object.keys(IMPACT_LABELS) as Array<keyof RecommendationImpact>).map((key) => (
        <li key={key} className="break-words">
          <span className="text-[#8c9990]">{IMPACT_LABELS[key]}: </span>
          {impact[key] || "Not assessed"}
        </li>
      ))}
    </ul>
  );
}

const STATUS_DISPLAY: Record<
  CoachPlannerActionStatus,
  { label: string; tone: string; icon: typeof Clock3 }
> = {
  pending: { label: "Pending", tone: "text-amber-200", icon: Clock3 },
  approved: { label: "Approved · applying", tone: "text-[#b8f36b]", icon: CheckCircle2 },
  applied: { label: "Approved", tone: "text-[#b8f36b]", icon: CheckCircle2 },
  stale: { label: "Out of date · your planner changed", tone: "text-[#a6b1a9]", icon: XCircle },
  rejected: { label: "Rejected", tone: "text-red-200", icon: XCircle },
  superseded: { label: "Superseded · replaced by a newer recommendation", tone: "text-[#a6b1a9]", icon: XCircle },
};

export function RecommendationCard({
  message,
  action,
  error,
  confirmation,
  busy,
  replaced = false,
  onApprove,
  onReject,
}: {
  message: CoachMessage;
  action: SavedCoachPlannerAction | undefined;
  error: string | undefined;
  confirmation: string | undefined;
  busy: boolean;
  replaced?: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const proposal = message.plannerProposal;
  if (!proposal) return null;
  const details = splitProposalDetails(proposal);
  const diff = action ? diffPlans(action.beforePlan, action.afterPlan) : null;
  // A later card for the same workout makes an undecided card read-only.
  const effectiveStatus: CoachPlannerActionStatus | null =
    replaced && (!action || action.status === "pending") ? "superseded" : (action?.status ?? null);
  const status = effectiveStatus ? STATUS_DISPLAY[effectiveStatus] : null;
  const StatusIcon = status?.icon;
  const sections = [
    ["Evidence used", details.evidence],
    ["Assumptions", details.assumptions],
    ["Trade-offs", details.tradeOffs],
    ["Expected downstream effects", details.expectedEffects],
    ["Uncertainty", details.uncertainty],
    ["Main alternative considered", details.alternatives],
  ] as const;
  const hasMore = sections.some(([, items]) => items.length > 0);
  return (
    <section
      aria-label="Coach recommendation"
      className="mt-2 rounded-xl border border-[#b8f36b]/25 bg-[#0b100e] p-3 text-xs text-[#c2cdc5]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-[#d6ded8]">
          {details.recommendationType
            ? RECOMMENDATION_TYPE_LABELS[details.recommendationType]
            : "Recommendation"}
        </p>
        {status && StatusIcon && (
          <span className={`inline-flex items-center gap-1 font-semibold ${status.tone}`}>
            <StatusIcon className="size-3.5" aria-hidden="true" />
            {status.label}
          </span>
        )}
      </div>

      <p className="mt-3 font-semibold text-[#d6ded8]">Why</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {details.why.map((line, index) => <li key={index} className="break-words">{line}</li>)}
      </ul>

      <p className="mt-3 font-semibold text-[#d6ded8]">Impact</p>
      <ImpactList impact={details.impact} />

      <p className="mt-3 flex items-center gap-2 font-semibold text-[#d6ded8]">
        Confidence
        <ConfidenceBadge confidence={details.confidence ?? "medium"} />
      </p>

      {diff && (
        <div className="mt-3 space-y-1 rounded-lg border border-white/[0.08] p-2">
          <p className="font-semibold text-[#a6b1a9]">Before → After</p>
          {diff.changed.map(({ before, after }) => (
            <p key={after.id} className="break-words">
              <span className="text-red-200">Before: {describeSession(before)}</span>
              <br />
              <span className="text-[#b8f36b]">After: {describeSession(after)}</span>
            </p>
          ))}
          {diff.removed.map((session) => (
            <p key={session.id} className="break-words text-red-200">− {describeSession(session)}</p>
          ))}
          {diff.added.map((session) => (
            <p key={session.id} className="break-words text-[#b8f36b]">+ {describeSession(session)}</p>
          ))}
          {!diff.changed.length && !diff.removed.length && !diff.added.length && (
            <p>No planner sessions would change.</p>
          )}
          <p className="pt-1 text-[10px] text-[#77837a]">
            Completed sessions and your workout history are never changed.
          </p>
        </div>
      )}
      {showMore && sections.map(([label, items]) =>
        items.length ? (
          <div key={label} className="mt-2">
            <p className="font-semibold text-[#a6b1a9]">{label}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {items.map((item, index) => <li key={index} className="break-words">{item}</li>)}
            </ul>
          </div>
        ) : null,
      )}
      {error && <p role="alert" className="mt-2 text-red-200">{error}</p>}
      {!action && !error && !replaced && <p className="mt-2 text-[#8c9990]">Preparing preview…</p>}
      {confirmation && (
        <p role="status" className="mt-2 font-semibold text-[#d6ded8]">{confirmation}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {effectiveStatus === "pending" && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={onApprove}
              className="rounded-lg bg-[#b8f36b] px-3 py-2 text-xs font-semibold text-[#182014] disabled:opacity-50"
            >
              {busy ? "Working…" : "Approve Recommendation"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onReject}
              className="rounded-lg border border-white/[0.12] px-3 py-2 text-xs font-semibold text-[#d6ded8] disabled:opacity-50"
            >
              Reject Recommendation
            </button>
          </>
        )}
        {hasMore && (
          <button
            type="button"
            aria-expanded={showMore}
            onClick={() => setShowMore((current) => !current)}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-[#b8f36b] hover:underline"
          >
            {showMore ? "Show less" : "Explain More"}
          </button>
        )}
      </div>
    </section>
  );
}
