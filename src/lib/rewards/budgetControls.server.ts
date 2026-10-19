/**
 * Server-side budget controls. Read-only on chain; the only writes are
 * off-chain audit rows (reward_budget_adjustments) and, after verified
 * on-chain confirmation, the off-chain program ceiling in reward_budgets.
 * No private key exists here; nothing is signed or broadcast.
 */
import { createPublicClient, http, parseAbi, parseEventLogs, type Hex } from "viem";
import type { AdminContext } from "@/lib/admin/adminGate.server";
import {
  buildSetBudgetCalldata, requiredOnChainBudgetFlow, validateProposal, verifyBudgetTxIdentity,
  type BudgetProgram, type ProgramBudgetRow,
} from "./budgetControls";
import { DISTRIBUTOR, readChainState } from "./settlement.server";
import { DISTRIBUTOR_ROLES } from "./settlementPlanner";

const RPC = "https://rpc.botchain.ai";
const WEI = 10n ** 18n;
const client = () => createPublicClient({ transport: http(RPC, { timeout: 15000, retryCount: 0 }) });

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function db(): Promise<Admin> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

// ---------------------------------------------------------------- state read

export async function readBudgetControlsState() {
  const admin = await db();
  const [budgetsRes, adjRes, committedRes, chain] = await Promise.all([
    admin.from("reward_budgets").select("program_id,total_points,reserved_points,status,funding_verified"),
    admin.from("reward_budget_adjustments").select("*").order("created_at", { ascending: false }).limit(50),
    admin.from("flow_points_ledger").select("program_id,points,funding_state"),
    readChainState(),
  ]);

  const programs: (ProgramBudgetRow & { committedPoints: number; earnedPoints: number })[] =
    (budgetsRes.data ?? []).map((b: any) => {
      const rows = (committedRes.data ?? []).filter((l: any) => l.program_id === b.program_id);
      const earned = rows.reduce((s: number, l: any) => s + (l.points > 0 ? l.points : 0), 0);
      const funded = rows.filter((l: any) => l.funding_state === "FUNDED").reduce((s: number, l: any) => s + l.points, 0);
      return {
        programId: b.program_id as BudgetProgram,
        totalPoints: Number(b.total_points),
        reservedPoints: Number(b.reserved_points),
        status: b.status,
        fundingVerified: b.funding_verified,
        committedPoints: Math.max(Number(b.reserved_points), funded),
        earnedPoints: earned,
      };
    });

  const chainState = chain
    ? {
        campaignBudgetFlow: Number(chain.campaignBudgetWei / WEI),
        budgetRemainingFlow: Number((chain.campaignBudgetWei - chain.totalClaimedWei - chain.totalReservedWei) / WEI),
        freeBalanceFlow: Number(chain.balanceWei / WEI) - Number(chain.totalReservedWei / WEI),
        totalClaimedFlow: Number(chain.totalClaimedWei / WEI),
        totalReservedFlow: Number(chain.totalReservedWei / WEI),
        epochCount: chain.epochCount,
        paused: chain.paused,
      }
    : null;

  return {
    distributor: DISTRIBUTOR,
    budgetManagerRoleHolder: "0x88a4cc1f5771523baeb83daeea07d323a3ce9507",
    programs,
    chain: chainState,
    requiredOnChainBudgetFlow: chainState
      ? requiredOnChainBudgetFlow(programs, chainState.totalClaimedFlow)
      : null,
    adjustments: adjRes.data ?? [],
  };
}

// ------------------------------------------------------------------ propose

