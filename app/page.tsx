import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Dumbbell,
  Footprints,
  Heart,
  HeartPulse,
  LayoutDashboard,
  Moon,
  Settings2,
  Sparkles,
  Target,
  Utensils,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";

type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const navigation: NavigationItem[] = [
  { label: "Dashboard", href: "#dashboard", icon: LayoutDashboard },
  { label: "Training", href: "#training", icon: Dumbbell },
  { label: "Recovery", href: "#recovery", icon: HeartPulse },
  { label: "Nutrition", href: "#nutrition", icon: Utensils },
  { label: "AI Coach", href: "#coach", icon: Sparkles },
];

const weeklyTraining = [
  { day: "Mon", hours: 1.5 },
  { day: "Tue", hours: 0 },
  { day: "Wed", hours: 2.1 },
  { day: "Thu", hours: 1.25 },
  { day: "Fri", hours: 0.9 },
  { day: "Sat", hours: 1.05 },
  { day: "Sun", hours: 1.2 },
];

function Brand() {
  return (
    <a className="flex items-center gap-3" href="#dashboard" aria-label="MySynonym home">
      <span className="flex size-9 items-center justify-center rounded-xl bg-[#b8f36b] text-[#102010]">
        <Activity size={19} strokeWidth={2.5} />
      </span>
      <span className="text-[17px] font-semibold tracking-[-0.02em] text-white">
        my<span className="text-[#b8f36b]">synonym</span>
      </span>
    </a>
  );
}

