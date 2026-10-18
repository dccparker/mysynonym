"use client";

import { useState, type FormEvent } from "react";
import { AuthCard, authButtonClass, authInputClass, FormMessage } from "../components/auth-card";
import { friendlyAuthError } from "../lib/auth-messages";
import { supabase } from "../lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const trimmed = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setIsSubmitting(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) setError(friendlyAuthError(resetError, "signin"));
      else setSent(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "We couldn't send the reset email. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard title="Reset your password" description="Enter your email and we'll send you a link to choose a new password.">
      {sent ? (
        <FormMessage kind="notice">
          If an account exists for {email.trim()}, a reset link is on its way. Check your inbox and spam folder.
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
          <button className={authButtonClass} disabled={isSubmitting} type="submit">
            {isSubmitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
