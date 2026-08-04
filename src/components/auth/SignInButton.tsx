import { useState } from "react";
import { LogIn } from "lucide-react";
import { googleSignIn } from "@/lib/auth";
import { GoogleIcon } from "@/components/icons/GoogleIcon";

/**
 * Inline "Sign in" affordance for pages that require an account.
 * Signs in right where the user already is (returns to the current page),
 * instead of sending them off to the swap screen.
 */
export function SignInButton({
  label = "Sign in",
  className = "",
  variant = "primary",
}: {
  label?: string;
  className?: string;
  variant?: "primary" | "ghost";
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setLoading(true);
    setError(null);
    try {
      await googleSignIn(window.location.href);
    } catch (err: any) {
      setError(err?.message || "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
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
      <button type="button" onClick={onClick} disabled={loading} className={`${base} ${styles} ${className}`}>
        {variant === "primary" ? <GoogleIcon className="h-4 w-4" /> : <LogIn className="h-3.5 w-3.5" />}
        {loading ? "Opening…" : label}
      </button>
      {error && (
        <span className="font-mono text-[10px] leading-relaxed text-danger">{error}</span>
      )}
    </span>
  );
}
