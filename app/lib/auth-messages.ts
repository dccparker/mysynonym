export type AuthFailure = { message: string; code?: string; status?: number };

export function isUnconfirmedEmail(error: AuthFailure): boolean {
  return error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message);
}

export function friendlyAuthError(error: AuthFailure, mode: "signin" | "signup"): string {
  if (isUnconfirmedEmail(error)) {
    return "Your email address is not verified yet. Open the confirmation link we emailed you, or resend it below.";
  }
  if (error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message)) {
    return "That email and password don't match. Check them and try again, or reset your password.";
  }
  if (error.code === "user_already_exists" || /already registered/i.test(error.message)) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (error.code === "weak_password" || /password should be/i.test(error.message)) {
    return "Choose a stronger password with at least 8 characters.";
  }
  if (error.code === "over_email_send_rate_limit" || error.status === 429 || /rate limit/i.test(error.message)) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (/failed to fetch|network/i.test(error.message)) {
    return "We couldn't reach MySynonym. Check your connection and try again.";
  }
  return mode === "signup" ? `We couldn't create your account: ${error.message}` : error.message;
}

/** Supabase hides duplicate signups by returning a user with no identities. */
export function isObfuscatedDuplicateSignup(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  return null;
}

/** Set before redirecting to /login so the login page can confirm the sign-out. */
export const SIGNED_OUT_FLAG = "mysynonym-signed-out";

export const RESET_COOLDOWN_SECONDS = 60;

export type ResetFailure = { message: string; code?: string; status?: number };

/** Seconds Supabase asks us to wait ("...only request this after 42 seconds"). */
export function retryAfterSeconds(error: ResetFailure): number | null {
  const match = /after (\d+) seconds?/i.exec(error.message);
  return match ? Number(match[1]) : null;
}

export function isRateLimited(error: ResetFailure): boolean {
  return (
    error.status === 429 ||
    error.code === "over_email_send_rate_limit" ||
    error.code === "over_request_rate_limit" ||
    /rate limit|only request this after/i.test(error.message)
  );
}

export function describeResetError(error: ResetFailure): { message: string; cooldownSeconds: number } {
  if (isRateLimited(error)) {
    const wait = retryAfterSeconds(error);
    if (wait !== null || error.code === "over_request_rate_limit") {
      const seconds = wait ?? RESET_COOLDOWN_SECONDS;
      return {
        message: `A reset email was requested very recently. Please wait ${seconds} seconds before trying again, and check your inbox and spam folder for the earlier email.`,
        cooldownSeconds: seconds,
      };
    }
    return {
      message:
        "We've reached the limit for password reset emails for now. Please wait up to an hour before trying again, or check your inbox and spam folder for an email you already requested.",
      cooldownSeconds: RESET_COOLDOWN_SECONDS,
    };
  }
  if (/failed to fetch|network/i.test(error.message)) {
    return { message: "We couldn't reach MySynonym. Check your connection and try again.", cooldownSeconds: 0 };
  }
  if (error.code === "email_address_invalid" || /invalid.*email/i.test(error.message)) {
    return { message: "Enter a valid email address.", cooldownSeconds: 0 };
  }
  return { message: "We couldn't send the reset email. Please try again in a moment.", cooldownSeconds: 0 };
}

export function cooldownRemaining(until: number | null, now: number): number {
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

export const PASSWORD_RECOVERY_FLAG = "mysynonym-password-recovery";

/** True when a URL hash/query is a Supabase password-recovery callback. */
export function isRecoveryCallback(hash: string, search = ""): boolean {
  return /(^|[#&?])type=recovery\b/.test(hash) || /(^|[?&])type=recovery\b/.test(search);
}
