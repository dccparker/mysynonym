// Shared, pure sport-specific workout model. Generated plans, manual workouts
// and Coach recommendations all describe sessions with these workout types.
// No runtime imports so it runs on the client, the server and under node tests.
// Prescriptions use effort (RPE / zones) and never performance target times.
import type { PlannedActivity, PlannedActivityType, PlannedIntensity } from "./training-plan";

export type WorkoutSport = "Running" | "Cycling" | "Swimming" | "Strength" | "HYROX";
export type Experience = "Beginner" | "Intermediate" | "Advanced" | "Competitive" | "";
export type EquipmentNeed =
  | "run"
  | "bike"
  | "pool"
  | "openwater"
  | "gym"
  | "sled"
  | "skierg"
  | "rower"
  | "sandbag"
  | "wallball"
  | "carry";
export type ImpactLevel = "low" | "medium" | "high";

export type WorkoutExercise = {
  name: string;
  sets?: number;
  reps?: string;
  distance?: string;
  load?: string;
  notes?: string;
};

export type WorkoutStructure = {
  workoutType?: string;
  warmUp?: string;
  mainSet?: string;
  coolDown?: string;
  equipment?: string[];
  exercises?: WorkoutExercise[];
  easierOption?: string;
  harderOption?: string;
};

export type WorkoutBuildContext = {
  experience: Experience;
  phase?: string;
  recovery?: boolean;
  hasLimitations?: boolean;
};

type Scale = { level: 0 | 1 | 2; hard: boolean };

type CatalogEntry = {
  name: string;
  sport: WorkoutSport;
  activityType: PlannedActivityType;
  intensity: PlannedIntensity;
  impact: ImpactLevel;
  needs: EquipmentNeed[];
  equipment: string[];
  purpose: string;
  warmUp: string;
  coolDown: string;
  main: (minutes: number, scale: Scale) => string;
  exercises?: (scale: Scale) => WorkoutExercise[];
  easier: string;
  harder: string;
};

const ex = (
  name: string,
  sets: number,
  extra: Partial<Omit<WorkoutExercise, "name" | "sets">> = {},
): WorkoutExercise => ({ name, sets, ...extra });

const sets = (base: number, scale: Scale) =>
  Math.max(1, base + (scale.level === 0 ? -1 : scale.level === 2 && scale.hard ? 1 : 0));

const RUN_WARM = "5-10 min easy jogging or brisk walking, then leg swings and 3-4 relaxed strides.";
const RUN_COOL = "5 min easy jog or walk, then gentle calf and hip stretches.";
const BIKE_WARM = "10 min easy spinning, building to a smooth, comfortable cadence.";
const BIKE_COOL = "5-10 min easy spinning until breathing settles.";
const SWIM_WARM = "200-400 m easy swimming mixed with kick and drill.";
const SWIM_COOL = "100-200 m easy swimming, loose and relaxed.";
const STR_WARM = "5-8 min easy cardio, then dynamic mobility for hips, shoulders and ankles.";
const STR_COOL = "5 min of gentle stretching and slow breathing.";
const HX_WARM = "8-10 min easy cardio, then dynamic mobility and 2 light practice reps of today's movements.";
const HX_COOL = "5 min easy walk and gentle stretching for hips, quads and shoulders.";

