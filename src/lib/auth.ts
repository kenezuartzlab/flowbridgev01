// Backwards-compatible auth shim that wraps Lovable Cloud (Supabase) auth so
// the existing FlowBridge UI (which expected a Firebase-style API) keeps working.
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import type { User as SupabaseUser, Session } from "@supabase/supabase-js";

export interface AppUser {
  uid: string;
  id: string;
  email: string;
  emailVerified: boolean;
  email_verified: boolean;
  displayName: string | null;
  photoURL: string | null;
  isDemo?: boolean;
}

function toAppUser(u: SupabaseUser): AppUser {
  const verified = !!u.email_confirmed_at || !!(u as any).confirmed_at;
  return {
    uid: u.id,
    id: u.id,
    email: u.email ?? "",
    emailVerified: verified,
    email_verified: verified,
    displayName:
      (u.user_metadata?.full_name as string | undefined) ??
      (u.user_metadata?.name as string | undefined) ??
      null,
    photoURL: (u.user_metadata?.avatar_url as string | undefined) ?? null,
  };
}

export const initAuth = (
  onAuthSuccess?: (user: AppUser, token: string) => void,
  onAuthFailure?: () => void,
) => {
  // Emit initial state using a *revalidated* user (getUser() re-checks with
  // Supabase Auth, so email_confirmed_at is fresh even if the cached session
  // predates verification). Session is still fetched for the access_token.
  (async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session?.user) { onAuthFailure?.(); return; }
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user ?? session.user;
    onAuthSuccess?.(toAppUser(user), session.access_token);
  })().catch(() => onAuthFailure?.());

  const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      onAuthSuccess?.(toAppUser(session.user), session.access_token);

      // Do not await another auth call inside onAuthStateChange. Some mobile
      // wallet browsers can stall the SIGNED_IN event if this callback performs
      // nested Supabase auth requests synchronously. Revalidate on the next tick
      // instead so email verification still refreshes without blocking login.
      if (event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        setTimeout(() => {
          supabase.auth.getUser()
            .then(({ data }) => {
              if (data.user) onAuthSuccess?.(toAppUser(data.user), session.access_token);
            })
            .catch(() => undefined);
        }, 0);
      }
    } else {
      onAuthFailure?.();
    }
  });

  return () => sub.subscription.unsubscribe();
};

export const googleSignIn = async (): Promise<{ user: AppUser; accessToken: string } | null> => {
  const result = await lovable.auth.signInWithOAuth("google", {
    redirect_uri: window.location.origin,
  });
  if (result.error) throw result.error;
  if (result.redirected) return null; // browser will redirect
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user) throw new Error("Sign-in did not produce a session");
  return { user: toAppUser(data.session.user), accessToken: data.session.access_token };
};

export const emailSignUp = async (
  email: string,
  password: string,
  displayName: string,
): Promise<AppUser> => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: displayName },
      emailRedirectTo: `${window.location.origin}/`,
    },
  });
  if (error) throw error;
  if (!data.user) throw new Error("Sign-up failed");
  return toAppUser(data.user);
};

export const emailSignIn = async (email: string, password: string): Promise<AppUser> => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error("Sign-in failed");
  return toAppUser(data.user);
};

export const sendVerification = async (): Promise<void> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData.session?.user.email;
  if (!email) throw new Error("No user is currently signed in.");
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${window.location.origin}/` },
  });
  if (error) throw error;
};

export const reloadUser = async (): Promise<AppUser | null> => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return toAppUser(data.user);
};

export const getAccessToken = async (): Promise<string | null> => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
};

export const getIdToken = getAccessToken;

export const logout = async () => {
  await supabase.auth.signOut();
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
};

export const updatePassword = async (newPassword: string): Promise<void> => {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
};

export type { Session };
