export const OPEN_AUTH_DIALOG = "flowbridge:open-auth";
export type AuthMode = "signup" | "signin";
export function openAuthDialog(mode: AuthMode = "signin", returnTo?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_AUTH_DIALOG, { detail: { mode, returnTo } }));
}
