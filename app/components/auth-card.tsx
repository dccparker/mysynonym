import Link from "next/link";
import type { ReactNode } from "react";

export const authInputClass =
  "h-12 w-full rounded-lg border border-white/[0.09] bg-[#090e0b] px-3.5 text-sm text-[#eef2ed] outline-none transition placeholder:text-[#59655d] focus:border-[#b8f36b]/60 focus:ring-2 focus:ring-[#b8f36b]/10";
export const authButtonClass =
  "flex h-12 w-full items-center justify-center rounded-lg bg-[#b8f36b] px-4 text-sm font-semibold text-[#142010] transition hover:bg-[#c8ff7c] disabled:cursor-not-allowed disabled:opacity-60";

export function AuthCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090d0b] px-4 py-10 text-[#eef2ed]">
      <section className="w-full max-w-[440px] rounded-2xl border border-white/[0.08] bg-[#0e1411]/95 p-6 sm:p-9">
        <h1 className="text-[26px] font-semibold tracking-[-0.04em] text-[#f2f5f1]">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-[#8c9990]">{description}</p>
        <div className="mt-7">{children}</div>
        <p className="mt-7 border-t border-white/[0.07] pt-5 text-center text-xs text-[#8c9990]">
          <Link className="font-semibold text-[#c2f680] hover:text-[#d8ff9b]" href="/login">
            Back to sign in
          </Link>
        </p>
      </section>
    </main>
  );
}

export function FormMessage({ kind, children }: { kind: "error" | "notice"; children: ReactNode }) {
  return (
    <p
      className={`rounded-lg border px-3.5 py-3 text-xs leading-5 ${
        kind === "error"
          ? "border-red-400/20 bg-red-400/[0.07] text-red-200"
          : "border-[#b8f36b]/20 bg-[#b8f36b]/[0.06] text-[#d5edb5]"
      }`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