export const WORKOUT_CATALOG: readonly CatalogEntry[] = [
  // Running
  {
    name: "Easy Run", sport: "Running", activityType: "Run", intensity: "Easy", impact: "medium", needs: ["run"], equipment: ["Running shoes"],
    purpose: "Builds aerobic endurance at a comfortable effort.",
    warmUp: "5 min brisk walk or very easy jogging.", coolDown: "5 min walk and light stretching.",
    main: (m) => `${m} min continuous easy running at conversational effort (RPE 3-4). Keep breathing relaxed throughout.`,
    easier: "Alternate 4 min jogging with 1 min walking, or shorten by 10 min.", harder: "Add 4-6 relaxed strides in the final 10 min.",
  },
  {
    name: "Recovery Run", sport: "Running", activityType: "Run", intensity: "Recovery", impact: "medium", needs: ["run"], equipment: ["Running shoes"],
    purpose: "Promotes blood flow and recovery without adding meaningful stress.",
    warmUp: "3-5 min walking.", coolDown: "Walk 3-5 min.",
    main: (m) => `${m} min very easy jogging (RPE 2-3), slower than a normal easy run. Walk whenever you want to.`,
    easier: "Swap for a 20-30 min walk.", harder: "Hold the same effort and add 5-10 min only if you feel fresh.",
  },
  {
    name: "Long Run", sport: "Running", activityType: "Run", intensity: "Easy", impact: "medium", needs: ["run"], equipment: ["Running shoes", "Water or fuel"],
    purpose: "Extends endurance and teaches the body to keep going steadily.",
    warmUp: RUN_WARM, coolDown: RUN_COOL,
    main: (m) => `${m} min steady, relaxed running (RPE 3-4). Drink and fuel regularly, and keep effort even from start to finish.`,
    easier: "Use run/walk intervals (8 min run, 1 min walk).", harder: "Finish the final 10-15 min at a steady, controlled effort (RPE 5).",
  },
  {
    name: "Tempo Run", sport: "Running", activityType: "Run", intensity: "Moderate", impact: "medium", needs: ["run"], equipment: ["Running shoes"],
    purpose: "Improves your ability to sustain a comfortably hard effort.",
    warmUp: RUN_WARM, coolDown: RUN_COOL,
    main: (m, s) => `${Math.max(10, Math.round(m * (s.level === 0 ? 0.4 : 0.55)))} min continuous at a comfortably hard, steady effort (RPE 6-7), after easy running to fill the remaining time.`,
    easier: "Break the tempo into 2 blocks with 3 min easy between them.", harder: "Extend the tempo block by 5 min.",
  },
  {
    name: "Threshold Run", sport: "Running", activityType: "Run", intensity: "Hard", impact: "high", needs: ["run"], equipment: ["Running shoes"],
    purpose: "Raises the effort you can hold before fatigue builds quickly.",
    warmUp: RUN_WARM, coolDown: RUN_COOL,
    main: (m, s) => `${s.level === 0 ? 2 : 3} x ${Math.max(5, Math.min(10, Math.round(m / 6)))} min at a hard but controlled effort (RPE 7), with 2-3 min easy jogging between.`,
    easier: "Drop one repeat and take 3 min recoveries.", harder: "Add one repeat or shorten recoveries to 90 s.",
  },
  {
    name: "Intervals", sport: "Running", activityType: "Run", intensity: "Hard", impact: "high", needs: ["run"], equipment: ["Running shoes"],
    purpose: "Builds speed and running economy with short, controlled hard efforts.",
    warmUp: `${RUN_WARM} Include 4 strides.`, coolDown: RUN_COOL,
    main: (m, s) => `${s.level === 0 ? 5 : 6} x 2-3 min hard (RPE 7-8) with equal-time easy jogging between. Stay smooth and stop a rep early if form fades.`,
    easier: "Use 1 min hard / 1 min easy for 6 reps.", harder: "Add 2 reps or extend each hard rep by 30 s.",
  },
  {
    name: "Hill Repeats", sport: "Running", activityType: "Run", intensity: "Hard", impact: "high", needs: ["run"], equipment: ["Running shoes", "Hill or incline"],
    purpose: "Builds leg strength and power with low-speed, hard efforts.",
    warmUp: `${RUN_WARM} Include 2 short hill strides.`, coolDown: RUN_COOL,
    main: (m, s) => `${s.level === 0 ? 5 : 6} x 60-90 s uphill at a strong, controlled effort (RPE 7), jogging or walking down to recover fully.`,
    easier: "Use a gentler gradient or 4 reps.", harder: "Add 2 reps or use a steeper hill.",
  },
  {
    name: "Brick Run", sport: "Running", activityType: "Run", intensity: "Moderate", impact: "medium", needs: ["run"], equipment: ["Running shoes"],
    purpose: "Practises running on tired legs straight after riding.",
    warmUp: "Change shoes quickly right after your ride (transition practice).", coolDown: "Walk 3-5 min and stretch calves and quads.",
    main: (m) => `${m} min running straight off the bike. Start very easy for the first 5 min as your legs adjust, then settle at steady effort (RPE 4-5).`,
    easier: "Walk the first 3 min and keep the whole run easy.", harder: "Hold steady effort (RPE 5-6) for the second half.",
  },
  // Cycling
  {
    name: "Recovery Ride", sport: "Cycling", activityType: "Ride", intensity: "Recovery", impact: "low", needs: ["bike"], equipment: ["Bike"],
    purpose: "Loosens the legs and aids recovery with minimal load.",
    warmUp: "5 min very easy spinning.", coolDown: "5 min easy spinning.",
    main: (m) => `${m} min flat, very easy spinning (RPE 2) at a high, light cadence.`,
    easier: "Shorten by 10 min.", harder: "Keep effort the same; add 10 min only if you feel fresh.",
  },
  {
    name: "Zone 2 Ride", sport: "Cycling", activityType: "Ride", intensity: "Easy", impact: "low", needs: ["bike"], equipment: ["Bike"],
    purpose: "Builds aerobic endurance at a steady, low-stress effort.",
    warmUp: BIKE_WARM, coolDown: BIKE_COOL,
    main: (m) => `${m} min steady Zone 2 riding (RPE 3-4, conversation stays comfortable). Keep cadence smooth.`,
    easier: "Drop to Zone 1 and shorten by 15 min.", harder: "Add 3 x 5 min of steady Zone 3 riding in the middle.",
  },
  {
    name: "Long Ride", sport: "Cycling", activityType: "Ride", intensity: "Easy", impact: "low", needs: ["bike"], equipment: ["Bike", "Water and fuel"],
    purpose: "Develops long-duration endurance and fueling habits.",
    warmUp: BIKE_WARM, coolDown: BIKE_COOL,
    main: (m) => `${m} min mostly Zone 2 (RPE 3-4). Drink and eat regularly from the first hour, and stay seated and relaxed on climbs.`,
    easier: "Keep everything in Zone 1-2 and shorten by 20 min.", harder: "Include 2 x 15 min of steady Zone 3 in the second half.",
  },
  {
    name: "Tempo Ride", sport: "Cycling", activityType: "Ride", intensity: "Moderate", impact: "low", needs: ["bike"], equipment: ["Bike"],
    purpose: "Builds sustainable power at a steady, comfortably hard effort.",
    warmUp: BIKE_WARM, coolDown: BIKE_COOL,
    main: (m, s) => `${s.level === 0 ? 2 : 3} x ${Math.max(8, Math.min(15, Math.round(m / 6)))} min at tempo (RPE 6), 4 min easy spinning between.`,
    easier: "Do 2 blocks and take 5 min recoveries.", harder: "Add one block or extend each by 3 min.",
  },
  {
    name: "Threshold Intervals", sport: "Cycling", activityType: "Ride", intensity: "Hard", impact: "low", needs: ["bike"], equipment: ["Bike"],
    purpose: "Raises the effort you can sustain before fatigue builds quickly.",
    warmUp: `${BIKE_WARM} Add 3 x 1 min build-ups.`, coolDown: BIKE_COOL,
    main: (m, s) => `${s.level === 0 ? 2 : 3} x ${Math.max(6, Math.min(12, Math.round(m / 7)))} min at threshold (RPE 7-8) with 5 min easy spinning between.`,
    easier: "Reduce to 2 intervals and ride at upper tempo (RPE 6-7).", harder: "Add one interval or lengthen each by 2 min.",
  },
  {
    name: "VO2 Intervals", sport: "Cycling", activityType: "Ride", intensity: "Hard", impact: "low", needs: ["bike"], equipment: ["Bike"],
    purpose: "Builds top-end aerobic capacity with short, hard efforts.",
    warmUp: `${BIKE_WARM} Add 3 x 30 s build-ups.`, coolDown: BIKE_COOL,
    main: (m, s) => `${s.level === 0 ? 4 : 5} x 3 min very hard (RPE 8-9) with 3 min easy spinning between.`,
    easier: "Use 2 min efforts with 3 min recoveries.", harder: "Add one 3 min effort.",
  },
  {
    name: "Brick Ride", sport: "Cycling", activityType: "Ride", intensity: "Moderate", impact: "low", needs: ["bike"], equipment: ["Bike", "Running shoes ready for transition"],
    purpose: "Rehearses race-style riding before running off the bike.",
    warmUp: BIKE_WARM, coolDown: "Rack the bike and move into the run without a long rest.",
    main: (m) => `${m} min steady riding (RPE 4-5) with the final 10 min at the effort you plan to finish a race at. Fuel and drink as in a race.`,
    easier: "Keep the whole ride at Zone 2.", harder: "Add 10 min of steady Zone 3 in the middle.",
  },
  // Swimming
  {
    name: "Technique Swim", sport: "Swimming", activityType: "Swim", intensity: "Easy", impact: "low", needs: ["pool"], equipment: ["Pool", "Pull buoy", "Kickboard"],
    purpose: "Improves stroke efficiency through drills and relaxed swimming.",
    warmUp: SWIM_WARM, coolDown: SWIM_COOL,
    main: (m) => `${Math.max(10, m - 15)} min of drill-and-swim sets (for example catch-up, fingertip drag, and side-kick), alternating 50 m drills with 50 m smooth swimming. Rest 15-20 s between.`,
    easier: "Use fins and extend rests to 30 s.", harder: "Swim 100 m smooth between drill sets.",
  },
  {
    name: "Endurance Swim", sport: "Swimming", activityType: "Swim", intensity: "Easy", impact: "low", needs: ["pool"], equipment: ["Pool", "Pull buoy"],
    purpose: "Builds swim-specific aerobic endurance.",
    warmUp: SWIM_WARM, coolDown: SWIM_COOL,
    main: (m, s) => `${s.level === 0 ? 4 : 6} x ${Math.max(200, Math.min(400, Math.round((m * 12) / 100) * 100 / 2))} m steady (RPE 4) with 20-30 s rest; stay long and relaxed.`,
    easier: "Take 40 s rests or shorten each repeat by 100 m.", harder: "Cut rests to 15 s on the final set.",
  },
  {
    name: "Recovery Swim", sport: "Swimming", activityType: "Swim", intensity: "Recovery", impact: "low", needs: ["pool"], equipment: ["Pool"],
    purpose: "Moves the body gently to aid recovery.",
    warmUp: "100-200 m very easy swimming.", coolDown: "100 m easy backstroke or choice stroke.",
    main: (m) => `${m} min very easy swimming (RPE 2), mixing strokes freely with plenty of rest.`,
    easier: "Swim only 15 min.", harder: "Add 5 min of relaxed swimming only if you feel fresh.",
  },
  {
    name: "Threshold Swim", sport: "Swimming", activityType: "Swim", intensity: "Hard", impact: "low", needs: ["pool"], equipment: ["Pool"],
    purpose: "Raises the effort you can sustain in the water.",
    warmUp: SWIM_WARM, coolDown: SWIM_COOL,
    main: (m, s) => `${s.level === 0 ? 5 : 8} x 100-200 m hard but controlled (RPE 7) with 15-20 s rest. Keep stroke count steady.`,
    easier: "Use 50 m repeats with 20 s rest.", harder: "Add 2 repeats or cut rests to 10 s.",
  },
  {
    name: "Race-Pace Swim", sport: "Swimming", activityType: "Swim", intensity: "Moderate", impact: "low", needs: ["pool"], equipment: ["Pool"],
    purpose: "Rehearses the steady effort you plan to hold on race day.",
    warmUp: SWIM_WARM, coolDown: SWIM_COOL,
    main: (m, s) => `${s.level === 0 ? 3 : 4} x 300-400 m at planned race effort (RPE 5-6) with 30 s rest. Practise sighting every 8-10 strokes.`,
    easier: "Use 200 m repeats.", harder: "Add one repeat and reduce rest to 20 s.",
  },
  {
    name: "Open-Water Skills", sport: "Swimming", activityType: "Swim", intensity: "Easy", impact: "low", needs: ["openwater"], equipment: ["Open-water access", "Wetsuit if needed", "Brightly coloured cap", "Tow float"],
    purpose: "Builds sighting, navigation, and comfort in open water.",
    warmUp: "5 min easy swimming near the shore, getting used to the water temperature.", coolDown: "5 min easy swimming back to shore.",
    main: () => "Practise sighting every 6-10 strokes, swim straight between two landmarks, and practise turning around buoys. Stay within reach of safety support and never swim alone.",
    easier: "Stay in shallow water and practise sighting only.", harder: "Add continuous 10 min swims with sighting every 10 strokes.",
  },
  // Strength
  {
    name: "Full Body", sport: "Strength", activityType: "Strength", intensity: "Moderate", impact: "low", needs: ["gym"], equipment: ["Dumbbells or barbell", "Bench"],
    purpose: "Builds overall strength and durability to support endurance training.",
    warmUp: STR_WARM, coolDown: STR_COOL,
    main: () => "Work through each exercise with controlled tempo and 60-90 s rest between sets. Stop each set with 2-3 reps left in reserve.",
    exercises: (s) => [
      ex("Goblet squat", sets(3, s), { reps: "8-10", load: "Moderate" }),
      ex("Romanian deadlift", sets(3, s), { reps: "8-10", load: "Moderate" }),
      ex("Dumbbell row", sets(3, s), { reps: "10 each side", load: "Moderate" }),
      ex("Push-up or bench press", sets(3, s), { reps: "8-10", load: "Bodyweight or moderate" }),
      ex("Plank", sets(2, s), { reps: "30-45 s hold" }),
    ],
    easier: "Do 2 sets of each exercise with lighter loads.", harder: "Add a set and raise loads slightly while keeping 2 reps in reserve.",
  },
  {
    name: "Upper Body", sport: "Strength", activityType: "Strength", intensity: "Moderate", impact: "low", needs: ["gym"], equipment: ["Dumbbells or barbell", "Bench", "Pull-up bar or band"],
    purpose: "Builds posture and upper-body strength for swimming, rowing, and carrying.",
    warmUp: STR_WARM, coolDown: STR_COOL,
    main: () => "Keep a controlled tempo with 60-90 s rest. Stop each set with 2-3 reps left in reserve.",
    exercises: (s) => [
      ex("Dumbbell bench press", sets(3, s), { reps: "8-10", load: "Moderate" }),
      ex("Seated or bent-over row", sets(3, s), { reps: "10", load: "Moderate" }),
      ex("Overhead press", sets(3, s), { reps: "8-10", load: "Light-moderate" }),
      ex("Lat pulldown or assisted pull-up", sets(3, s), { reps: "8-10", load: "Moderate" }),
      ex("Face pull", sets(2, s), { reps: "12-15", load: "Light" }),
    ],
    easier: "Use 2 sets and lighter loads.", harder: "Add a set and a slower lowering phase.",
  },
  {
    name: "Lower Body", sport: "Strength", activityType: "Strength", intensity: "Moderate", impact: "low", needs: ["gym"], equipment: ["Dumbbells or barbell", "Step or box"],
    purpose: "Builds leg strength that supports running, cycling and carrying.",
    warmUp: STR_WARM, coolDown: STR_COOL,
    main: () => "Use controlled tempo and 90 s rest between sets. Stop with 2-3 reps left in reserve.",
    exercises: (s) => [
      ex("Back or goblet squat", sets(3, s), { reps: "6-8", load: "Moderate-heavy" }),
      ex("Romanian deadlift", sets(3, s), { reps: "8", load: "Moderate" }),
      ex("Walking lunge", sets(2, s), { reps: "10 each leg", load: "Light-moderate" }),
      ex("Calf raise", sets(3, s), { reps: "12-15", load: "Moderate" }),
    ],
    easier: "Use bodyweight and 2 sets.", harder: "Add a set and 5% more load if technique stays crisp.",
  },
  {
    name: "Core Stability", sport: "Strength", activityType: "Strength", intensity: "Easy", impact: "low", needs: [], equipment: ["Mat"],
    purpose: "Builds trunk stability for efficient posture and force transfer.",
    warmUp: "5 min of easy movement, then cat-camel and hip bridges.", coolDown: STR_COOL,
    main: () => "Move slowly and keep breathing. Stop a set when form fades.",
    exercises: (s) => [
      ex("Dead bug", sets(3, s), { reps: "8 each side" }),
      ex("Side plank", sets(2, s), { reps: "25-40 s each side" }),
      ex("Bird dog", sets(3, s), { reps: "8 each side" }),
      ex("Pallof press", sets(2, s), { reps: "10 each side", load: "Light band" }),
    ],
    easier: "Use 2 sets and shorter holds.", harder: "Lengthen holds by 10 s or add a set.",
  },
  {
    name: "Single-Leg Strength", sport: "Strength", activityType: "Strength", intensity: "Moderate", impact: "low", needs: ["gym"], equipment: ["Dumbbells", "Step or box"],
    purpose: "Builds balance and leg strength one side at a time.",
    warmUp: STR_WARM, coolDown: STR_COOL,
    main: () => "Move with control, hold support if needed, and keep both sides equal.",
    exercises: (s) => [
      ex("Step-up", sets(3, s), { reps: "8 each leg", load: "Light-moderate" }),
      ex("Split squat", sets(3, s), { reps: "8 each leg", load: "Light-moderate" }),
      ex("Single-leg Romanian deadlift", sets(3, s), { reps: "8 each leg", load: "Light" }),
      ex("Single-leg calf raise", sets(2, s), { reps: "10 each leg" }),
    ],
    easier: "Use bodyweight and hold a wall for balance.", harder: "Add load or slow the lowering phase to 3 s.",
  },
  {
    name: "Hip Stability", sport: "Strength", activityType: "Strength", intensity: "Easy", impact: "low", needs: [], equipment: ["Mini band", "Mat"],
    purpose: "Builds hip and glute strength that supports running and cycling mechanics.",
    warmUp: "5 min easy walking or cycling, then hip circles.", coolDown: STR_COOL,
    main: () => "Use slow, controlled reps and feel the working muscles. Keep movements pain-free.",
    exercises: (s) => [
      ex("Side-lying hip abduction", sets(3, s), { reps: "12 each side" }),
      ex("Banded lateral walk", sets(3, s), { reps: "10 steps each way", load: "Mini band" }),
      ex("Glute bridge", sets(3, s), { reps: "12" }),
      ex("Clamshell", sets(2, s), { reps: "12 each side", load: "Mini band" }),
    ],
    easier: "Use no band and 2 sets.", harder: "Use a stronger band or progress to single-leg bridges.",
  },
  {
    name: "Knee-Support Strength", sport: "Strength", activityType: "Strength", intensity: "Easy", impact: "low", needs: [], equipment: ["Step or box", "Mini band"],
    purpose: "Builds strength around the knee and hip to support training load.",
    warmUp: "5 min easy cycling or walking, then gentle leg swings.", coolDown: STR_COOL,
    main: () => "Use pain-free ranges only and keep movement slow and controlled. Stop or reduce depth if you feel sharp or worsening pain.",
    exercises: (s) => [
      ex("Box squat to comfortable depth", sets(3, s), { reps: "10", load: "Bodyweight" }),
      ex("Step-down (low step)", sets(3, s), { reps: "8 each leg", load: "Bodyweight" }),
      ex("Glute bridge", sets(3, s), { reps: "12" }),
      ex("Banded lateral walk", sets(2, s), { reps: "10 steps each way", load: "Mini band" }),
      ex("Calf raise", sets(2, s), { reps: "12" }),
    ],
    easier: "Reduce range of motion and use 2 sets.", harder: "Slow the lowering phase to 3 s only if all movements stay comfortable.",
  },
  {
    name: "Mobility", sport: "Strength", activityType: "Other", intensity: "Recovery", impact: "low", needs: [], equipment: ["Mat", "Foam roller"],
    purpose: "Maintains range of motion and supports recovery.",
    warmUp: "3-5 min easy walking.", coolDown: "Slow breathing for 2-3 min.",
    main: () => "Move slowly through each position, never forcing range. Spend 30-60 s on each movement.",
    exercises: () => [
      ex("Hip flexor stretch", 2, { reps: "30-45 s each side" }),
      ex("Thoracic rotation", 2, { reps: "8 each side" }),
      ex("Hamstring stretch", 2, { reps: "30-45 s each side" }),
      ex("Calf stretch", 2, { reps: "30-45 s each side" }),
      ex("Ankle mobility drill", 2, { reps: "10 each side" }),
    ],
    easier: "Shorten holds to 20 s.", harder: "Add a second round of the circuit.",
  },
  {
    name: "Injury Prevention", sport: "Strength", activityType: "Strength", intensity: "Easy", impact: "low", needs: [], equipment: ["Mini band", "Mat"],
    purpose: "Builds general resilience in the hips, feet and trunk as training load rises.",
    warmUp: "5 min easy walking, then ankle circles and hip hinges.", coolDown: STR_COOL,
    main: () => "Work slowly and stay in pain-free ranges. This supports durability; it is not a treatment.",
    exercises: (s) => [
      ex("Single-leg balance", sets(2, s), { reps: "30 s each side" }),
      ex("Glute bridge", sets(3, s), { reps: "12" }),
      ex("Banded lateral walk", sets(2, s), { reps: "10 steps each way", load: "Mini band" }),
      ex("Calf raise", sets(3, s), { reps: "12" }),
      ex("Side plank", sets(2, s), { reps: "25-40 s each side" }),
    ],
    easier: "Use 2 sets and shorter holds.", harder: "Make the balance work unstable (cushion) and add one set.",
  },
  // HYROX
  {
    name: "Sled Push", sport: "HYROX", activityType: "Strength", intensity: "Hard", impact: "medium", needs: ["sled"], equipment: ["Sled", "Turf lane"],
    purpose: "Builds leg drive for the HYROX sled push station.",
    warmUp: HX_WARM, coolDown: HX_COOL,
    main: () => "Push the sled in controlled lengths with low hips and a steady stride, resting fully between pushes.",
    exercises: (s) => [ex("Sled push", sets(5, s), { distance: "25 m", load: "Moderate (steady speed, form first)" }), ex("Walking lunge", 2, { reps: "10 each leg", load: "Bodyweight" })],
    easier: "Use a lighter load and 3 sets.", harder: "Add a set or load.",
  },
  {
    name: "Sled Pull", sport: "HYROX", activityType: "Strength", intensity: "Hard", impact: "low", needs: ["sled"], equipment: ["Sled", "Rope"],
    purpose: "Builds grip, back and hip strength for the HYROX sled pull station.",
    warmUp: HX_WARM, coolDown: HX_COOL,
    main: () => "Pull hand over hand with an upright chest and braced core, resting fully between pulls.",
    exercises: (s) => [ex("Sled pull", sets(5, s), { distance: "25 m", load: "Moderate" }), ex("Seated row", 3, { reps: "10", load: "Moderate" })],
    easier: "Use a lighter sled load.", harder: "Add a pull or load.",
  },
  {
    name: "SkiErg Intervals", sport: "HYROX", activityType: "Other", intensity: "Hard", impact: "low", needs: ["skierg"], equipment: ["SkiErg"],
    purpose: "Builds upper-body and trunk endurance for the HYROX SkiErg station.",
    warmUp: HX_WARM, coolDown: HX_COOL,
    main: (m, s) => `${s.level === 0 ? 5 : 6} x 2 min at a hard but controlled effort (RPE 7) with 90 s easy between. Keep a tall posture and drive from hips.`,
    easier: "Use 1 min work / 90 s rest.", harder: "Add 2 reps or cut rests to 60 s.",
  },
  {
    name: "Rowing Intervals", sport: "HYROX", activityType: "Other", intensity: "Hard", impact: "low", needs: ["rower"], equipment: ["Rowing machine"],
    purpose: "Builds rowing endurance for the HYROX rowing station.",
    warmUp: HX_WARM, coolDown: HX_COOL,
    main: (m, s) => `${s.level === 0 ? 4 : 5} x 3 min at a hard but controlled effort (RPE 7) with 2 min easy rowing between. Keep strokes long and smooth.`,
    easier: "Use 2 min work intervals.", harder: "Add 1 interval or extend each by 30 s.",
  },
  {
    name: "Farmers Carry", sport: "HYROX", activityType: "Strength", intensity: "Moderate", impact: "low", needs: ["carry"], equipment: ["Farmers carry handles, dumbbells or kettlebells"],
    purpose: "Builds grip, trunk and posture endurance for the HYROX farmers carry.",
    warmUp: HX_WARM, coolDown: HX_COOL,
    main: () => "Walk tall with shoulders down and a steady stride. Stop a set if your posture or grip breaks down.",
    exercises: (s) => [ex("Farmers carry", sets(5, s), { distance: "40 m", load: "Heavy but controlled" }), ex("Suitcase carry", 2, { distance: "20 m each side", load: "Moderate" })],
    easier: "Use a lighter load and 3 sets.", harder: "Add load or an extra set.",
  },
  {
    name: "Sandbag Lunges", sport: "HYROX", activityType: "Strength", intensity: "Hard", impact: "medium", needs: ["sandbag"], equipment: ["Sandbag or loaded backpack"],
    purpose: "Builds single-leg endurance for the HYROX sandbag lunges station.",
    warmUp: HX_WARM, coolDown: HX_COOL,
    main: () => "Lunge with an upright torso and the bag across the shoulders, with a full stop between rounds.",
    exercises: (s) => [ex("Sandbag walking lunge", sets(4, s), { distance: "20 m", load: "Moderate" }), ex("Glute bridge", 3, { reps: "12" })],
    easier: "Use bodyweight lunges.", harder: "Add 10 m per set or load.",
  },
  {
    name: "Wall Balls", sport: "HYROX", activityType: "Strength", intensity: "Hard", impact: "medium", needs: ["wallball"], equipment: ["Wall ball", "Wall target"],
    purpose: "Builds squat-and-throw endurance for the HYROX wall balls station.",
    warmUp: HX_WARM, coolDown: HX_COOL,
    main: () => "Squat to comfortable depth and throw to the target. Break into planned sets rather than going to failure.",
    exercises: (s) => [ex("Wall ball", sets(5, s), { reps: "10-15", load: "Light-moderate ball" })],
    easier: "Use a lighter ball and 10 reps per set.", harder: "Use 15-20 reps per set.",
  },
  {
    name: "Burpee Broad Jumps", sport: "HYROX", activityType: "Strength", intensity: "Hard", impact: "high", needs: [], equipment: ["Open floor space"],
    purpose: "Builds full-body work capacity for the HYROX burpee broad jumps station.",
    warmUp: HX_WARM, coolDown: HX_COOL,
    main: () => "Step into the burpee if needed and land softly on the jump. Rest fully between sets.",
    exercises: (s) => [ex("Burpee broad jump", sets(4, s), { distance: "10-15 m per set" })],
    easier: "Use step-back burpees and shorter jumps.", harder: "Add 5 m per set.",
  },
  {
    name: "Compromised Running", sport: "HYROX", activityType: "Run", intensity: "Hard", impact: "high", needs: ["run"], equipment: ["Running shoes", "Strength station"],
    purpose: "Practises running when the legs are tired from station work.",
    warmUp: HX_WARM, coolDown: HX_COOL,
    main: (m, s) => `${s.level === 0 ? 3 : 4} rounds of 1 km easy-steady running followed by 1 station movement (sled push, wall balls or lunges). Keep running at a comfortable, even effort.`,
    easier: "Use 500 m runs and lighter stations.", harder: "Add a round.",
  },
  {
    name: "HYROX Circuit", sport: "HYROX", activityType: "Other", intensity: "Hard", impact: "medium", needs: ["gym"], equipment: ["Gym station equipment"],
    purpose: "Combines running and station work to build HYROX-specific fitness.",
    warmUp: HX_WARM, coolDown: HX_COOL,
    main: (m, s) => `${s.level === 0 ? 3 : 4} rounds of running and stations at controlled effort (RPE 6-7), resting 2-3 min between rounds.`,
    exercises: (s) => [
      ex("Run", sets(3, s), { distance: "400 m", load: "Steady" }),
      ex("SkiErg or row", sets(3, s), { distance: "250-500 m", load: "Steady" }),
      ex("Sled push or pull", sets(3, s), { distance: "25 m", load: "Moderate" }),
      ex("Wall ball", sets(3, s), { reps: "10-15", load: "Light-moderate" }),
    ],
    easier: "Use 2 rounds and lighter loads.", harder: "Add a round or extend each segment.",
  },
  {
    name: "Race Simulation", sport: "HYROX", activityType: "Other", intensity: "Hard", impact: "high", needs: ["gym"], equipment: ["Gym station equipment"],
    purpose: "Rehearses race order, transitions and pacing with scaled stations.",
    warmUp: HX_WARM, coolDown: HX_COOL,
    main: () => "Practise the HYROX format with scaled distances and loads, alternating a run with a station. Focus on smooth transitions and steady pacing rather than speed.",
    exercises: (s) => [
      ex("Run", sets(4, s), { distance: "800 m", load: "Steady" }),
      ex("SkiErg", 1, { distance: "500 m" }),
      ex("Sled push", 1, { distance: "25 m", load: "Moderate" }),
      ex("Sled pull", 1, { distance: "25 m", load: "Moderate" }),
      ex("Burpee broad jumps", 1, { distance: "20 m" }),
      ex("Rowing", 1, { distance: "500 m" }),
      ex("Farmers carry", 1, { distance: "40 m", load: "Moderate" }),
      ex("Sandbag lunges", 1, { distance: "20 m", load: "Light-moderate" }),
      ex("Wall balls", 1, { reps: "15", load: "Light" }),
    ],
    easier: "Do half the stations at lighter loads.", harder: "Use full distances, keeping effort controlled.",
  },
];

