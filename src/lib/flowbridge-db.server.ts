// Server-only DB helpers that replicate the original FlowBridge Express/Drizzle
// queries against Lovable Cloud (Supabase) using the service-role client.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MAINNET_CONTRACTS } from "@/lib/contracts";
import {
  BOT_MAINNET_CHAIN_ID,
  BOT_TESTNET_CHAIN_ID,
  requireFlowBridgeExecution,
} from "@/lib/flowbridge/executionRegistry";
import { FLOW_REWARD_MIN_USD } from "@/lib/rewards";
import { getRewardSettings } from "@/lib/appConfig.server";
import {
  accrueCoreSwapPoints,
  grantReferralMilestones,
  isFlowPointsV2Live,
} from "@/lib/rewards/flowPointsV2Ledger.server";


const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const BOT_MAINNET_RPC = "https://rpc.botchain.ai";

function generateReferralCode() {
  let code = "FB-";
  for (let i = 0; i < 5; i++) code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  return code;
}

function parsePositiveAmount(value: string) {
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function inputSymbolFromDirection(direction: string) {
  return String(direction).split("_TO_")[0]?.trim().toUpperCase() || "";
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = await res.json().catch(() => null);
    return json?.result ?? null;
  } catch {
    return null;
  }
}

/**
 * V12.4B — canonical swap-receipt verification.
 *
 * Returns the chain the swap was proven on, or null when nothing verifies.
 * Two disjoint candidates, each pinned to its own router:
 *   - BOT Mainnet 677 · legacy v3 router (historic reads only)
 *   - BOT Testnet 968 · Router V4 (the approved verified-swap execution path)
 * Neither candidate's evidence is ever reinterpreted as the other's.
 */
async function verifySwapReceipt(
  txHash: string | null,
  walletAddress: string,
): Promise<number | null> {
  const hash = txHash?.trim();
  if (!hash || !/^0x[a-fA-F0-9]{64}$/.test(hash)) return null;
  const wallet = walletAddress.toLowerCase();
  const { requireFlowBridgeV4Execution } = await import("@/lib/flowbridge/executionRegistry");
  const testnetRpc = process.env["BOT_TESTNET_RPC_URL"] ?? "";

  const candidates: Array<{ chainId: number; rpcUrl: string; router: string }> = [
    {
      chainId: BOT_MAINNET_CHAIN_ID,
      rpcUrl: BOT_MAINNET_RPC,
      // LEGACY v3 mainnet read only. This is explicitly NOT Router V4 evidence.
      router: requireFlowBridgeExecution(BOT_MAINNET_CHAIN_ID).router,
    },
  ];
  if (testnetRpc) {
    candidates.push({
      chainId: BOT_TESTNET_CHAIN_ID,
      rpcUrl: testnetRpc,
      router: requireFlowBridgeV4Execution(BOT_TESTNET_CHAIN_ID).router,
    });
  }

  for (const candidate of candidates) {
    const [receipt, tx] = await Promise.all([
      rpc<any>(candidate.rpcUrl, "eth_getTransactionReceipt", [hash]),
      rpc<any>(candidate.rpcUrl, "eth_getTransactionByHash", [hash]),
    ]);
    if (!receipt || !tx) continue;
    const statusOk = String(receipt.status).toLowerCase() === "0x1";
    const fromOk = String(tx.from ?? receipt.from ?? "").toLowerCase() === wallet;
    const toOk =
      String(tx.to ?? receipt.to ?? "").toLowerCase() === candidate.router.toLowerCase();
    if (statusOk && fromOk && toOk) return candidate.chainId;
  }
  return null;
}

/**
 * V12.4B — canonical verified-activity evidence for a swap, when the indexer has
 * already recorded it. Token, amount and log index come from this row, never
 * from the browser payload.
 */
