"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import {
  emptyAthleteProfile,
  profileActivities,
  profileGoals,
  saveAthleteProfile,
  useAthleteProfile,
  weekDays,
  type AthleteProfile,
} from "../lib/athlete-profile";

const inputClass =
  "min-h-10 rounded-lg border border-white/[0.08] bg-[#0b100e] px-3 text-sm text-[#e5ebe6] outline-none placeholder:text-[#56625b] focus:border-[#b8f36b]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b]";
const labelClass = "grid gap-2 text-xs font-medium text-[#a6b1a9]";
const cardClass = "rounded-lg border border-white/[0.07] bg-[#111714] p-5 sm:p-6";
const experiences = ["Beginner", "Intermediate", "Advanced", "Competitive"] as const;
const equipmentOptions = [
  "Road bike",
  "Indoor bike trainer",
  "Treadmill",
  "Running access",
  "Pool access",
  "Open-water swimming access",
  "Gym access",
  "Strength equipment",
] as const;

function ProfileSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={cardClass}>
      <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#eef2ed]">{title}</h2>
      {description && <p className="mt-1.5 text-xs leading-relaxed text-[#87938b]">{description}</p>}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <fieldset className="grid gap-2 sm:col-span-2">
      <legend className="text-xs font-medium text-[#a6b1a9]">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value.includes(option);
          return (
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#b8f36b] ${
                selected
                  ? "border-[#b8f36b]/30 bg-[#b8f36b]/[0.08] text-[#c5ef97]"
                  : "border-white/[0.08] text-[#a6b1a9] hover:border-white/20"
              }`}
              key={option}
            >
              <input
                checked={selected}
                className="accent-[#b8f36b]"
                onChange={() =>
                  onChange(
                    selected ? value.filter((item) => item !== option) : [...value, option],
                  )
                }
                type="checkbox"
                value={option}
              />
              {option}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function dateIsValid(value: string): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function convertToDisplayNumber(value: number | null, units: "Metric" | "Imperial", factor: number) {
  return value === null ? "" : String(Number((units === "Imperial" ? value * factor : value).toFixed(2)));
}

export default function SettingsPage() {
  const { profile: savedProfile, isProfileLoaded, profileError } = useAthleteProfile();
  const [draftProfile, setDraftProfile] = useState<AthleteProfile | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const profile = draftProfile ?? savedProfile ?? emptyAthleteProfile;
  const units = profile.units;
  const totalHeightInches =
    profile.heightCm === null ? null : Math.round(profile.heightCm / 2.54);
  const heightFeet = totalHeightInches === null ? "" : String(Math.floor(totalHeightInches / 12));
  const heightInches = totalHeightInches === null ? "" : String(totalHeightInches % 12);
  const hasUnsavedChanges =
    draftProfile !== null &&
    JSON.stringify(draftProfile) !== JSON.stringify(savedProfile ?? emptyAthleteProfile);
  const completenessItems = [
    ["Preferred name", Boolean(profile.preferredName.trim())],
    ["Date of birth", Boolean(profile.dateOfBirth)],
    ["Height", profile.heightCm !== null],
    ["Weight", profile.weightKg !== null],
    ["Unit preference", Boolean(profile.units)],
    ["Primary goal", Boolean(profile.primaryGoal)],
    ["Training experience", Boolean(profile.trainingExperience)],
    ["Weekly training hours", profile.weeklyTrainingHours !== null],
    ["Available training days", profile.availableTrainingDays.length > 0],
  ] as const;
  const completedCount = completenessItems.filter(([, isComplete]) => isComplete).length;
  const completeness = Math.round((completedCount / completenessItems.length) * 100);
  const missingItems = completenessItems
    .filter(([, isComplete]) => !isComplete)
    .map(([label]) => label);

  function update<K extends keyof AthleteProfile>(key: K, value: AthleteProfile[K]) {
    setDraftProfile((current) => ({ ...(current ?? profile), [key]: value }));
    setValidationErrors((current) => {
      const next = { ...current };
      delete next[String(key)];
      if (typeof value === "number" && value < 0) {
        const labels: Partial<Record<keyof AthleteProfile, string>> = {
          heightCm: "Height",
          weightKg: "Current weight",
          weeklyTrainingHours: "Available training hours",
          maxWeekdayWorkoutMinutes: "Weekday workout duration",
          maxWeekendWorkoutMinutes: "Weekend workout duration",
        };
        next[String(key)] = `${labels[key] ?? "Value"} cannot be negative.`;
      }
      if (
        key === "customGoalName" &&
        profile.primaryGoal === "Custom" &&
        typeof value === "string" &&
        !value.trim()
      ) {
        next.customGoalName = "Enter your custom goal name.";
      }
      if (key === "primaryGoal" && value === "Custom" && !profile.customGoalName.trim()) {
        next.customGoalName = "Enter your custom goal name.";
      } else if (key === "primaryGoal" && value !== "Custom") {
        delete next.customGoalName;
      }
      if (key === "dateOfBirth" && typeof value === "string" && value) {
        if (!dateIsValid(value) || value > new Date().toISOString().slice(0, 10)) {
          next.dateOfBirth = "Enter a valid date of birth that is not in the future.";
        }
      }
      if (key === "targetEventDate" && typeof value === "string" && !dateIsValid(value)) {
        next.targetEventDate = "Enter a valid target event date.";
      }
      return next;
    });
    setSavedMessage("");
  }

  function validate(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!dateIsValid(profile.dateOfBirth) || profile.dateOfBirth > new Date().toISOString().slice(0, 10)) {
      errors.dateOfBirth = "Enter a valid date of birth that is not in the future.";
    }
    if (!dateIsValid(profile.targetEventDate)) {
      errors.targetEventDate = "Enter a valid target event date.";
    }
    const numericFields: Array<[keyof AthleteProfile, string]> = [
      ["heightCm", "Height"],
      ["weightKg", "Current weight"],
      ["weeklyTrainingHours", "Available training hours"],
      ["maxWeekdayWorkoutMinutes", "Weekday workout duration"],
      ["maxWeekendWorkoutMinutes", "Weekend workout duration"],
    ];
    for (const [key, label] of numericFields) {
      const value = profile[key];
      if (typeof value === "number" && value < 0) {
        errors[String(key)] = `${label} cannot be negative.`;
      }
    }
    if (profile.primaryGoal === "Custom" && !profile.customGoalName.trim()) {
      errors.customGoalName = "Enter your custom goal name.";
    }
    if (units === "Imperial" && Number(heightInches) > 11) {
      errors.heightCm = "Enter height inches from 0 to 11.";
    }
    if (
      profile.longWorkoutDay &&
      !profile.availableTrainingDays.includes(profile.longWorkoutDay)
    ) {
      errors.longWorkoutDay = "Choose a preferred long-workout day from your available training days.";
    }
    return errors;
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavedMessage("");
    const errors = validate();
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setIsSaving(true);
    try {
      await saveAthleteProfile(profile);
      setDraftProfile(null);
      setSaveError("");
      setSavedMessage("Profile saved");
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? `Profile could not be saved: ${error.message}`
          : "Profile could not be saved due to an unexpected error.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function cancelChanges() {
    setDraftProfile(null);
    setValidationErrors({});
    setSaveError("");
    setSavedMessage("");
  }

  const numberInput = (
    name: keyof AthleteProfile,
    label: string,
    value: number | null,
    unit: string,
    factor = 1,
  ) => (
    <label className={labelClass}>
      {label} <span className="font-normal text-[#748078]">(optional, {unit})</span>
      <input
        aria-invalid={Boolean(validationErrors[String(name)])}
        className={inputClass}
        min="0"
        onChange={(event) => {
          const entered = parseOptionalNumber(event.currentTarget.value);
          const converted = entered === null ? null : units === "Imperial" ? entered / factor : entered;
          update(name, converted as AthleteProfile[typeof name]);
        }}
        step="any"
        type="number"
        value={convertToDisplayNumber(value, units, factor)}
      />
      {validationErrors[String(name)] && (
        <span className="text-[10px] text-[#f0b47c]" role="alert">
          {validationErrors[String(name)]}
        </span>
      )}
    </label>
  );

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
      <header className="mb-7">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#839087]">MySynonym</p>
        <h1 className="mt-2 text-[25px] font-semibold tracking-[-0.04em] text-[#f1f4f0] sm:text-[29px]">
          Athlete Profile
        </h1>
        <p className="mt-1.5 text-xs text-[#87938b]">
          Share what matters to shape recommendations around your training and goals.
        </p>
      </header>

      <section aria-label="Profile completeness" className={`${cardClass} mb-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#eef2ed]">Profile completeness</h2>
            <p className="mt-1 text-xs text-[#87938b]">
              {missingItems.length
                ? `Still needed: ${missingItems.join(", ")}.`
                : "Your core athlete profile is complete."}
            </p>
          </div>
          <span className="text-sm font-semibold text-[#c5ef97]">{completeness}%</span>
        </div>
        <div
          aria-label={`${completeness}% profile completeness`}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#222c26]"
          role="progressbar"
          aria-valuenow={completeness}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-[#b8f36b] transition-[width]" style={{ width: `${completeness}%` }} />
        </div>
      </section>

      <form className="grid gap-4" onSubmit={handleSave} noValidate>
        <ProfileSection title="Personal Details">
          <label className={labelClass}>
            Preferred name <span className="font-normal text-[#748078]">(optional)</span>
            <input className={inputClass} maxLength={80} onChange={(event) => update("preferredName", event.currentTarget.value)} value={profile.preferredName} />
          </label>
          <label className={labelClass}>
            Sex <span className="font-normal text-[#748078]">(optional)</span>
            <select
              className={inputClass}
              onChange={(event) => update("sex", event.currentTarget.value as AthleteProfile["sex"])}
              value={profile.sex}
            >
              <option value="">Select an option</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </label>
          <label className={labelClass}>
            Date of birth <span className="font-normal text-[#748078]">(optional)</span>
            <input
              aria-invalid={Boolean(validationErrors.dateOfBirth)}
              className={inputClass}
              onChange={(event) => update("dateOfBirth", event.currentTarget.value)}
              type="date"
              value={profile.dateOfBirth}
            />
            {validationErrors.dateOfBirth && <span className="text-[10px] text-[#f0b47c]" role="alert">{validationErrors.dateOfBirth}</span>}
          </label>
          {units === "Metric" ? (
            numberInput("heightCm", "Height", profile.heightCm, "cm")
          ) : (
            <>
              <label className={labelClass}>
                Height <span className="font-normal text-[#748078]">(optional, feet)</span>
                <input
                  className={inputClass}
                  min="0"
                  onChange={(event) => {
                    const feet = event.currentTarget.value;
                    const inches = Number(heightInches || 0);
                    update("heightCm", feet === "" && heightInches === "" ? null : (Number(feet || 0) * 12 + inches) * 2.54);
                  }}
                  step="1"
                  type="number"
                  value={heightFeet}
                />
                {validationErrors.heightCm && <span className="text-[10px] text-[#f0b47c]" role="alert">{validationErrors.heightCm}</span>}
              </label>
              <label className={labelClass}>
                Height <span className="font-normal text-[#748078]">(optional, inches)</span>
                <input
                  className={inputClass}
                  max="11"
                  min="0"
                  onChange={(event) => {
                    const inches = event.currentTarget.value;
                    update("heightCm", heightFeet === "" && inches === "" ? null : (Number(heightFeet || 0) * 12 + Number(inches || 0)) * 2.54);
                  }}
                  step="any"
                  type="number"
                  value={heightInches}
                />
              </label>
            </>
          )}
          {numberInput("weightKg", "Current weight", profile.weightKg, units === "Metric" ? "kg" : "lb", 2.2046226218)}
          <fieldset className="grid gap-2">
            <legend className="text-xs font-medium text-[#a6b1a9]">Preferred units</legend>
            <div className="flex gap-2">
              {(["Metric", "Imperial"] as const).map((unit) => (
                <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${units === unit ? "border-[#b8f36b]/30 bg-[#b8f36b]/[0.08] text-[#c5ef97]" : "border-white/[0.08] text-[#a6b1a9]"}`} key={unit}>
                  <input
                    checked={units === unit}
                    className="accent-[#b8f36b]"
                    name="units"
                    onChange={() => {
                      update("units", unit);
                    }}
                    type="radio"
                    value={unit}
                  />
                  {unit}
                </label>
              ))}
            </div>
          </fieldset>
        </ProfileSection>

        <ProfileSection title="Goals">
          <label className={labelClass}>
            Primary goal <span className="font-normal text-[#748078]">(optional)</span>
            <select className={inputClass} onChange={(event) => update("primaryGoal", event.currentTarget.value as AthleteProfile["primaryGoal"])} value={profile.primaryGoal}>
              <option value="">Select a goal</option>
              {profileGoals.map((goal) => <option key={goal}>{goal}</option>)}
            </select>
          </label>
          {profile.primaryGoal === "Custom" && (
            <label className={labelClass}>
              Custom goal name
              <input aria-invalid={Boolean(validationErrors.customGoalName)} className={inputClass} maxLength={120} onChange={(event) => update("customGoalName", event.currentTarget.value)} value={profile.customGoalName} />
              {validationErrors.customGoalName && <span className="text-[10px] text-[#f0b47c]" role="alert">{validationErrors.customGoalName}</span>}
            </label>
          )}
          <label className={labelClass}>
            Target event name <span className="font-normal text-[#748078]">(optional)</span>
            <input className={inputClass} maxLength={120} onChange={(event) => update("targetEventName", event.currentTarget.value)} value={profile.targetEventName} />
          </label>
          <label className={labelClass}>
            Target event date <span className="font-normal text-[#748078]">(optional)</span>
            <input aria-invalid={Boolean(validationErrors.targetEventDate)} className={inputClass} onChange={(event) => update("targetEventDate", event.currentTarget.value)} type="date" value={profile.targetEventDate} />
            {validationErrors.targetEventDate && <span className="text-[10px] text-[#f0b47c]" role="alert">{validationErrors.targetEventDate}</span>}
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Goal description <span className="font-normal text-[#748078]">(optional)</span>
            <textarea className={`${inputClass} min-h-20 py-2.5`} maxLength={1000} onChange={(event) => update("goalDescription", event.currentTarget.value)} value={profile.goalDescription} />
          </label>
        </ProfileSection>

        <ProfileSection title="Training Experience">
          <label className={labelClass}>
            Experience level <span className="font-normal text-[#748078]">(optional)</span>
            <select className={inputClass} onChange={(event) => update("trainingExperience", event.currentTarget.value as AthleteProfile["trainingExperience"])} value={profile.trainingExperience}>
              <option value="">Select experience</option>
              {experiences.map((level) => <option key={level}>{level}</option>)}
            </select>
          </label>
        </ProfileSection>

        <ProfileSection
          title="Weekly Availability"
          description="Generated and manually planned sessions are scheduled only on selected available days."
        >
          <label className={labelClass}>
            Available training hours per week <span className="font-normal text-[#748078]">(optional, hours)</span>
            <input aria-invalid={Boolean(validationErrors.weeklyTrainingHours)} className={inputClass} min="0" onChange={(event) => update("weeklyTrainingHours", parseOptionalNumber(event.currentTarget.value))} step="any" type="number" value={profile.weeklyTrainingHours ?? ""} />
            {validationErrors.weeklyTrainingHours && <span className="text-[10px] text-[#f0b47c]" role="alert">{validationErrors.weeklyTrainingHours}</span>}
          </label>
          <label className={labelClass}>
            Preferred long-workout day <span className="font-normal text-[#748078]">(optional; select an available day)</span>
            <select aria-invalid={Boolean(validationErrors.longWorkoutDay)} className={inputClass} onChange={(event) => update("longWorkoutDay", event.currentTarget.value)} value={profile.longWorkoutDay}>
              <option value="">Select a day</option>
              {weekDays.filter((day) => profile.availableTrainingDays.includes(day)).map((day) => <option key={day}>{day}</option>)}
            </select>
            {validationErrors.longWorkoutDay && <span className="text-[10px] text-[#f0b47c]" role="alert">{validationErrors.longWorkoutDay}</span>}
          </label>
          <MultiSelect
            label="Available training days"
            options={weekDays}
            value={profile.availableTrainingDays}
            onChange={(value) => {
              update("availableTrainingDays", value);
              if (profile.longWorkoutDay && !value.includes(profile.longWorkoutDay)) {
                update("longWorkoutDay", "");
              }
            }}
          />
        </ProfileSection>

        <ProfileSection title="Equipment and Access">
          <MultiSelect label="Equipment and access (optional)" options={equipmentOptions} value={profile.equipment} onChange={(value) => update("equipment", value)} />
          <label className={`${labelClass} sm:col-span-2`}>
            Other equipment <span className="font-normal text-[#748078]">(optional)</span>
            <input className={inputClass} maxLength={500} onChange={(event) => update("otherEquipment", event.currentTarget.value)} value={profile.otherEquipment} />
          </label>
        </ProfileSection>

        <ProfileSection title="Training Preferences">
          <MultiSelect label="Preferred activities (optional)" options={profileActivities} value={profile.preferredActivities} onChange={(value) => update("preferredActivities", value)} />
          <MultiSelect label="Activities you dislike (optional)" options={profileActivities} value={profile.dislikedActivities} onChange={(value) => update("dislikedActivities", value)} />
          <label className={labelClass}>
            Preferred rest day <span className="font-normal text-[#748078]">(optional)</span>
            <select className={inputClass} onChange={(event) => update("preferredRestDay", event.currentTarget.value)} value={profile.preferredRestDay}>
              <option value="">Select a day</option>
              {weekDays.map((day) => <option key={day}>{day}</option>)}
            </select>
          </label>
          {numberInput("maxWeekdayWorkoutMinutes", "Maximum preferred weekday workout", profile.maxWeekdayWorkoutMinutes, "minutes")}
          {numberInput("maxWeekendWorkoutMinutes", "Maximum preferred weekend workout", profile.maxWeekendWorkoutMinutes, "minutes")}
        </ProfileSection>

        <details className={cardClass}>
          <summary className="cursor-pointer text-[17px] font-semibold text-[#eef2ed] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b8f36b]">
            Physical Limitations <span className="text-xs font-normal text-[#748078]">(optional)</span>
          </summary>
          <p className="mt-2 text-xs text-[#87938b]">Share only what you are comfortable including. Do not enter medical diagnoses.</p>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {([
              ["currentLimitations", "Current injuries or limitations"],
              ["previousInjuries", "Previous relevant injuries"],
              ["recurringSoreness", "Areas of recurring soreness"],
              ["healthConsiderations", "Additional health or training considerations"],
            ] as const).map(([key, label]) => (
              <label className={labelClass} key={key}>
                {label} <span className="font-normal text-[#748078]">(optional)</span>
                <textarea className={`${inputClass} min-h-20 py-2.5`} maxLength={1000} onChange={(event) => update(key, event.currentTarget.value)} value={profile[key]} />
              </label>
            ))}
          </div>
        </details>

        <section aria-label="Profile privacy and health information" className={cardClass}>
          <h2 className="text-sm font-semibold text-[#eef2ed]">Privacy and wellbeing</h2>
          <ul className="mt-3 grid gap-2 text-xs leading-relaxed text-[#87938b]">
            <li>Your profile is used to personalize fitness recommendations.</li>
            <li>Your athlete profile is saved to your MySynonym account.</li>
            <li>MySynonym does not currently provide medical diagnosis or medical treatment.</li>
            <li>Seek qualified professional advice for injuries or health concerns.</li>
          </ul>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded-lg bg-[#b8f36b] px-4 py-2.5 text-xs font-semibold text-[#102010] transition-colors hover:bg-[#c8f78b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b] disabled:cursor-not-allowed disabled:opacity-50" disabled={!isProfileLoaded || isSaving} type="submit">
            {isSaving ? "Saving…" : "Save Profile"}
          </button>
          {hasUnsavedChanges && (
            <button className="rounded-lg border border-white/[0.08] px-4 py-2.5 text-xs text-[#a6b1a9] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b]" onClick={cancelChanges} type="button">
              Cancel Changes
            </button>
          )}
          {savedMessage && <p className="text-xs text-[#c5ef97]" role="status">{savedMessage}</p>}
          {(saveError || profileError) && (
            <p className="text-xs text-[#f0b47c]" role="alert">{saveError || profileError}</p>
          )}
        </div>
      </form>
      <p className="mt-5 text-[10px] text-[#68756d]">
        Your athlete profile is saved to your account and available when you sign in.
      </p>
    </div>
  );
}