export const WORKOUT_SPORTS: readonly WorkoutSport[] = ["Running", "Cycling", "Swimming", "Strength", "HYROX"];

const byName = new Map(WORKOUT_CATALOG.map((entry) => [entry.name, entry]));

export function catalogEntry(workoutType: string | undefined | null): CatalogEntry | null {
  return (workoutType && byName.get(workoutType)) || null;
}

export function workoutTypesForSport(sport: WorkoutSport): string[] {
  return WORKOUT_CATALOG.filter((entry) => entry.sport === sport).map((entry) => entry.name);
}

export function isWorkoutType(value: unknown): value is string {
  return typeof value === "string" && byName.has(value);
}

export function workoutSportFor(workoutType: string | undefined | null): WorkoutSport | null {
  return catalogEntry(workoutType)?.sport ?? null;
}

export function workoutImpact(workoutType: string | undefined | null): ImpactLevel {
  return catalogEntry(workoutType)?.impact ?? "medium";
}

// Equipment gating. Gym access covers common gym stations; otherEquipment text
// can name individual items.
const NEED_RULES: Record<EquipmentNeed, { items: string[]; pattern?: RegExp }> = {
  run: { items: ["Running access", "Treadmill"] },
  bike: { items: ["Road bike", "Indoor bike trainer"] },
  pool: { items: ["Pool access"] },
  openwater: { items: ["Open-water swimming access"] },
  gym: { items: ["Gym access", "Strength equipment"] },
  sled: { items: ["Sled", "Gym access"], pattern: /\bsled\b/i },
  skierg: { items: ["SkiErg", "Gym access"], pattern: /\bski ?erg\b/i },
  rower: { items: ["Rowing machine", "Gym access"], pattern: /\brow(?:ing|er)\b/i },
  sandbag: { items: ["Sandbag", "Strength equipment", "Gym access"], pattern: /\bsand ?bag\b|\bbackpack\b/i },
  wallball: { items: ["Wall ball", "Gym access"], pattern: /\bwall ?ball\b|\bmedicine ball\b/i },
  carry: { items: ["Farmers carry weights", "Strength equipment", "Gym access"], pattern: /\bkettlebell\b|\bdumbbell\b|\bcarry\b/i },
};

