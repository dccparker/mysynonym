"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AuthCard, authButtonClass, authInputClass, FormMessage } from "../components/auth-card";
import { friendlyAuthError, validatePassword } from "../lib/auth-messages";
import { supabase } from "../lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // The recovery link signs the athlete in through the URL; give it a moment.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady("ready");
    });
    const timer = window.setTimeout(() => {
      void supabase.auth.getSession().then(({ data: current }) => setReady(current.session ? "ready" : "invalid"));
    }, 1500);
    return () => {
      data.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const problem = validatePassword(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError("The passwords don't match.");
    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(friendlyAuthError(updateError, "signin"));
        return;
      }
      setDone(true);
      window.setTimeout(() => router.replace("/"), 1500);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "We couldn't update your password. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard title="Choose a new password" description="Use at least 8 characters.">
      {done ? (
        <FormMessage kind="notice">Password updated. Taking you to your dashboard…</FormMessage>
      ) : ready === "checking" ? (
        <p className="text-sm text-[#8c9990]" role="status">Verifying your reset link…</p>
      ) : ready === "invalid" ? (
        <FormMessage kind="error">
          This reset link is invalid or has expired. Request a new one from the sign-in page.
        </FormMessage>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          <input aria-label="New password" autoComplete="new-password" className={authInputClass} minLength={8} onChange={(e) => setPassword(e.target.value)} placeholder="New password" required type="password" value={password} />
          <input aria-label="Confirm new password" autoComplete="new-password" className={authInputClass} minLength={8} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" required type="password" value={confirm} />
          {error && <FormMessage kind="error">{error}</FormMessage>}
          <button className={authButtonClass} disabled={isSubmitting} type="submit">
            {isSubmitting ? "Saving…" : "Update password"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