async function canonicalSwapEvidence(txHash: string, walletAddress: string) {
  const { data } = await supabaseAdmin
    .from("verified_activities")
    .select("source_chain_id, source_log_index, amount_raw, token, kind, status")
    .eq("source_tx_hash", txHash.toLowerCase())
    .eq("user_wallet", walletAddress.toLowerCase())
    .eq("kind", "SWAP_EXECUTED")
    .order("source_log_index", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    chainId: Number(data.source_chain_id),
    logIndex: Number(data.source_log_index),
    amountRaw: String(data.amount_raw),
    token: String(data.token).toLowerCase(),
  };
}

/** USD value derived purely from canonical evidence (amount_raw + token). */
async function canonicalEvidenceUsd(evidence: {
  chainId: number;
  amountRaw: string;
  token: string;
}): Promise<number> {
  const { findVerifiedSwapPath } = await import("@/lib/swap/verifiedSwapConfig");
  const path = findVerifiedSwapPath(evidence.chainId, evidence.token);
  if (!path) return 0;
  const raw = Number(evidence.amountRaw);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const amount = raw / 10 ** path.tokenInDecimals;
  const price = await fetchTokenUsdPrice(path.tokenInSymbol);
  return amount * price;
}


/** Resolve the on-chain address for a swap symbol (built-ins + admin-published tokens). */
async function resolveTokenAddress(symbol: string): Promise<string | null> {
  const s = symbol.toUpperCase();
  if (s === "USDT") return MAINNET_CONTRACTS.usdtBot;
  if (s === "BOT" || s === "WBOT") return MAINNET_CONTRACTS.wbot;
  if (s === "CA") return MAINNET_CONTRACTS.caToken;
  const { data } = await supabaseAdmin
    .from("swap_tokens")
    .select("address, symbol, chain, is_active")
    .eq("chain", "mainnet")
    .ilike("symbol", s)
    .maybeSingle();
  return data?.address ?? null;
}

/**
 * USD price for a swap input symbol. Unknown / unpriceable tokens return 0 so
 * they never inflate swap volume or FLOW points.
 */
async function fetchTokenUsdPrice(symbol: string) {
  const s = symbol.toUpperCase();
  if (s === "USDT") return 1;
  const token = await resolveTokenAddress(s);
  if (!token) return 0;
  try {
    const res = await fetch(`https://dex-wallet.botchain.ai/api/v1/price?token=${token.toLowerCase()}&pool_type=all`);
    const json = await res.json().catch(() => null);
    const price = Number(json?.data?.price);
    if (Number.isFinite(price) && price > 0) return price;
  } catch {
    // fall through
  }
  // Conservative fallbacks exist only for the two core assets.
  if (s === "BOT" || s === "WBOT") return 9.7482;
  return 0;
}

async function estimateSwapUsd(direction: string, fromAmount: string) {
  const amount = parsePositiveAmount(fromAmount);
  if (amount <= 0) return 0;
  const symbol = inputSymbolFromDirection(direction);
  const price = await fetchTokenUsdPrice(symbol);
  return amount * price;
}

export async function ensureProfile(userId: string, email: string, referredByCode?: string) {
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (existing) {
    if (!existing.referral_code) {
      const { data: updated } = await supabaseAdmin
        .from("profiles")
        .update({ referral_code: generateReferralCode() })
        .eq("id", userId)
        .select()
        .single();
      return updated;
    }
    if (existing.email !== email && email) {
      await supabaseAdmin.from("profiles").update({ email }).eq("id", userId);
    }
    return existing;
  }

  // Profile is normally created by the auth trigger; this is a fallback.
  const newCode = generateReferralCode();
  let finalReferredBy: string | null = null;
  if (referredByCode) {
    const { data: ref } = await supabaseAdmin
      .from("profiles")
      .select("id, flow_points, points_referral_signup, referral_code")
      .eq("referral_code", referredByCode)
      .maybeSingle();
    if (ref) finalReferredBy = referredByCode;
  }
  const { data: created } = await supabaseAdmin
    .from("profiles")
    .insert({ id: userId, email, referral_code: newCode, referred_by: finalReferredBy })
    .select()
    .single();

  // V12.4A — FLOW Points V2 disables the legacy +50 signup credit for NEW
  // accruals. The relationship is still bound; referral value now comes from
  // idempotent milestones once the referred user actually swaps.
  if (finalReferredBy && !(await isFlowPointsV2Live())) {
    const { data: ref } = await supabaseAdmin
      .from("profiles")
      .select("id, flow_points, points_referral_signup")
      .eq("referral_code", finalReferredBy)
      .maybeSingle();
    if (ref) {
      await supabaseAdmin
        .from("profiles")
        .update({
          flow_points: (ref.flow_points ?? 0) + 50,
          points_referral_signup: (ref.points_referral_signup ?? 0) + 50,
        })
        .eq("id", ref.id);
    }
  }
  return created;
}