export type EquipmentProfile = { equipment: string[]; otherEquipment?: string };

export function hasEquipmentNeed(profile: EquipmentProfile, need: EquipmentNeed): boolean {
  const rule = NEED_RULES[need];
  return (
    rule.items.some((item) => profile.equipment.includes(item)) ||
    Boolean(rule.pattern && profile.otherEquipment && rule.pattern.test(profile.otherEquipment))
  );
}

export function workoutAvailable(workoutType: string, profile: EquipmentProfile): boolean {
  const entry = catalogEntry(workoutType);
  return Boolean(entry && entry.needs.every((need) => hasEquipmentNeed(profile, need)));
}

export function availableWorkoutTypes(profile: EquipmentProfile, sport?: WorkoutSport): string[] {
  return WORKOUT_CATALOG.filter(
    (entry) => (!sport || entry.sport === sport) && workoutAvailable(entry.name, profile),
  ).map((entry) => entry.name);
}

const levelFor = (experience: Experience): 0 | 1 | 2 =>
  experience === "Beginner" ? 0 : experience === "Advanced" || experience === "Competitive" ? 2 : 1;

const LIMITATION_NOTE =
  " Keep effort within a comfortable range, and stop or swap the session if symptoms worsen. If discomfort persists, consider checking in with a qualified health professional.";

