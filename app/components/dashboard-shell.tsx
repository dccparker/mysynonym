"use client";

import {
  Bell,
  ChevronRight,
  Dumbbell,
  History,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Settings2,
  Sparkles,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { calculateAge, formatTargetEvent, useAthleteProfile } from "../lib/athlete-profile";
import { supabase } from "../lib/supabase";

type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const navigation: NavigationItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Training", href: "/training", icon: Dumbbell },
  { label: "History", href: "/history", icon: History },
  { label: "Recovery", href: "/recovery", icon: HeartPulse },
  { label: "Nutrition", href: "/nutrition", icon: Utensils },
  { label: "AI Coach", href: "/coach", icon: Sparkles },
  { label: "Settings", href: "/settings", icon: Settings2 },
];

function Brand() {
  return (
    <Link className="flex items-center gap-3" href="/" aria-label="MySynonym home">
      <Image
        alt=""
        className="size-9 shrink-0 rounded-xl object-cover"
        height={36}
        src="/mysynonym-icon.png"
        width={36}
      />
      <span className="text-[17px] font-semibold tracking-[-0.02em] text-white">
        my<span className="text-[#b8f36b]">synonym</span>
      </span>
    </Link>
  );
}

function NavigationLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={mobile ? "Mobile navigation" : "Main navigation"}
      className={mobile ? "flex min-w-max items-center gap-1" : "grid gap-1"}
    >
      {navigation.map(({ label, href, icon: Icon }) => {
        const isActive = pathname === href;

        return (
          <Link
            key={label}
            aria-current={isActive ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
              mobile ? "shrink-0" : ""
            } ${
              isActive
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
          </Link>
        );
      })}
    </nav>
  );
}

function Sidebar({
  onSignOut,
  isSigningOut,
  signOutError,
}: {
  onSignOut: () => void;
  isSigningOut: boolean;
  signOutError: string;
}) {
  const { profile } = useAthleteProfile();
  const age = profile ? calculateAge(profile.dateOfBirth) : null;
  const weight = profile?.weightKg === null || profile?.weightKg === undefined
    ? null
    : profile.units === "Imperial"
      ? `${Number((profile.weightKg * 2.2046226218).toFixed(1))} lb`
      : `${Number(profile.weightKg.toFixed(1))} kg`;
  const initials = profile?.preferredName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "A";
  const currentGoal = profile?.primaryGoal === "Custom"
    ? profile.customGoalName || "Custom goal"
    : profile?.primaryGoal || "Goal not set";
  const targetEvent = profile ? formatTargetEvent(profile) : "Target event not set";

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
            <span>Current goal</span>
            <span className="text-[#dce4dd]">{profile?.weeklyTrainingHours !== null && profile?.weeklyTrainingHours !== undefined ? `${profile.weeklyTrainingHours} hrs/wk` : "Availability not set"}</span>
          </div>
          <p className="mt-2 text-xs font-medium text-[#dce4dd]">{currentGoal}</p>
          <p className="mt-1 truncate text-[10px] text-[#69766e]">{targetEvent}</p>
        </div>
        <Link
          className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-[#171e1a]"
          href="/settings"
        >
          <span className="flex size-9 items-center justify-center rounded-full border border-[#607263] bg-[#29362d] text-xs font-semibold text-[#d7e7d8]">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-[#e5ebe6]">{profile?.preferredName || "Athlete"}</span>
            <span className="mt-0.5 block truncate text-[10px] text-[#77837b]">
              {age === null ? "Age not set" : `Age ${age}`} · {weight ?? "Weight not set"} · {profile?.units ?? "Units not set"}
            </span>
          </span>
          <ChevronRight size={15} className="text-[#69766e]" />
        </Link>
        <button
          className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-[#8b9790] transition-colors hover:bg-[#171e1a] hover:text-[#e8eee9] disabled:cursor-wait disabled:opacity-60"
          disabled={isSigningOut}
          onClick={onSignOut}
          type="button"
        >
          <LogOut aria-hidden="true" size={16} />
          {isSigningOut ? "Signing out…" : "Sign out"}
        </button>
        {signOutError && (
          <p className="mt-2 px-3 text-[10px] leading-4 text-red-300" role="alert">
            {signOutError}
          </p>
        )}
      </div>
    </aside>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  if (pathname === "/login" || pathname === "/signup") {
    return children;
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    setSignOutError("");

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        setSignOutError(error.message);
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch (signOutFailure) {
      setSignOutError(
        signOutFailure instanceof Error
          ? signOutFailure.message
          : "We couldn't sign you out. Please try again.",
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-[#090d0b] text-[#eef2ed]">
      <Sidebar
        isSigningOut={isSigningOut}
        onSignOut={handleSignOut}
        signOutError={signOutError}
      />
      <div className="min-w-0 flex-1">
        <header className="border-b border-white/[0.07] bg-[#0b100e]/95 px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <Brand />
            <div className="flex items-center gap-2">
              <button
                aria-label="Notifications"
                className="flex size-9 items-center justify-center rounded-lg border border-white/[0.08] text-[#aab5ad]"
                type="button"
              >
                <Bell size={16} />
              </button>
              <button
                aria-label="Sign out"
                className="flex size-9 items-center justify-center rounded-lg border border-white/[0.08] text-[#aab5ad] transition-colors hover:border-white/[0.16] hover:text-[#e8eee9] disabled:cursor-wait disabled:opacity-60"
                disabled={isSigningOut}
                onClick={handleSignOut}
                type="button"
              >
                <LogOut aria-hidden="true" size={16} />
              </button>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            <NavigationLinks mobile />
          </div>
          {signOutError && (
            <p className="mt-2 text-xs leading-5 text-red-300" role="alert">
              {signOutError}
            </p>
          )}
        </header>
        {children}
      </div>
    </main>
  );
}
