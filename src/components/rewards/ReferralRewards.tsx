import { useEffect, useState } from 'react';
import { Copy, Check, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ReferralRewards({ incentives }: { incentives: any }) {
  const [link, setLink] = useState('');
  const [qr, setQr] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const url = incentives?.referralCode ? `${window.location.origin}/?ref=${encodeURIComponent(incentives.referralCode)}` : '';
    setLink(url); setQr('');
    let cancelled = false;
    if (url) void import('qrcode').then(m => m.toDataURL(url, { width: 176, margin: 2, errorCorrectionLevel: 'M' })).then(data => { if (!cancelled) setQr(data); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [incentives?.referralCode]);
  const copy = async () => { try { await navigator.clipboard.writeText(link); setNotice('Copied'); } catch { setNotice('Copy unavailable. Select the link below.'); } };
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: 'FlowBridge', url: link }); else await copy(); }
    catch { setNotice('Sharing cancelled. Your link is still available.'); }
  };
  const rows: any[] = incentives?.referralStatuses ?? [];
  const known = rows.filter(r => r.qualificationVerified === true).length;
  return <section id="referrals" className="space-y-4 border-t border-hairline py-5" data-testid="referral-rewards">
    <h2 className="text-lg font-bold">Your referrals</h2>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        ['Total referrals', incentives?.inviteCount ?? '—'],
        ['Qualified signup referrals', rows.some(r => typeof r.qualificationVerified === 'boolean') ? known : 'Not verified'],
        ['With recorded rewards', incentives?.rewardedReferrals ?? '—'],
        ['Pending checks / funding', rows.filter(r => !r.qualificationVerified || r.awaitingFunding).length],
      ].map(([label,value]) => <div key={String(label)} className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="break-words text-lg font-bold tabular-nums">{value}</dd></div>)}
    </dl>
    {link ? <>
      <p className="text-sm">Referral code: <strong className="break-all font-mono">{incentives.referralCode}</strong></p>
      <p className="select-all break-all text-sm text-muted">{link}</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void copy()}><Copy />Copy link</Button><Button variant="outline" onClick={() => void share()}><Share2 />Share</Button></div>
      {notice && <p role="status" className="text-xs text-muted">{notice === 'Copied' && <Check className="mr-1 inline h-3 w-3" />}{notice}</p>}
      {qr && <details><summary className="cursor-pointer text-sm font-semibold">Referral QR code</summary><img src={qr} width={176} height={176} className="mt-3" alt="Your FlowBridge referral QR code" /></details>}
    </> : <p className="text-sm text-muted">Your referral link appears once your account is ready.</p>}
    <details open><summary className="cursor-pointer text-sm font-semibold">Referral history</summary>
      <ul className="mt-3 divide-y divide-hairline">{rows.map((r, i) => <li key={r.label ?? i} className="space-y-2 py-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><strong>{r.label}</strong><span className="text-xs text-muted">{r.walletBound ? 'Wallet bound' : 'Wallet not bound'}</span></div>
        <p>Recorded signup bonus: <strong>{Number(r.signupReward ?? 0)} PTS</strong> · Milestones: <strong>{Number(r.pointsEarned ?? 0)} PTS</strong></p>
        <p className="break-words leading-relaxed text-muted">{r.eligibilityReason ?? r.signupExplanation}</p>
        <details><summary className="cursor-pointer text-xs font-semibold">Award evidence and conditions</summary><p className="mt-2 leading-relaxed text-muted">{r.signupExplanation}</p><p className="mt-2 leading-relaxed text-muted">{r.milestoneExplanation}</p></details>
      </li>)}</ul>
      {!rows.length && <p className="mt-3 text-sm text-muted">No referral history recorded.</p>}
    </details>
    <p className="text-xs leading-relaxed text-muted">Recorded awards are not paid FLOW. Qualified signup referrals have verified award provenance; payout eligibility still comes from your funded, reconciled rewards summary. No recursive percentage rewards are promised.</p>
  </section>;
}