export async function proposeBudgetAdjustment(admin: AdminContext, programId: string, newBudget: number, note?: string) {
  const state = await readBudgetControlsState();
  const current = state.programs.find((p) => p.programId === programId) ?? null;
  const after = state.programs.map((p) =>
    p.programId === programId ? { ...p, totalPoints: newBudget } : p);
  const combinedNewTotal = requiredOnChainBudgetFlow(after, state.chain?.totalClaimedFlow ?? 0);
  const v = validateProposal({
    programId,
    newBudget,
    current,
    committedPoints: current?.committedPoints ?? 0,
    liveFreeFlow: state.chain?.freeBalanceFlow ?? null,
    combinedNewTotalFlow: combinedNewTotal,
  });
  if (!v.ok) return { ok: false as const, checks: v.checks };

  const onchainRequired = combinedNewTotal;
  const needsOnChainRaise = state.chain ? onchainRequired > state.chain.campaignBudgetFlow : true;
  const calldata = needsOnChainRaise ? buildSetBudgetCalldata(onchainRequired) : null;

  const dbAdmin = await db();
  const { data, error } = await dbAdmin.from("reward_budget_adjustments").insert({
    program_id: programId,
    previous_budget: current!.totalPoints,
    new_budget: newBudget,
    committed_points: current!.committedPoints,
    onchain_budget_required: onchainRequired,
    status: "PROPOSED",
    proposed_by: admin.userId,
    proposed_by_email: admin.email,
    note: note ?? null,
  }).select().single();
  if (error) return { ok: false as const, checks: [{ id: "INSERT", pass: false, detail: error.message }] };

  await dbAdmin.from("admin_audit_events").insert({
    actor_user_id: admin.userId, actor_email: admin.email, actor_role: admin.role,
    object_type: "reward_budget", object_id: programId, action: "BUDGET_PROPOSED",
    new_value: { adjustmentId: data.id, previous: current!.totalPoints, next: newBudget, onchainRequired, needsOnChainRaise },
    reason: note ?? "budget proposal",
  });

  return {
    ok: true as const,
    adjustment: data,
    checks: v.checks,
    onchain: needsOnChainRaise
      ? { required: true, to: DISTRIBUTOR, calldata, newBudgetFlow: onchainRequired, method: "setCampaignBudget(uint256)", roleRequired: "BUDGET_MANAGER_ROLE", roleHolder: "0x88a4cc1f5771523baeb83daeea07d323a3ce9507" }
      : { required: false },
  };
}

// ------------------------------------------------------------------ approve

export async function decideBudgetAdjustment(admin: AdminContext, id: string, decision: "approve" | "reject") {
  if (admin.role !== "super_admin") {
    return { ok: false as const, error: "Only a super admin may approve or reject budget changes." };
  }
  const dbAdmin = await db();
  const next = decision === "approve" ? "APPROVED_OFFCHAIN" : "REJECTED";
  // Atomic transition: only a PROPOSED row can move.
  const { data, error } = await dbAdmin.from("reward_budget_adjustments")
    .update({ status: next, approved_by: admin.userId, approved_by_email: admin.email, updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "PROPOSED").select().maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: "Adjustment is not in PROPOSED state (already decided or stale)." };

  // If no on-chain raise is required, the off-chain ceiling applies immediately.
  const chain = await readChainState();
  const onchainBudget = chain ? Number(chain.campaignBudgetWei / WEI) : null;
  let applied = false;
  if (decision === "approve" && onchainBudget !== null && Number(data.onchain_budget_required) <= onchainBudget) {
    const { data: upd } = await dbAdmin.from("reward_budgets")
      .update({ total_points: Number(data.new_budget), updated_at: new Date().toISOString() })
      .eq("program_id", data.program_id).eq("total_points", Number(data.previous_budget)).select().maybeSingle();
    if (!upd) return { ok: false as const, error: "Live budget changed since proposal — re-propose from fresh state." };
    await dbAdmin.from("reward_budget_adjustments").update({ status: "EXECUTED", updated_at: new Date().toISOString() }).eq("id", id).eq("status", next);
    applied = true;
  }

  await dbAdmin.from("admin_audit_events").insert({
    actor_user_id: admin.userId, actor_email: admin.email, actor_role: admin.role,
    object_type: "reward_budget", object_id: data.program_id,
    action: decision === "approve" ? (applied ? "BUDGET_APPLIED_OFFCHAIN_ONLY" : "BUDGET_APPROVED_AWAITING_ONCHAIN") : "BUDGET_REJECTED",
    new_value: { adjustmentId: id, newBudget: data.new_budget, onchainRequired: data.onchain_budget_required, applied },
    reason: "budget decision",
  });
  return { ok: true as const, adjustment: { ...data, status: applied ? "EXECUTED" : next }, appliedOffchain: applied };
}

