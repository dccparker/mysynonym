"use client";

import { ChevronDown, LogOut, Settings2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAthleteProfile } from "../lib/athlete-profile";

export function ProfileMenu({
  onSignOut,
  isSigningOut,
  signOutError,
}: {
  onSignOut: () => void;
  isSigningOut: boolean;
  signOutError: string;
}) {
  const { profile } = useAthleteProfile();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const name = profile?.preferredName.trim() || "Athlete";
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "A";

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
      } else if (!container.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="relative" ref={container}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Athlete profile menu"
        className="flex items-center gap-2 rounded-lg border border-white/[0.08] py-1 pl-1 pr-2 text-[#aab5ad] transition-colors hover:border-white/[0.16] hover:text-[#e8eee9]"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="flex size-7 items-center justify-center rounded-full border border-[#607263] bg-[#29362d] text-[11px] font-semibold text-[#d7e7d8]">
          {initials}
        </span>
        <ChevronDown aria-hidden="true" size={14} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-white/[0.08] bg-[#111714] p-1.5 shadow-xl shadow-black/40"
          role="menu"
        >
          <p className="truncate px-3 py-2 text-xs font-medium text-[#e5ebe6]">{name}</p>
          <Link
            className="flex items-center gap-3 rounded-md px-3 py-2 text-xs font-medium text-[#8b9790] hover:bg-[#171e1a] hover:text-[#e8eee9]"
            href="/settings"
            onClick={() => setOpen(false)}
            role="menuitem"
          >
            <Settings2 aria-hidden="true" size={15} />
            Profile settings
          </Link>
          <button
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-xs font-medium text-[#8b9790] hover:bg-[#171e1a] hover:text-[#e8eee9] disabled:cursor-wait disabled:opacity-60"
            disabled={isSigningOut}
            onClick={onSignOut}
            role="menuitem"
            type="button"
          >
            <LogOut aria-hidden="true" size={15} />
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
          {signOutError && (
            <p className="px-3 py-2 text-[11px] leading-4 text-red-300" role="alert">
              {signOutError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
