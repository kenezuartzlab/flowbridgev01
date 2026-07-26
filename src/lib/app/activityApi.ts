/**
 * P0 foundation — thin, side-effect-free client for the user's activity and
 * incentives endpoints. Extracted out of App.tsx so the growth surfaces
 * (Rewards / Activity pages) can reuse the exact same calls without dragging
 * the swap/bridge execution code along.
 *
 * All calls are read/log only. Reward eligibility is decided server-side:
 * swaps can accrue, bridges are recorded for history with 0 points.
 */

export interface ActivityLogPayload {
  txType: string;
  direction: string;
  fromAmount: string;
  toAmount: string;
  txHash: string;
  status: string;
  /** Lowercased wallet that must match the wallet bound to the signed-in email. */
  walletAddress: string;
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function fetchUserIncentives(token: string) {
  const res = await fetch('/api/users/incentives', { headers: authHeaders(token) });
  const data = await res.json().catch(() => null);
  if (!data?.success || !data.incentives) return null;
  return data.incentives as Record<string, any>;
}

export async function fetchGlobalIncentiveStats() {
  const res = await fetch('/api/incentives/global');
  const data = await res.json().catch(() => null);
  if (!data?.success || !data.stats) return null;
  return data.stats as { globalTotalClaimed?: number };
}

export async function fetchActivityHistory(token: string) {
  const res = await fetch('/api/transactions', { headers: authHeaders(token) });
  if (!res.ok) return [] as any[];
  const data = await res.json().catch(() => null);
  return (data?.transactions ?? []) as any[];
}

export async function logActivity(token: string, payload: ActivityLogPayload) {
  const res = await fetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? 'Failed to save transaction activity');
  }
}