// ------------------------------------------------------ on-chain execution

/** Build the exact transaction the budget-manager wallet must sign. */
export async function prepareBudgetTx(admin: AdminContext, id: string) {
  const dbAdmin = await db();
  const { data: a } = await dbAdmin.from("reward_budget_adjustments").select("*").eq("id", id).maybeSingle();
  if (!a) return { ok: false as const, error: "Unknown adjustment." };
  if (a.status !== "APPROVED_OFFCHAIN") return { ok: false as const, error: "Adjustment is not approved for on-chain execution." };
  const chain = await readChainState();
  if (!chain) return { ok: false as const, error: "Chain state unavailable — refusing to prepare." };
  const required = Number(a.onchain_budget_required);
  if (Number(chain.campaignBudgetWei / WEI) >= required) {
    return { ok: false as const, error: "On-chain budget already covers this change — no transaction needed. Re-check to apply." };
  }
  return {
    ok: true as const,
    tx: {
      chainId: 677,
      to: DISTRIBUTOR,
      data: buildSetBudgetCalldata(required),
      value: "0x0",
      newBudgetFlow: required,
      method: "setCampaignBudget(uint256)",
      roleRequired: "BUDGET_MANAGER_ROLE",
    },
  };
}

/** Verify a confirmed setCampaignBudget receipt, then apply the off-chain ceiling. Idempotent. */
export async function confirmBudgetTx(admin: AdminContext, id: string, txHash: Hex) {
  const dbAdmin = await db();
  const { data: a } = await dbAdmin.from("reward_budget_adjustments").select("*").eq("id", id).maybeSingle();
  if (!a) return { ok: false as const, error: "Unknown adjustment." };
  if (a.status === "EXECUTED") return { ok: true as const, already: true, adjustment: a };
  if (a.status !== "APPROVED_OFFCHAIN") return { ok: false as const, error: "Adjustment is not awaiting on-chain execution." };
  if (a.tx_hash && a.tx_hash.toLowerCase() !== txHash.toLowerCase()) {
    return { ok: false as const, error: "A different transaction hash is already recorded for this adjustment." };
  }

  const c = client();
  if ((await c.getChainId()) !== 677) return { ok: false as const, error: "Wrong RPC chain." };
  const missing = (e: unknown) => ["TransactionNotFoundError", "TransactionReceiptNotFoundError"].includes((e as Error).name);
  const [tx, receipt] = await Promise.all([
    c.getTransaction({ hash: txHash }).catch((e) => { if (missing(e)) return null; throw e; }),
    c.getTransactionReceipt({ hash: txHash }).catch((e) => { if (missing(e)) return null; throw e; }),
  ]);
  if (!tx || !receipt) return { ok: false as const, pending: true, error: "Transaction not found yet — it may still be pending. Re-check later; do NOT send another transaction." };

  const [block, head, hasRole] = await Promise.all([
    c.getBlock({ blockNumber: receipt.blockNumber }),
    c.getBlockNumber(),
    c.readContract({
      address: DISTRIBUTOR,
      abi: parseAbi(["function hasRole(bytes32,address) view returns (bool)"]),
      functionName: "hasRole",
      args: [DISTRIBUTOR_ROLES.BUDGET_MANAGER_ROLE, tx.from],
      blockNumber: receipt.blockNumber,
    }),
  ]);

  const logs = parseEventLogs({
    abi: parseAbi(["event CampaignBudgetUpdated(uint256 previousBudget, uint256 newBudget)"]),
    logs: receipt.logs,
  });
  const evt = logs.find((l) => l.address.toLowerCase() === DISTRIBUTOR.toLowerCase());

  const required = Number(a.onchain_budget_required);
  const identity = verifyBudgetTxIdentity(
    {
      chainId: 677,
      txTo: tx.to ?? "",
      txFrom: tx.from,
      txInput: tx.input,
      receiptStatus: receipt.status,
      blockHash: receipt.blockHash,
      canonicalBlockHash: block.hash ?? "",
      confirmations: head - receipt.blockNumber,
      eventNewBudgetWei: evt ? (evt.args as any).newBudget : null,
      senderHasBudgetManagerRole: !!hasRole,
    },
    { distributor: DISTRIBUTOR, expectedCalldata: buildSetBudgetCalldata(required), expectedNewBudgetWei: BigInt(required) * WEI },
  );
  if (!identity.complete) return { ok: false as const, checks: identity.checks, error: "On-chain verification failed." };

  // Persist hash + apply off-chain ceiling atomically (stale-state guarded).
  if (!a.tx_hash) {
    const { data: locked } = await dbAdmin.from("reward_budget_adjustments")
      .update({ tx_hash: txHash.toLowerCase(), updated_at: new Date().toISOString() })
      .eq("id", id).is("tx_hash", null).select().maybeSingle();
    if (!locked) return { ok: false as const, error: "Adjustment was modified concurrently — re-check." };
  }
  const { data: upd } = await dbAdmin.from("reward_budgets")
    .update({ total_points: Number(a.new_budget), updated_at: new Date().toISOString() })
    .eq("program_id", a.program_id).eq("total_points", Number(a.previous_budget)).select().maybeSingle();
  if (!upd) return { ok: false as const, error: "Live budget drifted since proposal — re-propose from fresh state." };
  await dbAdmin.from("reward_budget_adjustments")
    .update({ status: "EXECUTED", block_number: Number(receipt.blockNumber), updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "APPROVED_OFFCHAIN");
  await dbAdmin.from("admin_audit_events").insert({
    actor_user_id: admin.userId, actor_email: admin.email, actor_role: admin.role,
    object_type: "reward_budget", object_id: a.program_id, action: "BUDGET_EXECUTED_ONCHAIN",
    new_value: { adjustmentId: id, txHash: txHash.toLowerCase(), block: receipt.blockNumber.toString(), newBudget: a.new_budget, onchainBudget: required },
    reason: "verified setCampaignBudget receipt",
  });
  return { ok: true as const, adjustment: { ...a, status: "EXECUTED", tx_hash: txHash.toLowerCase() }, checks: identity.checks };
}

/** Re-check: if the on-chain budget already covers an approved adjustment, apply without a tx. */
export async function recheckBudgetAdjustment(admin: AdminContext, id: string) {
  const dbAdmin = await db();
  const { data: a } = await dbAdmin.from("reward_budget_adjustments").select("*").eq("id", id).maybeSingle();
  if (!a) return { ok: false as const, error: "Unknown adjustment." };
  if (a.status !== "APPROVED_OFFCHAIN") return { ok: false as const, error: "Adjustment is not awaiting on-chain execution." };
  const chain = await readChainState();
  if (!chain) return { ok: false as const, error: "Chain state unavailable." };
  if (Number(chain.campaignBudgetWei / WEI) < Number(a.onchain_budget_required)) {
    return { ok: false as const, error: "On-chain budget does not yet cover this change." };
  }
  const { data: upd } = await dbAdmin.from("reward_budgets")
    .update({ total_points: Number(a.new_budget), updated_at: new Date().toISOString() })
    .eq("program_id", a.program_id).eq("total_points", Number(a.previous_budget)).select().maybeSingle();
  if (!upd) return { ok: false as const, error: "Live budget drifted since proposal — re-propose from fresh state." };
  await dbAdmin.from("reward_budget_adjustments").update({ status: "EXECUTED", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "APPROVED_OFFCHAIN");
  await dbAdmin.from("admin_audit_events").insert({
    actor_user_id: admin.userId, actor_email: admin.email, actor_role: admin.role,
    object_type: "reward_budget", object_id: a.program_id, action: "BUDGET_APPLIED_AFTER_ONCHAIN_RECHECK",
    new_value: { adjustmentId: id, newBudget: a.new_budget },
    reason: "on-chain budget already sufficient",
  });
  return { ok: true as const, adjustment: { ...a, status: "EXECUTED" } };
}