export async function linkReferralIfMissing(userId: string, referredByCode?: string) {
  if (!referredByCode) return;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, referred_by, referral_code")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.referred_by) return;
  if (profile.referral_code === referredByCode) return;

  const { data: ref } = await supabaseAdmin
    .from("profiles")
    .select("id, flow_points, points_referral_signup")
    .eq("referral_code", referredByCode)
    .maybeSingle();
  if (!ref) return;

  await supabaseAdmin
    .from("profiles")
    .update({ referred_by: referredByCode })
    .eq("id", userId);
  // V2: binding a relationship is not an economic milestone.
  if (!(await isFlowPointsV2Live())) {
    await supabaseAdmin
      .from("profiles")
      .update({
        flow_points: (ref.flow_points ?? 0) + 50,
        points_referral_signup: (ref.points_referral_signup ?? 0) + 50,
      })
      .eq("id", ref.id);
  }
}


export async function createTransactionHistory(
  userId: string,
  isEmailVerified: boolean,
  payload: {
    txType: string;
    direction: string;
    fromAmount: string;
    toAmount: string;
    txHash: string | null;
    status: string;
    walletAddress?: string | null;
  },
) {
  const { data: user } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (!user) throw new Error("Profile not found");

  const submittedWallet = payload.walletAddress?.trim().toLowerCase() ?? null;
  const boundWallet = typeof user.wallet_address === "string" ? user.wallet_address.toLowerCase() : null;
  if (!isEmailVerified) {
    throw new Error("Rewards require a verified email address.");
  }
  if (!submittedWallet || !boundWallet || submittedWallet !== boundWallet) {
    throw new Error("Rewards require the connected wallet to be linked to this signed-in email.");
  }

  const normalizedTxHash = payload.txHash?.trim() || null;
  if (normalizedTxHash) {
    const { data: existing } = await supabaseAdmin
      .from("transactions_history")
      .select("*")
      .eq("user_id", userId)
      .eq("tx_hash", normalizedTxHash)
      .maybeSingle();
    if (existing) return existing;
  }

  // Bridge transactions are RECORDED for the user's activity history (tied to
  // their verified email + bound wallet) but are never reward-eligible — only
  // FlowBridgeRouter swap activity can accrue rewards / swap volume.
  const isBridge = String(payload.txType).toUpperCase() === "BRIDGE";
  const isSuccessfulSwap = String(payload.txType).toUpperCase() === "SWAP" && String(payload.status).toUpperCase() === "SUCCESS";

  let verifiedSwapUsd = 0;
  let pointsToEarn = 0;
  const v2Live = await isFlowPointsV2Live();
  if (!isBridge && isSuccessfulSwap && submittedWallet && normalizedTxHash) {
    const receiptOk = await verifySwapReceipt(normalizedTxHash, submittedWallet);
    if (receiptOk) {
      // Server-derived USD only: the browser payload never decides the award.
      verifiedSwapUsd = await estimateSwapUsd(payload.direction, payload.fromAmount);
      if (v2Live) {
        // V12.4A FLOW Points V2: floor(verifiedUsd) from $minSwapUsd, bounded by
        // the per-wallet daily cap, recorded once per canonical activity.
        const accrual = await accrueCoreSwapPoints({
          userId,
          walletAddress: submittedWallet,
          verifiedUsd: verifiedSwapUsd,
          chainId: BOT_MAINNET_CHAIN_ID,
          txHash: normalizedTxHash,
        });
        pointsToEarn = accrual.award;
        if (!accrual.recorded) verifiedSwapUsd = 0;
      } else {
        const rules = await getRewardSettings();
        const { estimateFlowPointsForUsd } = await import("@/lib/rewards");
        pointsToEarn = estimateFlowPointsForUsd(verifiedSwapUsd, rules);
      }
    }
  }




  const { data: tx, error } = await supabaseAdmin
    .from("transactions_history")
    .insert({
      user_id: userId,
      tx_type: payload.txType,
      direction: payload.direction,
      from_amount: payload.fromAmount,
      to_amount: payload.toAmount,
      tx_hash: normalizedTxHash,
      status: payload.status,
      points_earned: pointsToEarn,
    })
    .select()
    .single();
  if (error) {
    // Unique (user_id, tx_hash) index: a concurrent duplicate submission lost
    // the race — return the stored row without awarding points twice.
    if ((error as any).code === "23505" && normalizedTxHash) {
      const { data: existing } = await supabaseAdmin
        .from("transactions_history")
        .select("*")
        .eq("user_id", userId)
        .eq("tx_hash", normalizedTxHash)
        .maybeSingle();
      if (existing) return existing;
    }
    throw error;
  }

  if (!isBridge && verifiedSwapUsd > 0) {
    await supabaseAdmin
      .from("profiles")
      .update({
        total_swap_volume_usd: Number(user.total_swap_volume_usd ?? 0) + verifiedSwapUsd,
        points_self: Number(user.points_self ?? 0) + pointsToEarn,
        flow_points: Number(user.flow_points ?? 0) + pointsToEarn,
      })
      .eq("id", userId);

    // Referral rewards. Under FLOW Points V2 the indefinite percentage share is
    // disabled and replaced by idempotent milestones (+15 / +35 / +50, max 100
    // per referred user, monthly cap per referrer).
    if (pointsToEarn > 0 && user.referred_by) {
      const { data: referrer } = await supabaseAdmin
        .from("profiles")
        .select("id, flow_points, points_referral_activity")
        .eq("referral_code", user.referred_by)
        .maybeSingle();
      if (referrer && referrer.id !== userId) {
        if (v2Live) {
          await grantReferralMilestones({
            refereeId: userId,
            referrerId: referrer.id,
            refereeWalletBound: !!boundWallet,
          });
        } else {
          const rules = await getRewardSettings();
          const { referralActivityShare } = await import("@/lib/rewards");
          const share = referralActivityShare(pointsToEarn, rules.referralActivityPct);
          if (share > 0) {
            await supabaseAdmin
              .from("profiles")
              .update({
                points_referral_activity: Number(referrer.points_referral_activity ?? 0) + share,
                flow_points: Number(referrer.flow_points ?? 0) + share,
              })
              .eq("id", referrer.id);
          }
        }
      }
    }
  }

  return tx;
}