/** Structured detail for a catalog workout, scaled to the athlete and phase. */
export function buildWorkoutStructure(
  workoutType: string,
  durationMinutes: number,
  context: WorkoutBuildContext,
): Required<WorkoutStructure> | null {
  const entry = catalogEntry(workoutType);
  if (!entry) return null;
  const scale: Scale = {
    level: levelFor(context.experience),
    hard: ["Build", "Peak"].includes(context.phase ?? "") && !context.recovery,
  };
  const reduce = context.recovery || Boolean(context.hasLimitations);
  const minutes = Math.max(10, Math.round(durationMinutes));
  const mainMinutes = Math.max(10, minutes - (entry.sport === "Strength" || entry.sport === "HYROX" ? 15 : 12));
  const exercises = entry.exercises?.(scale) ?? [];
  const lighter = reduce
    ? exercises.map((exercise) => ({ ...exercise, sets: exercise.sets ? Math.max(1, exercise.sets - 1) : exercise.sets }))
    : exercises;
  return {
    workoutType: entry.name,
    warmUp: entry.warmUp,
    mainSet: entry.main(mainMinutes, scale) + (context.recovery ? " This is a recovery week, so keep it relaxed." : ""),
    coolDown: entry.coolDown,
    equipment: [...entry.equipment],
    exercises: lighter,
    easierOption: entry.easier,
    harderOption: context.recovery ? "Stay with the planned effort this week and save extra work for next week." : entry.harder,
  };
}

