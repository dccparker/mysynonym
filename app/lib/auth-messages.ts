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