export async function getTransactionHistory(userId: string) {
  const { data } = await supabaseAdmin
    .from("transactions_history")
    .select("id, tx_type, direction, from_amount, to_amount, tx_hash, status, points_earned, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

async function globalTotals() {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("flow_points, claimed_tokens");
  const all = data ?? [];
  const globalTotalEarned = all.reduce((s, u) => s + (u.claimed_tokens ?? 0) + (u.flow_points ?? 0), 0);
  const globalTotalClaimed = all.reduce((s, u) => s + (u.claimed_tokens ?? 0), 0);
  return { globalTotalEarned, globalTotalClaimed, totalUsers: all.length };
}

export const SOCIAL_LINKS = {
  youtube: "https://youtube.com/@flowbridgeweb3",
  x: "https://x.com/flowbridgeweb3",
  telegram: "https://t.me/flowbridgeweb3",
} as const;

export type SocialChannel = keyof typeof SOCIAL_LINKS;

export async function getSocialFollows(userId: string) {
  const { data } = await supabaseAdmin
    .from("social_follows")
    .select("youtube_confirmed_at, x_confirmed_at, telegram_confirmed_at, youtube_handle, x_handle, telegram_handle")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    youtube: !!data?.youtube_confirmed_at,
    x: !!data?.x_confirmed_at,
    telegram: !!data?.telegram_confirmed_at,
    youtubeHandle: (data as any)?.youtube_handle ?? null,
    xHandle: (data as any)?.x_handle ?? null,
    telegramHandle: (data as any)?.telegram_handle ?? null,
  };
}

function sanitizeHandle(raw: string, channel: SocialChannel) {
  let trimmed = raw.trim();
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const parts = url.pathname.split("/").filter(Boolean);
      trimmed = parts[0] ?? trimmed;
    }
  } catch {
    // Keep raw input and validate below.
  }
  trimmed = trimmed.replace(/^@+/, "").replace(/\/$/, "").slice(0, 64);

  if (channel === "x") {
    if (!/^[A-Za-z0-9_]{1,15}$/.test(trimmed)) {
      throw new Error("X handle must be 1–15 characters using letters, numbers, or underscore.");
    }
    return trimmed;
  }
  if (channel === "telegram") {
    if (!/^[A-Za-z0-9_]{5,32}$/.test(trimmed)) {
      throw new Error("Telegram username must be 5–32 characters using letters, numbers, or underscore.");
    }
    return trimmed;
  }
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(trimmed)) {
    throw new Error("YouTube handle must be at least 3 characters using letters, numbers, dot, underscore or dash.");
  }
  return trimmed;
}

function fetchTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function fetchText(url: string) {
  const timeout = fetchTimeout(8_000);
  try {
    const res = await fetch(url, {
      signal: timeout.signal,
      headers: { "user-agent": "FlowBridge social verification (+https://flowbridge.space)" },
    });
    const text = await res.text().catch(() => "");
    return { status: res.status, text };
  } finally {
    timeout.done();
  }
}

async function verifySocialProfileExists(channel: SocialChannel, handle: string) {
  if (channel === "youtube") {
    const res = await fetchText(`https://www.youtube.com/@${encodeURIComponent(handle)}`);
    if (res.status === 200 && /<title>|canonicalBaseUrl|channelId/i.test(res.text)) return;
    throw new Error(`Could not verify YouTube handle @${handle}. Check the spelling or make sure the channel exists.`);
  }

  if (channel === "telegram") {
    const res = await fetchText(`https://t.me/${encodeURIComponent(handle)}`);
    if (res.status === 200 && res.text.includes("tgme_page_title") && !res.text.includes("tgme_username_link")) return;
    throw new Error(`Could not verify Telegram username @${handle}. Check the spelling or use a public account/channel username.`);
  }

  const res = await fetchText(`https://publish.twitter.com/oembed?url=${encodeURIComponent(`https://x.com/${handle}`)}`);
  if (res.status === 200 && res.text.includes(`/${handle}`)) return;
  throw new Error(`Could not verify X handle @${handle}. Check the spelling or make sure the profile exists.`);
}

export async function confirmSocialFollow(userId: string, channel: SocialChannel, handle?: string) {
  const now = new Date().toISOString();
  const patch: Record<string, string | null> = { updated_at: now };
  const cleanedHandle = handle ? sanitizeHandle(handle, channel) : undefined;
  if (!cleanedHandle) throw new Error("Enter the handle you used to follow this channel.");
  await verifySocialProfileExists(channel, cleanedHandle);
  if (channel === "youtube") {
    patch.youtube_confirmed_at = now;
    patch.youtube_handle = cleanedHandle;
  } else if (channel === "x") {
    patch.x_confirmed_at = now;
    patch.x_handle = cleanedHandle;
  } else {
    patch.telegram_confirmed_at = now;
    patch.telegram_handle = cleanedHandle;
  }

  const { data: existing } = await supabaseAdmin
    .from("social_follows")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    await supabaseAdmin
      .from("social_follows")
      .update(patch as any)
      .eq("user_id", userId);
  } else {
    await supabaseAdmin
      .from("social_follows")
      .insert({ user_id: userId, ...patch } as any);
  }
  return getSocialFollows(userId);
}