function NavigationLinks({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav
      aria-label={mobile ? "Mobile navigation" : "Main navigation"}
      className={mobile ? "flex min-w-max items-center gap-1" : "grid gap-1"}
    >
      {navigation.map(({ label, href, icon: Icon }, index) => (
        <a
          key={label}
          aria-current={index === 0 ? "page" : undefined}
          className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
            mobile ? "shrink-0" : ""
          } ${
            index === 0
              ? "bg-[#1b2520] text-[#c2f680]"
              : "text-[#8b9790] hover:bg-[#171e1a] hover:text-[#e8eee9]"
          }`}
          href={href}
        >
          <Icon size={17} strokeWidth={1.8} />
          {label}
          {label === "AI Coach" && !mobile && (
            <span className="ml-auto rounded bg-[#b8f36b]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#b8f36b]">
              New
            </span>
          )}
        </a>
      ))}
      <a
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#8b9790] transition-colors hover:bg-[#171e1a] hover:text-[#e8eee9] ${
          mobile ? "shrink-0" : ""
        }`}
        href="#settings"
      >
        <Settings2 size={17} strokeWidth={1.8} />
        Settings
      </a>
    </nav>
  );
}

function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-[244px] shrink-0 flex-col border-r border-white/[0.07] bg-[#0b100e] px-4 py-6 lg:flex">
      <div className="px-2">
        <Brand />
      </div>
      <div className="mt-10 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#56625b]">
        Workspace
      </div>
      <div className="mt-3">
        <NavigationLinks />
      </div>
      <div className="mt-auto">
        <div className="mb-4 rounded-lg border border-white/[0.07] bg-[#111714] p-3.5">
          <div className="flex items-center justify-between text-[11px] text-[#87938b]">
            <span>Ironman build</span>
            <span className="text-[#dce4dd]">42%</span>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-[#26312b]">
            <div className="h-full w-[42%] rounded-full bg-[#b8f36b]" />
          </div>
          <p className="mt-2.5 text-[10px] text-[#69766e]">Base phase · Week 6 of 14</p>
        </div>
        <a
          className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-[#171e1a]"
          href="#settings"
        >
          <span className="flex size-9 items-center justify-center rounded-full border border-[#607263] bg-[#29362d] text-xs font-semibold text-[#d7e7d8]">
            JM
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-[#e5ebe6]">Jordan Miller</span>
            <span className="mt-0.5 block text-[10px] text-[#77837b]">Age 31 · 195 lb</span>
          </span>
          <ChevronRight size={15} className="text-[#69766e]" />
        </a>
      </div>
    </aside>
  );
}

function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#748078]">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-[#eef2ed]">
          {title}
        </h2>
      </div>
      {action && (
        <a
          className="mb-0.5 inline-flex items-center gap-1.5 text-xs font-medium text-[#a6b1a9] transition-colors hover:text-[#c2f680]"
          href="#training"
        >
          {action}
          <ArrowRight size={14} />
        </a>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  unit,
  note,
  icon: Icon,
  tone = "green",
  id,
}: {
  label: string;
  value: string;
  unit?: string;
  note: string;
  icon: LucideIcon;
  tone?: "green" | "blue" | "orange";
  id?: string;
}) {
  const tones = {
    green: "text-[#b8f36b] bg-[#b8f36b]/10",
    blue: "text-[#8dd7e5] bg-[#8dd7e5]/10",
    orange: "text-[#f0b47c] bg-[#f0b47c]/10",
  };

  return (
    <article
      id={id}
      className="min-w-0 rounded-lg border border-white/[0.07] bg-[#111714] p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-[#99a49d]">{label}</p>
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon size={16} strokeWidth={1.8} />
        </span>
      </div>
      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="text-[27px] font-semibold leading-none tracking-[-0.04em] text-[#f2f5f1]">
          {value}
        </span>
        {unit && <span className="text-xs text-[#849088]">{unit}</span>}
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 text-[10px] text-[#829087]">
        <ArrowUpRight size={12} className="text-[#b8f36b]" />
        {note}
      </p>
    </article>
  );
}

function ReadinessCard() {
  return (
    <article
      className="flex min-h-[228px] flex-col justify-between overflow-hidden rounded-lg border border-[#b8f36b]/15 p-5 sm:p-6"
      style={{
        background:
          "radial-gradient(ellipse at 10% 0%, rgba(184,243,107,0.12), transparent 48%), #111714",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[#aeb9b1]">Readiness score</p>
          <p className="mt-1 text-[11px] text-[#78857c]">Your body is ready to work</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-[#b8f36b]/15 bg-[#b8f36b]/[0.07] px-2.5 py-1 text-[10px] font-medium text-[#c5ef97]">
          <span className="size-1.5 rounded-full bg-[#b8f36b]" />
          Optimal
        </span>
      </div>
      <div className="mt-5 flex items-center gap-5 sm:gap-6">
        <div
          aria-label="Readiness score 82 out of 100"
          className="size-[112px] shrink-0 rounded-full p-[7px]"
          role="img"
          style={{
            background:
              "conic-gradient(#b8f36b 0deg 295deg, rgba(255,255,255,0.08) 295deg 360deg)",
          }}
        >
          <div className="flex size-full flex-col items-center justify-center rounded-full bg-[#111714]">
            <span className="text-[35px] font-semibold leading-none tracking-[-0.06em] text-white">82</span>
            <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.12em] text-[#829087]">of 100</span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#d8e2d9]">
            <Zap size={14} className="text-[#b8f36b]" />
            Strong recovery
          </div>
          <p className="mt-2 max-w-[200px] text-[11px] leading-[1.6] text-[#89958c]">
            Solid sleep and a calm resting heart rate put you in a good spot for today&apos;s work.
          </p>
        </div>
      </div>
    </article>
  );
}

function WeeklyProgress() {
  return (
    <article id="training" className="rounded-lg border border-white/[0.07] bg-[#111714] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#a6b1a9]">Training volume</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[30px] font-semibold leading-none tracking-[-0.05em] text-[#f1f4f0]">8.0</span>
            <span className="text-xs text-[#849088]">/ 10 hrs</span>
          </div>
        </div>
        <div className="rounded-md border border-white/[0.07] bg-[#171e1a] px-2.5 py-1.5 text-[10px] text-[#a2ada5]">
          This week <ChevronRight size={12} className="ml-1 inline" />
        </div>
      </div>
      <div className="mt-5 flex items-center gap-2 text-[10px] text-[#7f8c83]">
        <span className="size-1.5 rounded-full bg-[#b8f36b]" />
        80% of weekly target
        <span className="ml-auto text-[#68756d]">Goal: 10 hrs</span>
      </div>
      <div
        aria-label="Weekly training hours: Monday 1.5, Tuesday 0, Wednesday 2.1, Thursday 1.25, Friday 0.9, Saturday 1.05, Sunday 1.2"
        className="mt-4 grid h-[116px] grid-cols-7 items-end gap-2 sm:gap-3"
        role="img"
      >
        {weeklyTraining.map(({ day, hours }) => (
          <div key={day} className="flex h-full flex-col items-center justify-end gap-2">
            <div className="flex h-[91px] w-full items-end overflow-hidden rounded-[3px] bg-[#1c2520]">
              {hours > 0 && (
                <div
                  className={`w-full rounded-[3px] ${day === "Sun" ? "bg-[#d0f79d]" : "bg-[#769c52]"}`}
                  style={{ height: `${(hours / 2.5) * 100}%` }}
                />
              )}
            </div>
            <span className={`text-[9px] ${day === "Sun" ? "font-semibold text-[#d4e9ba]" : "text-[#758178]"}`}>
              {day}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function GoalCard() {
  return (
    <article className="rounded-lg border border-white/[0.07] bg-[#111714] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-[#a6b1a9]">Current goal</p>
        <span className="flex size-8 items-center justify-center rounded-lg bg-[#8dd7e5]/10 text-[#8dd7e5]">
          <Target size={16} />
        </span>
      </div>
      <h3 className="mt-4 text-[21px] font-semibold tracking-[-0.03em] text-[#f0f4ef]">Ironman 2027</h3>
      <p className="mt-1 text-[11px] text-[#849088]">Build the engine. Trust the process.</p>
      <div className="mt-5 grid grid-cols-2 gap-3 border-y border-white/[0.07] py-4">
        <div>
          <p className="text-[10px] text-[#78857d]">Weekly volume</p>
          <p className="mt-1 text-sm font-medium text-[#dce4dd]">8 hours</p>
        </div>
        <div>
          <p className="text-[10px] text-[#78857d]">Training phase</p>
          <p className="mt-1 text-sm font-medium text-[#dce4dd]">Base · Week 6</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] text-[#7e8a82]">
          <CalendarDays size={13} /> Race season 2027
        </span>
        <span className="text-[10px] font-medium text-[#b8f36b]">On track</span>
      </div>
    </article>
  );
}

function WorkoutCard() {
  return (
    <article className="rounded-lg border border-white/[0.07] bg-[#111714] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[#a6b1a9]">Next session</p>
          <h3 className="mt-2 text-[18px] font-semibold tracking-[-0.025em] text-[#eef2ed]">Aerobic foundation run</h3>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f0b47c]/10 text-[#f0b47c]">
          <Footprints size={17} />
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-[#8a968e]">
        <span className="flex items-center gap-1.5"><CalendarDays size={13} /> Mon, Oct 12</span>
        <span className="flex items-center gap-1.5"><Clock3 size={13} /> 6:30 AM · 60 min</span>
        <span className="flex items-center gap-1.5"><Heart size={13} /> Zone 2 · 135–150 bpm</span>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-white/[0.07] pt-4">
        <p className="max-w-[330px] text-[11px] leading-relaxed text-[#869289]">
          Keep it conversational. Finish with 4 × 20-second relaxed strides if your legs feel good.
        </p>
        <a
          aria-label="View workout details"
          className="ml-3 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-[#aab5ad] transition-colors hover:border-[#b8f36b]/30 hover:text-[#c5ef97]"
          href="#training"
        >
          <ArrowRight size={15} />
        </a>
      </div>
    </article>
  );
}

function CoachCard() {
  return (
    <article id="coach" className="rounded-lg border border-[#8dd7e5]/15 bg-[#111714] p-5 sm:p-6">
      <div className="flex items-center gap-2 text-[#8dd7e5]">
        <Sparkles size={15} />
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em]">Coach&apos;s note</p>
      </div>
      <p className="mt-4 text-[13px] font-medium leading-relaxed text-[#e5ebe6]">
        You&apos;re absorbing the work well. Keep tomorrow&apos;s run easy and let consistency do its thing.
      </p>
      <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-3 text-[10px] text-[#78857d]">
        <span>Based on your last 7 days</span>
        <span className="flex items-center gap-1 text-[#8dd7e5]">View insight <ArrowRight size={12} /></span>
      </div>
    </article>
  );
}

function NutritionCard() {
  return (
    <article id="nutrition" className="rounded-lg border border-white/[0.07] bg-[#111714] p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[#a6b1a9]">Today&apos;s fueling</p>
        <Utensils size={15} className="text-[#f0b47c]" />
      </div>
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-[25px] font-semibold leading-none tracking-[-0.04em] text-[#f1f4f0]">1,840</span>
        <span className="text-[10px] text-[#7f8b83]">/ 2,600 kcal</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#222c26]">
        <div className="h-full w-[71%] rounded-full bg-[#dca775]" />
      </div>
      <div className="mt-4 flex justify-between text-[10px]">
        <span className="text-[#8c9890]">Protein <strong className="ml-1 font-medium text-[#d9e0da]">118g</strong></span>
        <span className="text-[#8c9890]">Carbs <strong className="ml-1 font-medium text-[#d9e0da]">206g</strong></span>
      </div>
    </article>
  );
}

function RecoverySummary() {
  return (
    <section id="recovery" aria-label="Recovery metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <MetricCard label="Sleep" value="7h 42m" note="+38 min vs. 30-day avg" icon={Moon} />
      <MetricCard label="HRV" value="68" unit="ms" note="+5 ms vs. baseline" icon={HeartPulse} tone="blue" />
      <MetricCard label="Resting heart rate" value="49" unit="bpm" note="2 bpm below baseline" icon={Heart} tone="orange" />
    </section>
  );
}

export default function Home() {
  return (
    <main className="flex min-h-screen bg-[#090d0b] text-[#eef2ed]">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <header className="border-b border-white/[0.07] bg-[#0b100e]/95 px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <Brand />
            <button
              aria-label="Notifications"
              className="flex size-9 items-center justify-center rounded-lg border border-white/[0.08] text-[#aab5ad]"
              type="button"
            >
              <Bell size={16} />
            </button>
          </div>
          <div className="mt-3 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            <NavigationLinks mobile />
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-9 lg:py-8">
          <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#839087]">Sunday, October 11</p>
              <h1 className="mt-2 text-[25px] font-semibold tracking-[-0.04em] text-[#f1f4f0] sm:text-[29px]">
                Good morning, Jordan<span className="text-[#b8f36b]">.</span>
              </h1>
              <p className="mt-1.5 text-xs text-[#87938b]">A clear read on your training, recovery, and what comes next.</p>
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              <span className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#111714] px-3 py-2 text-[10px] text-[#a4afa7]">
                <span className="size-1.5 rounded-full bg-[#b8f36b]" />
                Data updated 7:12 AM
              </span>
              <button
                aria-label="Notifications"
                className="flex size-9 items-center justify-center rounded-lg border border-white/[0.08] bg-[#111714] text-[#aab5ad] transition-colors hover:text-white"
                type="button"
              >
                <Bell size={15} />
              </button>
            </div>
          </header>

          <div id="dashboard" className="grid grid-cols-1 gap-3 xl:grid-cols-12">
            <div className="xl:col-span-5"><ReadinessCard /></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:col-span-7">
              <RecoverySummary />
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-12">
            <section className="lg:col-span-7">
              <SectionHeading eyebrow="The big picture" title="Weekly progress" action="Training plan" />
              <WeeklyProgress />
            </section>
            <section className="lg:col-span-5">
              <SectionHeading eyebrow="Your north star" title="Goal & plan" />
              <GoalCard />
            </section>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-12">
            <section className="lg:col-span-7">
              <SectionHeading eyebrow="Up next" title="Upcoming workout" action="View schedule" />
              <WorkoutCard />
            </section>
            <section className="lg:col-span-5">
              <SectionHeading eyebrow="Daily guidance" title="In your corner" />
              <CoachCard />
            </section>
          </div>

          <section className="mt-8" aria-label="Nutrition">
            <SectionHeading eyebrow="Eat for the work" title="Fuel check-in" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <NutritionCard />
              <article className="flex items-center justify-between gap-5 rounded-lg border border-white/[0.07] bg-[#111714] p-5 sm:px-6">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#8dd7e5]/10 text-[#8dd7e5]"><Waves size={17} /></span>
                  <div>
                    <p className="text-xs font-medium text-[#e3eae4]">Hydration</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-[#839087]">1.6 L logged · aim for another 1.2 L today</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-[#b8f36b]"><Check size={13} /> On pace</div>
              </article>
            </div>
          </section>

          <footer id="settings" className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] py-5 text-[10px] text-[#68756d]">
            <p>Mock athlete profile · Jordan Miller · Age 31 · 195 lb</p>
            <a className="inline-flex items-center gap-1.5 transition-colors hover:text-[#b8f36b]" href="#settings">
              <CircleHelp size={13} /> Profile & settings <ChevronRight size={12} />
            </a>
          </footer>
        </div>
      </div>
    </main>
  );
}