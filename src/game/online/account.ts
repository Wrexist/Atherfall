import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { backend, onlineConfigured } from "./client";

export interface Profile {
  id: string;
  display_name: string;
  archetype: string;
  level: number;
}

export type AccountStatus = "unavailable" | "loading" | "signed-out" | "signed-in";

interface AccountState {
  status: AccountStatus;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  busy: boolean;
  error: string | null;
  /** Informational message, e.g. "check your email to confirm". */
  notice: string | null;
  /** Opened from a password-reset email: the player must choose a new password. */
  recovering: boolean;
}

export const useAccount = create<AccountState>(() => ({
  status: onlineConfigured ? "loading" : "unavailable",
  userId: null,
  email: null,
  profile: null,
  busy: false,
  error: null,
  notice: null,
  recovering: false,
}));

/** Same rule as the database constraint: 3–16 letters, digits, spaces, _ or -. */
export const NAME_RULE = /^[A-Za-z0-9][A-Za-z0-9 _-]{1,14}[A-Za-z0-9]$/;

export function nameProblem(name: string): string | null {
  const n = name.trim();
  if (n.length < 3 || n.length > 16) return "Names are 3–16 characters.";
  if (!NAME_RULE.test(n))
    return "Use letters, numbers, spaces, - or _ (starting and ending with a letter or number).";
  return null;
}

async function loadProfile(userId: string) {
  const sb = backend();
  if (!sb) return;
  const { data } = await sb
    .from("profiles")
    .select("id, display_name, archetype, level")
    .eq("id", userId)
    .maybeSingle();
  if (useAccount.getState().userId === userId)
    useAccount.setState({ profile: (data as Profile | null) ?? null });
}

function applySession(session: Session | null) {
  const prev = useAccount.getState().userId;
  if (!session) {
    useAccount.setState({ status: "signed-out", userId: null, email: null, profile: null });
    return;
  }
  useAccount.setState({
    status: "signed-in",
    userId: session.user.id,
    email: session.user.email ?? null,
  });
  if (prev !== session.user.id) void loadProfile(session.user.id);
}

let started = false;
/** Restore any saved session and follow sign-in / sign-out from here on. */
export function initAccount() {
  const sb = backend();
  if (!sb || started) return;
  started = true;
  void sb.auth.getSession().then(({ data }) => applySession(data.session));
  sb.auth.onAuthStateChange((event, session) => {
    // A reset link signs the player in just far enough to set a new password.
    if (event === "PASSWORD_RECOVERY") useAccount.setState({ recovering: true });
    applySession(session);
  });
}

/**
 * Email a password-reset link that opens the game. The reply is the same
 * whether or not the email has an account, so nobody can probe for players.
 */
export async function requestPasswordReset(email: string) {
  const sb = backend();
  if (!sb) return false;
  const ok = await run(async () => {
    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/`,
    });
    if (error) throw error;
    useAccount.setState({
      notice: "If that email has an account, a reset link is on its way. Open it on this device.",
    });
    return true;
  });
  return !!ok;
}

/** Finish a reset: the player arrived from the email link and picked a new password. */
export async function setNewPassword(password: string) {
  const sb = backend();
  if (!sb) return false;
  const ok = await run(async () => {
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw error;
    useAccount.setState({ recovering: false, notice: "Password changed. You're signed in." });
    return true;
  });
  return !!ok;
}

/** Friendlier wording for the errors players actually hit. */
function explain(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "That email and password don't match.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "That email already has an account — sign in instead.";
  if (m.includes("password") && m.includes("characters"))
    return "Passwords need at least 6 characters.";
  if (m.includes("email not confirmed"))
    return "Confirm your email first (check your inbox), then sign in.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many attempts — wait a minute and try again.";
  if (m.includes("different from the old password"))
    return "Pick a password you haven't used for this account.";
  if (m.includes("fetch") || m.includes("network"))
    return "Can't reach the server. Check your connection.";
  return message;
}

async function run<T>(work: () => Promise<T>): Promise<T | null> {
  useAccount.setState({ busy: true, error: null, notice: null });
  try {
    return await work();
  } catch (e) {
    useAccount.setState({ error: explain(e instanceof Error ? e.message : String(e)) });
    return null;
  } finally {
    useAccount.setState({ busy: false });
  }
}

/** Is this player name free? (Case-insensitive, like the database rule.) */
export async function nameAvailable(name: string): Promise<boolean> {
  const sb = backend();
  if (!sb) return false;
  // Escape LIKE wildcards: "_" is allowed in names.
  const pattern = name.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await sb
    .from("profiles")
    .select("id")
    .ilike("display_name", pattern)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length === 0;
}

export async function signUp(name: string, email: string, password: string) {
  const sb = backend();
  if (!sb) return false;
  const problem = nameProblem(name);
  if (problem) {
    useAccount.setState({ error: problem });
    return false;
  }
  const ok = await run(async () => {
    if (!(await nameAvailable(name)))
      throw new Error(`"${name.trim()}" is taken — try another name.`);
    const { data, error } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() } },
    });
    if (error) throw error;
    if (!data.session) {
      useAccount.setState({
        notice: "Almost there — confirm your email (check your inbox), then sign in.",
      });
    }
    return true;
  });
  return !!ok;
}

export async function signIn(email: string, password: string) {
  const sb = backend();
  if (!sb) return false;
  const ok = await run(async () => {
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    return true;
  });
  return !!ok;
}

export async function signOut() {
  const sb = backend();
  if (!sb) return;
  await run(async () => {
    const { error } = await sb.auth.signOut();
    if (error) throw error;
    return true;
  });
}

/** Keep the public profile's class and level in step with the game (other players see them). */
export async function syncProfileProgress(archetype: string, level: number) {
  const sb = backend();
  const { userId, profile } = useAccount.getState();
  if (!sb || !userId || !profile) return;
  if (profile.archetype === archetype && profile.level === level) return;
  const { error } = await sb.from("profiles").update({ archetype, level }).eq("id", userId);
  if (!error) useAccount.setState({ profile: { ...profile, archetype, level } });
}
