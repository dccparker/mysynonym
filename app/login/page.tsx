"use client";

import { ArrowRight, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

type AuthMode = "signin" | "signup";

export function AuthPage({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const result =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            })
          : await supabase.auth.signUp({
              email: email.trim(),
              password,
            });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      if (mode === "signup" && !result.data.session) {
        setNotice("Check your email for a confirmation link to finish creating your account.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We couldn't connect to MySynonym. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const isSignUp = mode === "signup";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090d0b] px-4 py-10 text-[#eef2ed] sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-48 size-[34rem] rounded-full bg-[#b8f36b]/[0.06] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-64 -right-40 size-[34rem] rounded-full bg-[#b8f36b]/[0.04] blur-3xl"
      />

      <section className="relative w-full max-w-[440px]">
        <Link
          aria-label="MySynonym home"
          className="mb-8 flex w-fit items-center gap-3"
          href="/"
        >
          <Image
            alt=""
            className="size-10 rounded-xl object-cover"
            height={40}
            src="/mysynonym-icon.png"
            width={40}
          />
          <span className="text-lg font-semibold tracking-[-0.03em] text-white">
            my<span className="text-[#b8f36b]">synonym</span>
          </span>
        </Link>

        <div className="rounded-2xl border border-white/[0.08] bg-[#0e1411]/95 p-6 shadow-2xl shadow-black/30 sm:p-9">
          <div className="mb-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a6d66e]">
              Your training, in sync
            </p>
            <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-[#f2f5f1]">
              {isSignUp ? "Create your account" : "Welcome back"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#8c9990]">
              {isSignUp
                ? "Start bringing your training, recovery, and fueling together."
                : "Sign in to pick up where your training journey left off."}
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label
                className="mb-2 block text-xs font-medium text-[#d4ddd5]"
                htmlFor="email"
              >
                Email address
              </label>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#718076]"
                  size={16}
                />
                <input
                  autoComplete="email"
                  className="h-12 w-full rounded-lg border border-white/[0.09] bg-[#090e0b] pl-10 pr-3 text-sm text-[#eef2ed] outline-none transition placeholder:text-[#59655d] focus:border-[#b8f36b]/60 focus:ring-2 focus:ring-[#b8f36b]/10"
                  id="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={email}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  className="block text-xs font-medium text-[#d4ddd5]"
                  htmlFor="password"
                >
                  Password
                </label>
                {isSignUp && (
                  <span className="text-[10px] text-[#77847b]">
                    At least 8 characters
                  </span>
                )}
              </div>
              <div className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#718076]"
                  size={16}
                />
                <input
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  className="h-12 w-full rounded-lg border border-white/[0.09] bg-[#090e0b] pl-10 pr-3 text-sm text-[#eef2ed] outline-none transition placeholder:text-[#59655d] focus:border-[#b8f36b]/60 focus:ring-2 focus:ring-[#b8f36b]/10"
                  id="password"
                  minLength={isSignUp ? 8 : undefined}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                  type="password"
                  value={password}
                />
              </div>
            </div>

            {error && (
              <p
                className="rounded-lg border border-red-400/20 bg-red-400/[0.07] px-3.5 py-3 text-xs leading-5 text-red-200"
                role="alert"
              >
                {error}
              </p>
            )}
            {notice && (
              <p
                className="rounded-lg border border-[#b8f36b]/20 bg-[#b8f36b]/[0.06] px-3.5 py-3 text-xs leading-5 text-[#d5edb5]"
                role="status"
              >
                {notice}
              </p>
            )}

            <button
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#b8f36b] px-4 text-sm font-semibold text-[#142010] transition hover:bg-[#c8ff7c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8f36b] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />
                  {isSignUp ? "Creating account…" : "Signing in…"}
                </>
              ) : (
                <>
                  {isSignUp ? "Create account" : "Sign in"}
                  <ArrowRight aria-hidden="true" size={16} />
                </>
              )}
            </button>
          </form>

          <div className="mt-7 border-t border-white/[0.07] pt-6 text-center">
            <p className="text-xs text-[#8c9990]">
              {isSignUp ? "Already have an account?" : "New to MySynonym?"}{" "}
              <Link
                className="font-semibold text-[#c2f680] transition hover:text-[#d8ff9b]"
                href={isSignUp ? "/login" : "/signup"}
              >
                {isSignUp ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-[10px] leading-5 text-[#657168]">
          By continuing, you agree to use MySynonym to support your training
          journey.
        </p>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <AuthPage mode="signin" />;
}