/** Full activity for a catalog workout. */
export function buildWorkoutActivity(
  workoutType: string,
  durationMinutes: number,
  context: WorkoutBuildContext & { intensity?: PlannedIntensity; purpose?: string; id?: string; distance?: number },
): PlannedActivity | null {
  const entry = catalogEntry(workoutType);
  const structure = buildWorkoutStructure(workoutType, durationMinutes, context);
  if (!entry || !structure) return null;
  const intensity: PlannedIntensity =
    context.intensity ??
    (context.experience === "Beginner" && entry.intensity === "Hard" ? "Moderate" : entry.intensity);
  return {
    id: context.id ?? globalThis.crypto.randomUUID(),
    activityType: entry.activityType,
    durationMinutes,
    ...(context.distance ? { distance: context.distance } : {}),
    intensity,
    instructions: structure.mainSet + (context.hasLimitations ? LIMITATION_NOTE : ""),
    purpose: context.purpose ?? entry.purpose,
    ...structure,
  };
}

const MAX_TEXT = 600;
const text = (value: unknown, max = MAX_TEXT) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;

function normalizeExercises(value: unknown): WorkoutExercise[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list: WorkoutExercise[] = [];
  for (const item of value.slice(0, 20)) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const name = text(record.name, 80);
    if (!name) continue;
    const setCount = typeof record.sets === "number" && Number.isFinite(record.sets) ? Math.min(20, Math.max(1, Math.round(record.sets))) : undefined;
    const repsValue = typeof record.reps === "number" ? String(record.reps) : text(record.reps, 40);
    list.push({
      name,
      ...(setCount ? { sets: setCount } : {}),
      ...(repsValue ? { reps: repsValue } : {}),
      ...(text(record.distance, 40) ? { distance: text(record.distance, 40) } : {}),
      ...(text(record.load, 60) ? { load: text(record.load, 60) } : {}),
      ...(text(record.notes, 200) ? { notes: text(record.notes, 200) } : {}),
    });
  }
  return list.length ? list : undefined;
}

