import { useEffect, useState } from "react";
import { Mail, Wallet, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import { supabase } from "@/integrations/supabase/client";
import { googleSignIn, emailSignIn, emailSignUp, requestPasswordReset } from "@/lib/auth";
import { rememberReturnTo, sanitizeReturnTo } from "@/lib/authReturn";
import { isInAppBrowser, inAppBrowserName } from "@/lib/in-app-browser";
import { signInWithLinkedWallet } from "@/lib/walletLink";
import { getPendingReferralCode } from "@/lib/referrals/pendingReferral";
import { OPEN_AUTH_DIALOG, type AuthMode } from "./authDialogEvents";

type View = "choose" | "email" | "forgot" | "sent";

/** V36.7 — one primary sign-in/sign-up surface: Email, Google, Wallet. */
export function AuthDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [view, setView] = useState<View>("choose");
  const [returnTo, setReturnTo] = useState<string | undefined>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentText, setSentText] = useState("");
  const [inApp, setInApp] = useState(false);
  const [referral, setReferral] = useState<string | undefined>();

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent).detail ?? {};
      setMode(d.mode === "signup" ? "signup" : "signin");
      setReturnTo(d.returnTo);
      setView("choose");
      setError(null);
      setInApp(isInAppBrowser());
      setReferral(getPendingReferralCode());
      setOpen(true);
    };
    window.addEventListener(OPEN_AUTH_DIALOG, onOpen);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") setOpen(false);
    });
    return () => { window.removeEventListener(OPEN_AUTH_DIALOG, onOpen); data.subscription.unsubscribe(); };
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e: any) { setError(e?.message || "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  };

  const google = () => run(async () => {
    const target = sanitizeReturnTo(returnTo);
    rememberReturnTo(target);
    await googleSignIn(target);
  });

  const submitEmail = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    rememberReturnTo(sanitizeReturnTo(returnTo));
    if (mode === "signup") {
      if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
      await emailSignUp(email.trim(), password, "");
      setSentText("Check your inbox and tap the confirmation link to finish creating your account. Your invite stays saved on this device.");
      setView("sent");
    } else {
      await emailSignIn(email.trim(), password);
    }
  }); };

  const magicLink = () => run(async () => {
    if (!email.trim()) throw new Error("Enter your email first.");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + "/", shouldCreateUser: mode === "signup" },
    });
    if (error) throw error;
    setSentText("We emailed you a secure sign-in link. Open it on this device to continue.");
    setView("sent");
  });

  const forgot = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    await requestPasswordReset(email.trim());
    setSentText("If an account exists for that email, a password reset link is on its way.");
    setView("sent");
  }); };

  const wallet = () => run(async () => {
    const eth = (globalThis as any).ethereum;
    if (!eth?.request) throw new Error("No wallet found. Open FlowBridge in TokenPocket, MetaMask, Rabby or another wallet browser — or continue with email.");
    const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
    const address = accounts?.[0]?.toLowerCase();
    if (!address) throw new Error("No wallet account selected.");
    const res = await signInWithLinkedWallet(address);
    if (res.status === "needs_binding") {
      setMode("signup");
      setView("email");
      setError("This wallet isn't linked to an account yet. Create your account with email (or Google) first — then link this wallet with one free signature.");
    }
  });

  const appName = inAppBrowserName();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "signup" ? "Create your FlowBridge account" : "Sign in to FlowBridge"}</DialogTitle>
          <DialogDescription>Browsing and quotes never need an account or a wallet.</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => { setMode(v as AuthMode); setError(null); if (view === "sent") setView("choose"); }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signup">Sign up</TabsTrigger>
            <TabsTrigger value="signin">Sign in</TabsTrigger>
          </TabsList>
        </Tabs>

        {referral && mode === "signup" && (
          <p className="rounded-lg border border-hairline p-2 text-xs text-muted" role="status">
            Invite <strong className="font-mono text-foreground">{referral}</strong> is saved and will be linked once you verify your email or bind a wallet.
          </p>
        )}

        {view === "choose" && (
          <div className="space-y-2">
            <Button className="w-full justify-start gap-2" variant="outline" onClick={() => { setView("email"); setError(null); }}>
              <Mail className="h-4 w-4" /> Continue with Email
            </Button>
            {inApp ? (
              <p className="rounded-lg border border-hairline p-2 text-xs text-muted">
                Google blocks sign-in inside {appName ?? "in-app"} browsers. Use email or your wallet here, or open FlowBridge in Chrome/Safari for Google.
              </p>
            ) : (
              <Button className="w-full justify-start gap-2" variant="outline" disabled={busy} onClick={() => void google()}>
                <GoogleIcon className="h-4 w-4" /> Continue with Google
              </Button>
            )}
            <Button className="w-full justify-start gap-2" variant="outline" disabled={busy} onClick={() => void wallet()}>
              <Wallet className="h-4 w-4" /> {mode === "signup" ? "Connect Wallet" : "Sign in with Wallet"}
            </Button>
            <div className="flex gap-2 rounded-lg bg-muted/30 p-3 text-xs leading-relaxed text-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>A verified email protects your account and lets you recover it. Binding a wallet (one free signature, no gas, no approval) proves it's yours so rewards and referrals can be credited. Google and email with the same address share one account.</span>
            </div>
          </div>
        )}

        {view === "email" && (
          <form className="space-y-3" onSubmit={submitEmail}>
            <div className="space-y-1"><Label htmlFor="auth-email">Email</Label>
              <Input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="auth-password">Password</Label>
              <Input id="auth-password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}</Button>
            <div className="flex flex-wrap justify-between gap-2 text-xs">
              <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => void magicLink()} disabled={busy}>Email me a sign-in link instead</button>
              {mode === "signin" && <button type="button" className="text-muted hover:underline" onClick={() => { setView("forgot"); setError(null); }}>Forgot password?</button>}
            </div>
            <button type="button" className="text-xs text-muted hover:underline" onClick={() => setView("choose")}>← Other options</button>
          </form>
        )}

        {view === "forgot" && (
          <form className="space-y-3" onSubmit={forgot}>
            <div className="space-y-1"><Label htmlFor="auth-forgot">Account email</Label>
              <Input id="auth-forgot" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <Button type="submit" className="w-full" disabled={busy}>Send reset link</Button>
            <button type="button" className="text-xs text-muted hover:underline" onClick={() => setView("email")}>← Back</button>
          </form>
        )}

        {view === "sent" && <p className="text-sm leading-relaxed" role="status">{sentText}</p>}
        {error && <p className="text-xs leading-relaxed text-danger" role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
