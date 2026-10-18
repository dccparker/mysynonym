import type { AthleteProfile } from "./athlete-profile";
import type { PlannedActivity, PlannedActivityType, PlannedIntensity } from "./training-plan";

export function availableTypes(profile: AthleteProfile): PlannedActivityType[] {
  const equipment = new Set(profile.equipment);
  const available: PlannedActivityType[] = [];
  if (equipment.has("Running access") || equipment.has("Treadmill")) available.push("Run");
  if (equipment.has("Road bike") || equipment.has("Indoor bike trainer")) available.push("Ride");
  if (equipment.has("Pool access") || equipment.has("Open-water swimming access")) available.push("Swim");
  const strengthItems = ["Gym access", "Strength equipment", "Sled", "SkiErg", "Rowing machine", "Sandbag", "Wall ball", "Farmers carry weights"];
  if (strengthItems.some((item) => equipment.has(item))) available.push("Strength");
  return available;
}

export function goalTypes(profile: AthleteProfile, available: PlannedActivityType[]): PlannedActivityType[] {
  const preferredMap: Record<string, PlannedActivityType> = {
    Running: "Run",
    Cycling: "Ride",
    Swimming: "Swim",
    "Strength training": "Strength",
  };
  const preferred = profile.preferredActivities
    .map((activity) => preferredMap[activity])
    .filter((activity): activity is PlannedActivityType => Boolean(activity));
  const goal = profile.primaryGoal;
  const isTriathlonGoal = ["Ironman", "Half Ironman", "Triathlon"].includes(goal);
  const target =
    isTriathlonGoal
      ? ["Swim", "Ride", "Run", "Strength"]
      : goal === "Cycling Event"
        ? ["Ride", "Strength", "Run"]
        : ["Marathon", "Half Marathon"].includes(goal)
          ? ["Run", "Strength", "Ride"]
          : goal === "Strength"
            ? ["Strength", "Run", "Ride"]
            : goal === "HYROX"
              ? ["Run", "Strength", "Ride"]
              : preferred.length
                ? preferred
                : ["Run", "Ride", "Strength"];
  const dislikedMap: Record<string, PlannedActivityType> = {
    Running: "Run",
    Cycling: "Ride",
    Swimming: "Swim",
    "Strength training": "Strength",
  };
  const disliked = new Set(profile.dislikedActivities.map((activity) => dislikedMap[activity]));
  const supported = target.filter(
    (activity): activity is PlannedActivityType =>
      available.includes(activity as PlannedActivityType) &&
      (isTriathlonGoal && ["Swim", "Ride", "Run"].includes(activity)
        ? true
        : !disliked.has(activity as PlannedActivityType)),
  );
  const preferredOrder = new Map(preferred.map((activity, index) => [activity, index]));
  return [...new Set(supported)].sort((left, right) => {
        if (isTriathlonGoal && left === "Strength") return 1;
        if (isTriathlonGoal && right === "Strength") return -1;
        return (
          (preferredOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (preferredOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
        );
      });
}

export function activityPrescription(
  type: PlannedActivityType,
  durationMinutes: number,
  intensity: PlannedIntensity,
  experience: AthleteProfile["trainingExperience"],
  hasCurrentLimitations: boolean,
): PlannedActivity {
  const instructionsByType: Record<PlannedActivityType, string> = {
    Run:
      intensity === "Hard"
        ? "After an easy warm-up, use short faster efforts while staying in control, then cool down."
        : "Run at a comfortable effort where you can speak in full sentences.",
    Ride:
      intensity === "Hard"
        ? "After an easy warm-up, use short stronger efforts with easy spinning between them."
        : "Ride at a comfortable effort where conversation remains easy.",
    Swim:
      intensity === "Hard"
        ? "After an easy warm-up, swim short faster repeats with relaxed recovery between them."
        : "Swim relaxed lengths and pause as needed to keep your technique comfortable.",
    Strength:
      intensity === "Hard"
        ? "Use familiar strength movements with controlled repetitions and stop before form breaks down."
        : "Practice familiar strength movements with controlled, comfortable repetitions.",
    Other:
      intensity === "Recovery"
        ? "Take an easy walk or do gentle mobility. Finish feeling as comfortable as when you started."
        : "Choose familiar movement that fits the planned effort and duration.",
  };
  const easyPurpose =
    type === "Strength"
      ? "Maintain strength with manageable effort."
      : "Build consistency without making the next session harder.";
  const purpose =
    intensity === "Hard"
      ? "Practice brief, faster efforts while keeping the total session controlled."
      : type === "Swim"
        ? "Practice relaxed movement and comfortable technique."
        : easyPurpose;
  return {
    id: globalThis.crypto.randomUUID(),
    activityType: type,
    durationMinutes,
    intensity: experience === "Beginner" && intensity === "Hard" ? "Moderate" : intensity,
    instructions: hasCurrentLimitations
      ? `${instructionsByType[type]} Keep within your comfortable range and stop if symptoms worsen.`
      : instructionsByType[type],
    purpose,
  };
}
