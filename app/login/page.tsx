"use client";

import { ArrowRight, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  friendlyAuthError,
  SIGNED_OUT_FLAG,
  isObfuscatedDuplicateSignup,
  isUnconfirmedEmail,
  validatePassword,
} from "../lib/auth-messages";
import { supabase } from "../lib/supabase";

type AuthMode = "signin" | "signup";

export function AuthPage({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canResend, setCanResend] = useState(false);

  const [toast, setToast] = useState("");

  useEffect(() => {
    if (window.sessionStorage.getItem(SIGNED_OUT_FLAG)) {
      window.sessionStorage.removeItem(SIGNED_OUT_FLAG);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToast("You've been signed out.");
      const timer = window.setTimeout(() => setToast(""), 5000);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router]);

  async function handleResend() {
    setError("");
    setNotice("");
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (resendError) setError(friendlyAuthError(resendError, "signin"));
    else setNotice("Confirmation email sent. Check your inbox (and spam folder).");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setCanResend(false);
    const trimmedEmail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (mode === "signup") {
      const passwordProblem = validatePassword(password);
      if (passwordProblem) {
        setError(passwordProblem);
        return;
      }
    }
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
              options: { emailRedirectTo: window.location.origin },
            });

      if (result.error) {
        setError(friendlyAuthError(result.error, mode));
        setCanResend(isUnconfirmedEmail(result.error));
        return;
      }
      if (mode === "signup" && isObfuscatedDuplicateSignup(result.data.user)) {
        setError("An account with this email already exists. Sign in instead.");
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

      {toast && (
        <div
          className="fixed left-1/2 top-5 z-50 -translate-x-1/2 rounded-lg border border-[#b8f36b]/30 bg-[#111714] px-4 py-3 text-sm text-[#d5edb5] shadow-xl shadow-black/40"
          role="status"
        >
          {toast}
        </div>
      )}
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
                {isSignUp ? (
                  <span className="text-[10px] text-[#77847b]">
                    At least 8 characters
                  </span>
                ) : (
                  <Link className="text-[11px] font-medium text-[#c2f680] hover:text-[#d8ff9b]" href="/forgot-password">
                    Forgot password?
                  </Link>
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
            {canResend && (
              <button
                className="text-xs font-semibold text-[#c2f680] hover:text-[#d8ff9b]"
                onClick={handleResend}
                type="button"
              >
                Resend confirmation email
              </button>
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
