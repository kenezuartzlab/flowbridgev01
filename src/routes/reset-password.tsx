import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { updatePassword, requestPasswordReset } from '@/lib/auth';

export const Route = createFileRoute('/reset-password')({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Supabase email link sets a recovery session via hash on landing.
    const hash = window.location.hash;
    if (hash.includes('type=recovery') || hash.includes('access_token=')) {
      setMode('reset');
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('reset');
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setMsg(null); setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setMsg('Check your inbox for the reset link.');
    } catch (e: any) {
      setErr(e.message ?? 'Failed to send reset email.');
    } finally { setLoading(false); }
  };

  const onReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setMsg(null);
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setErr('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await updatePassword(password);
      setMsg('Password updated. Redirecting…');
      await supabase.auth.signOut();
      setTimeout(() => navigate({ to: '/' }), 1200);
    } catch (e: any) {
      setErr(e.message ?? 'Failed to update password.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#010C1B] text-[#F0F7F3] font-sans">
      <div className="w-full max-w-sm bg-[#0D1C2A] border border-white/10 rounded-2xl p-6 shadow-2xl border-b-[5px] border-b-[#32FF8B]">
        <h1 className="text-lg font-black uppercase tracking-wider mb-1 font-mono">
          {mode === 'reset' ? 'Set New Password' : 'Reset Password'}
        </h1>
        <p className="text-xs text-[#C5C1B9] mb-5">
          {mode === 'reset'
            ? 'Choose a new password for your account.'
            : 'Enter your account email and we will send a reset link.'}
        </p>

        {mode === 'request' ? (
          <form onSubmit={onRequest} className="flex flex-col gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="bg-[#010C1B] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#32FF8B]/50"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] font-mono font-black uppercase tracking-widest text-xs py-2.5 rounded-xl disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        ) : (
          <form onSubmit={onReset} className="flex flex-col gap-3">
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (min 8 chars)"
              className="bg-[#010C1B] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#32FF8B]/50"
            />
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              className="bg-[#010C1B] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#32FF8B]/50"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] font-mono font-black uppercase tracking-widest text-xs py-2.5 rounded-xl disabled:opacity-50"
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}

        {msg && <p className="mt-4 text-xs text-[#32FF8B]">{msg}</p>}
        {err && <p className="mt-4 text-xs text-red-400">{err}</p>}

        <button
          onClick={() => navigate({ to: '/' })}
          className="mt-5 text-[10px] uppercase tracking-widest font-mono text-[#C5C1B9] hover:text-white"
        >
          ← Back to app
        </button>
      </div>
    </div>
  );
}
