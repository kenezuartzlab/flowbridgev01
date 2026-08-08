import { useEffect, useState } from "react";
import { LogIn, Wallet } from "lucide-react";
import { googleSignIn } from "@/lib/auth";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import { rememberReturnTo, sanitizeReturnTo } from "@/lib/authReturn";
import { detectLinkedWallet, signInWithLinkedWallet, type LinkedWallet } from "@/lib/walletLink";

/**
 * Inline "Sign in" affordance for pages that require an account.
 * Signs in right where the user already is (returns to the current page),
 * instead of sending them off to the swap screen.
 *
 * When the connected browser wallet is already bound to a registered account,
 * the primary action becomes a gasless wallet signature (same flow as swap),
 * with Google kept as a secondary option.
 */
export function SignInButton({
  label = "Sign in",
  className = "",
  variant = "primary",
  returnTo,
}: {
  label?: string;
  className?: string;
  variant?: "primary" | "ghost";
  /** Same-origin URL/path to land on after auth. Defaults to the current page. */
  returnTo?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<LinkedWallet | null>(null);

  useEffect(() => {
    let cancelled = false;
    void detectLinkedWallet().then((res) => {
      if (!cancelled) setLinked(res);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const target = sanitizeReturnTo(returnTo);
      rememberReturnTo(target);
      await googleSignIn(target);
    } catch (err: any) {
      setError(err?.message || "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const onWalletClick = async () => {
    if (!linked) return;
    setWalletLoading(true);
    setError(null);
    try {
      const res = await signInWithLinkedWallet(linked.address);
      if (res.status === "needs_binding") {
        setError("This wallet is not linked to an account yet — sign in with Google to bind it.");
        setLinked(null);
      }
    } catch (err: any) {
      setError(err?.message || "Wallet sign-in failed. Please try again.");
    } finally {
      setWalletLoading(false);
    }
  };

  const base =
    "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-4 font-mono text-[11px] font-black uppercase tracking-[0.1em] transition-colors disabled:opacity-60";
  const styles =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:opacity-90"
      : "border border-hairline text-foreground hover:border-primary/40";

  return (
    <span className="inline-flex flex-col items-center gap-1.5">
      {linked ? (
        <>
          <button
            type="button"
            onClick={onWalletClick}
            disabled={walletLoading}
            className={`${base} bg-primary text-primary-foreground hover:opacity-90 ${className}`}
          >
            <Wallet className="h-4 w-4" />
            {walletLoading ? "Signing…" : "Sign in with wallet"}
          </button>
          {linked.emailHint ? (
            <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
              Linked to {linked.emailHint}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClick}
            disabled={loading}
            className={`${base} border border-hairline text-foreground hover:border-primary/40`}
          >
            <GoogleIcon className="h-4 w-4" />
            {loading ? "Opening…" : "Use Google instead"}
          </button>
        </>
      ) : (
        <button type="button" onClick={onClick} disabled={loading} className={`${base} ${styles} ${className}`}>
          {variant === "primary" ? <GoogleIcon className="h-4 w-4" /> : <LogIn className="h-3.5 w-3.5" />}
          {loading ? "Opening…" : label}
        </button>
      )}
      {error && <span className="font-mono text-[10px] leading-relaxed text-danger">{error}</span>}
    </span>
  );
}
