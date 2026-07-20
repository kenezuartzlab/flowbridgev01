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
  },
) {
  const { data: user } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (!user) throw new Error("Profile not found");

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
  return {
    flowPoints: user.flow_points,
    claimedTokens: user.claimed_tokens,
    referralCode: user.referral_code,
    referredBy: user.referred_by,
    walletAddress: user.wallet_address,
    lastBindingChange: user.last_binding_change,
    bindingChangesCount: user.binding_changes_count,
    inviteCount,
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
  const normalized = walletAddress.trim().toLowerCase();
  const { data: user } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (!user) throw new Error("Profile not found");

  const { data: dup } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("wallet_address", normalized)
    .neq("id", userId)
    .maybeSingle();
  if (dup) {
    console.warn(
      `[bindUserWallet] wallet ${normalized} already bound to another account (user ${dup.id})`,
    );
    throw new Error("This wallet address is already registered to another account.");
  }

  const now = new Date();
  let currentCount = user.binding_changes_count ?? 0;
  let lastChange: Date | null = user.last_binding_change ? new Date(user.last_binding_change) : null;

  if (user.wallet_address && user.wallet_address.toLowerCase() !== normalized) {
    if (lastChange) {
      const diffDays = (now.getTime() - lastChange.getTime()) / 86_400_000;
      if (diffDays >= 30) currentCount = 0;
    }
    if (currentCount >= 2) {
      const daysToWait = lastChange
        ? Math.max(0, Math.ceil(30 - (now.getTime() - lastChange.getTime()) / 86_400_000))
        : 30;
      throw new Error(
        `You have already changed your wallet binding 2 times within 30 days. Please wait ${daysToWait} day(s) before changing again.`,
      );
    }
    currentCount += 1;
    lastChange = now;
  } else if (!user.wallet_address) {
    currentCount = 1;
    lastChange = now;
  }

  const { data: updated, error } = await supabaseAdmin
    .from("profiles")
    .update({
      wallet_address: normalized,
      binding_changes_count: currentCount,
      last_binding_change: lastChange ? lastChange.toISOString() : null,
    })
    .eq("id", userId)
    .select()
    .single();
  if (error) throw error;
  return updated;
}

export async function claimFlowPoints(userId: string) {
  const { data: user } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (!user) throw new Error("Profile not found");
  if ((user.flow_points ?? 0) < 1000) {
    throw new Error("Insufficient FLOW points. A minimum of 1,000 points is required to claim.");
  }
  const claimable = user.flow_points ?? 0;
  await supabaseAdmin
    .from("profiles")
    .update({ flow_points: 0, claimed_tokens: (user.claimed_tokens ?? 0) + claimable })
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