function computeClaimable(
  u: {
    points_self?: number | null;
    points_referral_activity?: number | null;
    points_referral_signup?: number | null;
    total_swap_volume_usd?: number | string | null;
  },
  rules?: { referralClaimMinSwapUsd: number; claimThreshold: number },
) {
  // Admin-configurable: swap volume needed to unlock each block of
  // referral-signup points, and the size of that block.
  const unlockUsd = rules?.referralClaimMinSwapUsd && rules.referralClaimMinSwapUsd > 0 ? rules.referralClaimMinSwapUsd : 100;
  const block = rules?.claimThreshold && rules.claimThreshold > 0 ? rules.claimThreshold : 1000;
  const self = u.points_self ?? 0;
  const activity = u.points_referral_activity ?? 0;
  const signup = u.points_referral_signup ?? 0;
  const volume = Number(u.total_swap_volume_usd ?? 0);
  const maxSignupClaimable = Math.floor(volume / unlockUsd) * block;
  const signupUnlocked = Math.min(signup, maxSignupClaimable);
  const signupLocked = Math.max(0, signup - signupUnlocked);
  const nextUnlockUsd = signupLocked > 0
    ? Math.max(0, Math.ceil(((Math.floor(volume / unlockUsd) + 1) * unlockUsd) - volume))
    : 0;
  const claimable = self + activity + signupUnlocked;
  return { self, activity, signup, signupUnlocked, signupLocked, volume, nextUnlockUsd, claimable, unlockUsd, claimThreshold: block };
}


export async function getUserPointsAndReferrals(userId: string) {
  const { data: user } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (!user) throw new Error("Profile not found");

  let inviteCount = 0;
  if (user.referral_code) {
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("referred_by", user.referral_code);
    inviteCount = count ?? 0;
  }

  const totals = await globalTotals();
  const socials = await getSocialFollows(userId);
  const breakdown = computeClaimable(user as any, await getRewardSettings());
  return {
    flowPoints: user.flow_points,
    claimedTokens: user.claimed_tokens,
    referralCode: user.referral_code,
    referredBy: user.referred_by,
    walletAddress: user.wallet_address,
    lastBindingChange: user.last_binding_change,
    bindingChangesCount: user.binding_changes_count,
    inviteCount,
    pointsSelf: breakdown.self,
    pointsReferralActivity: breakdown.activity,
    pointsReferralSignup: breakdown.signup,
    signupUnlocked: breakdown.signupUnlocked,
    signupLocked: breakdown.signupLocked,
    totalSwapVolumeUsd: breakdown.volume,
    nextUnlockUsd: breakdown.nextUnlockUsd,
    claimableTotal: breakdown.claimable,
    socials,
    ...totals,
    milestoneReached: totals.globalTotalClaimed >= 1_000_000,
  };
}

export async function getGlobalIncentiveStats() {
  const totals = await globalTotals();
  const { count: txCount } = await supabaseAdmin
    .from("transactions_history")
    .select("id", { count: "exact", head: true });
  return {
    ...totals,
    totalTransactions: txCount ?? 0,
    milestoneReached: totals.globalTotalClaimed >= 1_000_000,
  };
}


