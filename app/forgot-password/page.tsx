"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AuthCard, authButtonClass, authInputClass, FormMessage } from "../components/auth-card";
import {
  cooldownRemaining,
  describeResetError,
  RESET_COOLDOWN_SECONDS,
} from "../lib/auth-messages";
import { supabase } from "../lib/supabase";

const COOLDOWN_KEY = "mysynonym-reset-cooldown";

function readCooldown(email: string): number | null {
  try {
    const stored = JSON.parse(window.localStorage.getItem(COOLDOWN_KEY) ?? "null") as { email: string; until: number } | null;
    return stored && stored.email === email ? stored.until : null;
  } catch {
    return null;
  }
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (cooldownUntil === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const secondsLeft = now === 0 ? 0 : cooldownRemaining(cooldownUntil, now);

  function startCooldown(email: string, seconds: number) {
    const until = Date.now() + seconds * 1000;
    window.localStorage.setItem(COOLDOWN_KEY, JSON.stringify({ email, until }));
    setNow(Date.now());
    setCooldownUntil(until);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A ref blocks double-clicks and Enter-key repeats before state re-renders.
    if (inFlight.current) {
      console.warn("[password-reset] Ignored duplicate submit while a request is in flight.");
      return;
    }
    setError("");
    const trimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    const existing = readCooldown(trimmed);
    if (cooldownRemaining(existing, Date.now()) > 0) {
      console.warn("[password-reset] Blocked locally: cooldown still active for this email.");
      setCooldownUntil(existing);
      setNow(Date.now());
      return;
    }

    inFlight.current = true;
    setIsSubmitting(true);
    const redirectTo = `${window.location.origin}/reset-password`;
    console.info("[password-reset] Requesting reset email", { email: trimmed, redirectTo });
    try {
      const { data, error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo });
      if (resetError) {
        console.error("[password-reset] Supabase rejected the request", {
          message: resetError.message,
          code: (resetError as { code?: string }).code,
          status: resetError.status,
        });
        const { message, cooldownSeconds } = describeResetError(resetError);
        setError(message);
        if (cooldownSeconds > 0) startCooldown(trimmed, cooldownSeconds);
      } else {
        console.info("[password-reset] Reset email request accepted", data);
        startCooldown(trimmed, RESET_COOLDOWN_SECONDS);
        setSent(true);
      }
    } catch (failure) {
      console.error("[password-reset] Request failed before reaching Supabase", failure);
      setError(describeResetError({ message: failure instanceof Error ? failure.message : "" }).message);
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard title="Reset your password" description="Enter your email and we'll send you a link to choose a new password.">
      {sent ? (
        <FormMessage kind="notice">
          If an account exists for {email.trim()}, a reset link is on its way. Check your inbox and spam folder.
          {secondsLeft > 0 && ` You can request another in ${secondsLeft}s.`}
        </FormMessage>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          <input
            aria-label="Email address"
            autoComplete="email"
            className={authInputClass}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <button className={authButtonClass} disabled={isSubmitting || secondsLeft > 0} type="submit">
            {isSubmitting ? "Sending…" : secondsLeft > 0 ? `Try again in ${secondsLeft}s` : "Send reset link"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