/**
 * Validates the optional structured fields of an activity. Unknown workout
 * types are dropped, so old plans and malformed input degrade to the plain
 * activity instead of failing.
 */
export function normalizeWorkoutStructure(value: unknown): WorkoutStructure {
  if (typeof value !== "object" || value === null) return {};
  const record = value as Record<string, unknown>;
  const equipment = Array.isArray(record.equipment)
    ? record.equipment.map((item) => text(item, 60)).filter((item): item is string => Boolean(item)).slice(0, 12)
    : [];
  const exercises = normalizeExercises(record.exercises);
  return {
    ...(isWorkoutType(record.workoutType) ? { workoutType: record.workoutType } : {}),
    ...(text(record.warmUp) ? { warmUp: text(record.warmUp) } : {}),
    ...(text(record.mainSet) ? { mainSet: text(record.mainSet) } : {}),
    ...(text(record.coolDown) ? { coolDown: text(record.coolDown) } : {}),
    ...(equipment.length ? { equipment } : {}),
    ...(exercises ? { exercises } : {}),
    ...(text(record.easierOption) ? { easierOption: text(record.easierOption) } : {}),
    ...(text(record.harderOption) ? { harderOption: text(record.harderOption) } : {}),
  };
}

export function structureTexts(structure: WorkoutStructure): string[] {
  return [
    structure.warmUp,
    structure.mainSet,
    structure.coolDown,
    structure.easierOption,
    structure.harderOption,
    ...(structure.equipment ?? []),
    ...(structure.exercises ?? []).flatMap((item) => [item.name, item.notes]),
  ].filter((item): item is string => Boolean(item));
}

