"use client";

import { Plus, Trash2 } from "lucide-react";
import type { PlannedActivity } from "../lib/training-plan";
import {
  catalogEntry,
  workoutTypesForSport,
  WORKOUT_SPORTS,
  type WorkoutExercise,
} from "../lib/workout-catalog";

const inputClass =
  "min-h-10 rounded-lg border border-white/[0.08] bg-[#0b100e] px-3 text-sm text-[#e5ebe6] outline-none placeholder:text-[#56625b] focus:border-[#b8f36b]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b]";
const labelClass = "grid gap-2 text-xs font-medium text-[#a6b1a9]";

export function WorkoutTypeSelect({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (workoutType: string) => void;
}) {
  return (
    <label className={labelClass}>
      Workout Type
      <select className={inputClass} onChange={(event) => onChange(event.currentTarget.value)} value={value ?? ""}>
        <option value="">Custom workout</option>
        {WORKOUT_SPORTS.map((sport) => (
          <optgroup key={sport} label={sport}>
            {workoutTypesForSport(sport).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

type Patch = Partial<PlannedActivity>;

export function WorkoutStructureEditor({
  activity,
  onChange,
}: {
  activity: PlannedActivity;
  onChange: (patch: Patch) => void;
}) {
  const exercises = activity.exercises ?? [];
  const setExercise = (index: number, patch: Partial<WorkoutExercise>) =>
    onChange({ exercises: exercises.map((item, position) => (position === index ? { ...item, ...patch } : item)) });
  const field = (label: string, key: "warmUp" | "mainSet" | "coolDown" | "easierOption" | "harderOption") => (
    <label className={`${labelClass} sm:col-span-2`}>
      {label}
      <textarea
        className={`${inputClass} min-h-14 py-2.5`}
        maxLength={600}
        onChange={(event) => onChange({ [key]: event.currentTarget.value })}
        value={activity[key] ?? ""}
      />
    </label>
  );
  return (
    <details className="grid gap-3 rounded-lg border border-white/[0.07] p-3 sm:col-span-2" open={Boolean(activity.workoutType)}>
      <summary className="cursor-pointer text-[11px] font-semibold text-[#c5ef97]">
        Workout structure (warm-up, main set, exercises)
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {field("Warm-up", "warmUp")}
        {field("Main set", "mainSet")}
        {field("Cooldown", "coolDown")}
        <label className={`${labelClass} sm:col-span-2`}>
          Equipment (comma separated)
          <input
            className={inputClass}
            onChange={(event) =>
              onChange({
                equipment: event.currentTarget.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
            value={(activity.equipment ?? []).join(", ")}
          />
        </label>
        {field("Easier option", "easierOption")}
        {field("Harder option", "harderOption")}
        <div className="grid gap-2 sm:col-span-2">
          <p className="text-xs font-semibold text-[#e5ebe6]">Exercises</p>
          {exercises.map((exercise, index) => (
            <div className="grid grid-cols-2 gap-2 rounded-md border border-white/[0.06] p-2 sm:grid-cols-5" key={index}>
              <input
                aria-label={`Exercise ${index + 1} name`}
                className={`${inputClass} col-span-2 sm:col-span-5`}
                maxLength={80}
                onChange={(event) => setExercise(index, { name: event.currentTarget.value })}
                placeholder="Exercise name"
                value={exercise.name}
              />
              <input
                aria-label={`Exercise ${index + 1} sets`}
                className={inputClass}
                min="1"
                onChange={(event) =>
                  setExercise(index, { sets: event.currentTarget.value === "" ? undefined : Number(event.currentTarget.value) })
                }
                placeholder="Sets"
                type="number"
                value={exercise.sets ?? ""}
              />
              <input
                aria-label={`Exercise ${index + 1} reps`}
                className={inputClass}
                maxLength={40}
                onChange={(event) => setExercise(index, { reps: event.currentTarget.value || undefined })}
                placeholder="Reps"
                value={exercise.reps ?? ""}
              />
              <input
                aria-label={`Exercise ${index + 1} distance`}
                className={inputClass}
                maxLength={40}
                onChange={(event) => setExercise(index, { distance: event.currentTarget.value || undefined })}
                placeholder="Distance"
                value={exercise.distance ?? ""}
              />
              <input
                aria-label={`Exercise ${index + 1} load`}
                className={inputClass}
                maxLength={60}
                onChange={(event) => setExercise(index, { load: event.currentTarget.value || undefined })}
                placeholder="Load"
                value={exercise.load ?? ""}
              />
              <button
                aria-label={`Remove exercise ${index + 1}`}
                className="justify-self-start rounded-md p-2 text-[#f0b47c]"
                onClick={() => onChange({ exercises: exercises.filter((_, position) => position !== index) })}
                type="button"
              >
                <Trash2 aria-hidden="true" size={14} />
              </button>
            </div>
          ))}
          <button
            className="justify-self-start rounded-md border border-white/[0.08] px-3 py-2 text-[10px] text-[#c5ef97]"
            onClick={() => onChange({ exercises: [...exercises, { name: "", sets: 3, reps: "10" }].slice(0, 20) })}
            type="button"
          >
            <Plus aria-hidden="true" className="mr-1 inline" size={12} /> Add custom exercise
          </button>
        </div>
      </div>
    </details>
  );
}

function formatExercise(exercise: WorkoutExercise): string {
  const volume = [
    exercise.sets && exercise.reps ? `${exercise.sets} x ${exercise.reps}` : exercise.sets ? `${exercise.sets} sets` : exercise.reps,
    exercise.distance,
    exercise.load,
  ].filter(Boolean);
  return `${exercise.name}${volume.length ? ` — ${volume.join(" · ")}` : ""}${exercise.notes ? ` (${exercise.notes})` : ""}`;
}

/** Read-only structured detail for a planned activity. */
export function WorkoutStructureDetails({ activity }: { activity: PlannedActivity }) {
  const sport = catalogEntry(activity.workoutType)?.sport;
  const sections: Array<[string, string | undefined]> = [
    ["Warm-up", activity.warmUp],
    ["Main set", activity.mainSet],
    ["Cooldown", activity.coolDown],
    ["Easier option", activity.easierOption],
    ["Harder option", activity.harderOption],
  ];
  const hasDetail = sections.some(([, text]) => text) || activity.equipment?.length || activity.exercises?.length;
  if (!hasDetail) return null;
  return (
    <div className="mt-2 grid gap-1.5 text-[11px] text-[#a6b1a9]">
      {sport && <p className="font-semibold text-[#c5ef97]">{activity.workoutType} · {sport}</p>}
      {sections.map(([label, text]) =>
        text ? (
          <p key={label}>
            <span className="font-semibold text-[#e5ebe6]">{label}:</span> {text}
          </p>
        ) : null,
      )}
      {activity.equipment?.length ? (
        <p>
          <span className="font-semibold text-[#e5ebe6]">Equipment:</span> {activity.equipment.join(", ")}
        </p>
      ) : null}
      {activity.exercises?.length ? (
        <div>
          <p className="font-semibold text-[#e5ebe6]">Exercises</p>
          <ul className="ml-4 list-disc">
            {activity.exercises.map((exercise, index) => (
              <li key={index}>{formatExercise(exercise)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
