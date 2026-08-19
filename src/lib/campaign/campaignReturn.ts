/**
 * Growth Hub V7 — safe local return metadata for the campaign action runner.
 *
 * Stores ONLY presentation breadcrumbs (campaign slug, task id, already-known
 * source tx hash). It is never read by the verifier, engine or settlement, and
 * it can never grant PTS or completion. Authoritative progress always comes
 * from the existing campaign read API.
 */
const KEY = 'flowbridge_campaign_action_return';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface CampaignActionReturn {
  campaignSlug: string;
  taskId: string;
  txHash?: string;
  at: number;
}

export function saveCampaignActionReturn(
  entry: Omit<CampaignActionReturn, 'at'>,
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...entry, at: Date.now() }));
  } catch {
    /* storage unavailable — presentation only */
  }
}

export function readCampaignActionReturn(): CampaignActionReturn | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CampaignActionReturn;
    if (!parsed?.campaignSlug || !parsed?.taskId || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearCampaignActionReturn(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
