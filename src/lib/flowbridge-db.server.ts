// Server-only DB helpers that replicate the original FlowBridge Express/Drizzle
// queries against Lovable Cloud (Supabase) using the service-role client.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function generateReferralCode() {
  let code = "FB-";
  for (let i = 0; i < 5; i++) code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  return code;
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

  if (finalReferredBy) {
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
  await supabaseAdmin
    .from("profiles")
    .update({
      flow_points: (ref.flow_points ?? 0) + 50,
      points_referral_signup: (ref.points_referral_signup ?? 0) + 50,
    })
    .eq("id", ref.id);
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

  // Bridge transactions are excluded from earnings — only FlowBridgeRouter
  // swap activity is eligible for rewards / swap-volume accrual.
  if (String(payload.txType).toUpperCase() === "BRIDGE") {
    throw new Error("Bridge transactions do not accrue rewards.");
  }


  // SECURITY: Do not award points from client-supplied transaction data.
  // Points must only be awarded by server-side on-chain verification (e.g., a
  // trusted webhook or RPC-verified txHash). Recording the transaction row is
  // still allowed for user history, but points_earned is always 0 here.
  const pointsToEarn = 0;


  const { data: tx, error } = await supabaseAdmin
    .from("transactions_history")
    .insert({
      user_id: userId,
      tx_type: payload.txType,
      direction: payload.direction,
      from_amount: payload.fromAmount,
      to_amount: payload.toAmount,
      tx_hash: payload.txHash,
      status: payload.status,
      points_earned: pointsToEarn,
    })
    .select()
    .single();
  if (error) throw error;

  // No client-driven point awards; verified on-chain flows should update
  // profiles.flow_points server-side after verification.

  return tx;
}

export async function getTransactionHistory(userId: string) {
  const { data } = await supabaseAdmin
    .from("transactions_history")
    .select("id, tx_type, direction, from_amount, to_amount, tx_hash, status, created_at")
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


function computeClaimable(u: {
  points_self?: number | null;
  points_referral_activity?: number | null;
  points_referral_signup?: number | null;
  total_swap_volume_usd?: number | string | null;
}) {
  const self = u.points_self ?? 0;
  const activity = u.points_referral_activity ?? 0;
  const signup = u.points_referral_signup ?? 0;
  const volume = Number(u.total_swap_volume_usd ?? 0);
  // $100 total swaps unlocks 1000 signup-referral points
  const maxSignupClaimable = Math.floor(volume / 100) * 1000;
  const signupUnlocked = Math.min(signup, maxSignupClaimable);
  const signupLocked = Math.max(0, signup - signupUnlocked);
  const nextUnlockUsd = signupLocked > 0
    ? Math.max(0, Math.ceil(((Math.floor(volume / 100) + 1) * 100) - volume))
    : 0;
  const claimable = self + activity + signupUnlocked;
  return { self, activity, signup, signupUnlocked, signupLocked, volume, nextUnlockUsd, claimable };
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
  const breakdown = computeClaimable(user as any);
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

  const b = computeClaimable(user as any);
  if (b.claimable < 1000) {
    if (b.signupLocked > 0) {
      throw new Error(
        `Insufficient claimable FLOW. Referral-signup points unlock at $100 in swaps per 1,000. Trade $${b.nextUnlockUsd} more to unlock the next 1,000.`,
      );
    }
    throw new Error("Insufficient FLOW points. A minimum of 1,000 claimable points is required.");
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