export async function bindUserWallet(userId: string, walletAddress: string) {
  // Delegates to the SECURITY DEFINER RPC that safely bypasses the
  // profile-guard trigger via a per-transaction GUC, enforces the 2×/30d
  // rate limit, and validates the address format.
  const { data, error } = await supabaseAdmin.rpc("admin_bind_wallet", {
    p_user_id: userId,
    p_wallet: walletAddress,
  });
  if (error) throw new Error(error.message || "Failed to bind wallet");
  return data;
}

export async function claimFlowPoints(userId: string, emailVerified: boolean) {
  const { data: user } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (!user) throw new Error("Profile not found");

  if (!emailVerified) throw new Error("Please verify your email before claiming FLOW.");
  if (!user.wallet_address) throw new Error("Bind your Web3 wallet before claiming FLOW.");

  const socials = await getSocialFollows(userId);
  if (!socials.youtube || !socials.x || !socials.telegram) {
    throw new Error(
      "Follow all three community channels (YouTube, X, Telegram) before claiming FLOW.",
    );
  }

  const b = computeClaimable(user as any, await getRewardSettings());
  if (b.claimable < b.claimThreshold) {
    if (b.signupLocked > 0) {
      throw new Error(
        `Insufficient claimable FLOW. Referral-signup points unlock at $${b.unlockUsd} in swaps per ${b.claimThreshold.toLocaleString()}. Trade $${b.nextUnlockUsd} more to unlock the next ${b.claimThreshold.toLocaleString()}.`,
      );
    }
    throw new Error(
      `Insufficient FLOW points. A minimum of ${b.claimThreshold.toLocaleString()} claimable points is required.`,
    );
  }


  const newSelf = 0;
  const newActivity = 0;
  const newSignup = b.signupLocked; // keep locked signup points until user swaps more
  const newFlow = newSelf + newActivity + newSignup;

  await supabaseAdmin
    .from("profiles")
    .update({
      points_self: newSelf,
      points_referral_activity: newActivity,
      points_referral_signup: newSignup,
      flow_points: newFlow,
      claimed_tokens: (user.claimed_tokens ?? 0) + b.claimable,
    })
    .eq("id", userId);
  return getUserPointsAndReferrals(userId);
}


const DEFAULT_PROPOSALS = [
  {
    id: "1",
    category: "learning",
    text: "Interactive tutorials about cross-chain relaying and how bridges optimize protocol slippage routing.",
    votes: 12,
    author: "0x3f5...43b2",
  },
  {
    id: "2",
    category: "earning",
    text: "Liquidity Farming opportunities dashboard with real-time yield and APR arbitrage recommendations.",
    votes: 18,
    author: "0x73a...a20d",
  },
  {
    id: "3",
    category: "developer_tools",
    text: "Modular developer SDK to programmatically bridge USDT between custom subnet and public testnets.",
    votes: 9,
    author: "0x992...d931",
  },
];

export async function getProposals() {
  let { data } = await supabaseAdmin
    .from("proposals")
    .select("*")
    .order("votes", { ascending: false });
  if (!data || data.length === 0) {
    await supabaseAdmin.from("proposals").insert(DEFAULT_PROPOSALS);
    ({ data } = await supabaseAdmin
      .from("proposals")
      .select("*")
      .order("votes", { ascending: false }));
  }
  return data ?? [];
}

export async function createProposal(category: string, text: string, author: string) {
  const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await supabaseAdmin
    .from("proposals")
    .insert({ id, category, text, author: author || "Anonymous Supporter", votes: 1 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function upvoteProposal(id: string) {
  const { data: p } = await supabaseAdmin
    .from("proposals")
    .select("votes")
    .eq("id", id)
    .maybeSingle();
  if (!p) throw new Error(`Proposal with ID ${id} not found.`);
  const { data, error } = await supabaseAdmin
    .from("proposals")
    .update({ votes: (p.votes ?? 0) + 1 })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
