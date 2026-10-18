import { createClient } from "@supabase/supabase-js";
import { isRecoveryCallback, PASSWORD_RECOVERY_FLAG } from "./auth-messages";

// The client signs the athlete in from the recovery link's URL hash on whatever
// page it lands on. Record that this is a recovery session before the hash is
// cleared, so the app can force the new-password step instead of the dashboard.
if (typeof window !== "undefined" && isRecoveryCallback(window.location.hash, window.location.search)) {
  window.sessionStorage.setItem(PASSWORD_RECOVERY_FLAG, "1");
  console.info("[password-reset] Recovery link detected on", window.location.pathname);
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