// The Coach may adapt training around discomfort but must not diagnose or
// promise that a workout treats, cures or fixes a problem.
const DIAGNOSIS =
  /\b(?:you (?:have|likely have|probably have|may have|might have)|this (?:is|sounds like|looks like|could be)|diagnos\w*)\b[^.]{0,40}\b(?:tendin\w*|tendon\w*|bursitis|stress fracture|fracture|sprain|strain|tear|torn|meniscus|acl|mcl|runner'?s knee|patell\w*|itbs|it band|plantar fasciitis|shin splints|arthritis|syndrome|injury|injured)\b|\bdiagnos(?:is|e|ed|ing)\b/i;
const CURE =
  /\b(?:cure[sd]?|heal[sd]?|healing|fix(?:es|ed)?|treat(?:s|ed|ment)?|rehab(?:ilitate|ilitates)?|eliminate[sd]?|get rid of|guarantee[sd]?|prevent[s]? (?:injury|injuries|pain))\b[^.]{0,40}\b(?:pain|injury|injuries|knee|hip|achilles|shin|tendon|ache|soreness|discomfort|problem|issue)\b|\b(?:will|can|should) (?:cure|heal|fix|treat|eliminate|get rid of)\b/i;

/** Returns a description of the unsafe medical claim, or null. */
export function findUnsafeMedicalClaim(value: string): string | null {
  const match = DIAGNOSIS.exec(value) ?? CURE.exec(value);
  return match ? `"${match[0].trim().slice(0, 60)}" reads as a diagnosis or cure claim` : null;
}
