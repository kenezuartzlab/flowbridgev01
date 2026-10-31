/** Server-only voter rewards: vote indexing, period crediting and FLOW payouts from the dedicated payout wallet. */
import { createPublicClient, createWalletClient, encodeFunctionData, http, keccak256, parseAbi, parseUnits, formatUnits, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { botMainnet } from "@/lib/wagmi";
import { VOTE_CONTRACT } from "./vote";
import {
  EXPECTED_VOTE_IMPLEMENTATION, VOTE_EVENT_TOPIC, VOTE_CONTRACT_START_BLOCK,
  computeVoterCredits, flowPerBot, priceWithinDrift,
} from "./voterRewards";

const PROJECT_ID = 919;
const FLOW_TOKEN = "0xcaaB50F36252a57529AFeF651fa6B9f9281917fF" as const;
const FLOW_USDT_POOL = "0xDaCFc2574b6110892351Bd31afb36F95E7206162" as const;
const WBOT_USDT_POOL = "0x64f418471a1a7932a190e10da5a8551db5abec05" as const;
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
const CHUNK = 500_000n;
const MAX_CHUNKS = 20;

const ERC20 = parseAbi(["function transfer(address to, uint256 amount) returns (bool)", "function balanceOf(address) view returns (uint256)"]);
const POOL = parseAbi(["function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)"]);

const client = () => createPublicClient({ chain: botMainnet, transport: http() });
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;

export async function readImplementation(): Promise<string> {
  const raw = await client().getStorageAt({ address: VOTE_CONTRACT, slot: IMPL_SLOT });
  return `0x${(raw ?? "0x").slice(-40)}`.toLowerCase();
}

/** Idempotently pull new FlowBridge vote logs. Halts (never deletes) if the vote contract's implementation changes. */
export async function syncVotes(maxAgeMs = 60_000): Promise<{ halted: boolean; lastBlock: number }> {
  const db = await admin();
  const { data: st } = await db.from("vote_indexer_state").select("*").eq("id", 1).maybeSingle();
  if (st?.halted) return { halted: true, lastBlock: Number(st.last_block) };
  const c = client();
  const head = await c.getBlockNumber();
  const caughtUp = st && head - BigInt(st.last_block) < 2000n;
  if (st && caughtUp && Date.now() - new Date(st.synced_at).getTime() < maxAgeMs) return { halted: false, lastBlock: Number(st.last_block) };
  const impl = await readImplementation();
  if (!st) {
    await db.from("vote_indexer_state").insert({ id: 1, contract: VOTE_CONTRACT.toLowerCase(), implementation: impl, last_block: Number(VOTE_CONTRACT_START_BLOCK) - 1 });
  }
  if (impl !== EXPECTED_VOTE_IMPLEMENTATION) {
    await db.from("vote_indexer_state").update({ halted: true, halt_reason: `Vote contract implementation changed to ${impl}`, synced_at: new Date().toISOString() }).eq("id", 1);
    return { halted: true, lastBlock: Number(st?.last_block ?? 0) };
  }
  let from = BigInt(st?.last_block ?? Number(VOTE_CONTRACT_START_BLOCK) - 1) + 1n;
  const topic919 = `0x${PROJECT_ID.toString(16).padStart(64, "0")}` as Hex;
  for (let i = 0; i < MAX_CHUNKS && from <= head; i++) {
    const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n;
    const logs = await c.request({ method: "eth_getLogs", params: [{ address: VOTE_CONTRACT, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [VOTE_EVENT_TOPIC, topic919] }] }) as any[];
    const rows = logs.filter((l) => !l.removed).map((l) => ({
      tx_hash: l.transactionHash.toLowerCase(), log_index: Number(l.logIndex), project_id: PROJECT_ID,
      voter: `0x${l.topics[2].slice(-40)}`.toLowerCase(), block_number: Number(l.blockNumber),
      block_ts: new Date(Number(BigInt(l.topics[3])) * 1000).toISOString(), contract: VOTE_CONTRACT.toLowerCase(),
    }));
    if (rows.length) {
      const { error } = await db.from("vote_events").upsert(rows, { onConflict: "tx_hash,log_index", ignoreDuplicates: true });
      if (error) throw new Error("Could not store votes");
    }
    await db.from("vote_indexer_state").update({ last_block: Number(to), synced_at: new Date().toISOString() }).eq("id", 1).lt("last_block", Number(to));
    from = to + 1n;
  }
  return { halted: false, lastBlock: Number(from - 1n) };
}

const poolPrice = async (pool: Hex) => {
  const s = await client().readContract({ address: pool, abi: POOL, functionName: "slot0" });
  return (Number(s[0]) / 2 ** 96) ** 2 * 1e12; // token0 USDT (6dp) → token1 (18dp)
};

export async function livePrice() {
  const [flowPerUsdt, botPerUsdt] = await Promise.all([poolPrice(FLOW_USDT_POOL), poolPrice(WBOT_USDT_POOL)]);
  return { flowPerBot: flowPerBot(flowPerUsdt, botPerUsdt), flowPerUsdt, botPerUsdt, pools: { FLOW_USDT_POOL, WBOT_USDT_POOL }, at: new Date().toISOString() };
}

export async function rankedVoters(since: string, until: string, limit = 100) {
  const db = await admin();
  const { data, error } = await db.rpc("top_flowbridge_voters", { p_since: since, p_until: until, p_limit: limit });
  if (error) throw new Error("Could not read voters");
  return (data ?? []).map((r: any) => ({ wallet: r.voter as string, votes: Number(r.votes) }));
}

export async function previewPeriod(input: { startsAt: string; endsAt: string; botReceived: number }) {
  const sync = await syncVotes(0);
  if (sync.halted) throw new Error("Vote accounting is halted: BOT Chain's vote contract changed. Review before crediting.");
  if (new Date(input.endsAt).getTime() > Date.now()) throw new Error("The period has not ended yet.");
  const [voters, price] = await Promise.all([rankedVoters(input.startsAt, input.endsAt, 100_000), livePrice()]);
  const credits = computeVoterCredits(voters, input.botReceived, price.flowPerBot);
  return { price, credits, totalFlow: credits.reduce((s, c) => s + c.flow, 0) };
}

export async function creditPeriod(input: { label: string; startsAt: string; endsAt: string; botReceived: number; approvedFlowPerBot: number }, email: string) {
  const p = await previewPeriod(input);
  if (!priceWithinDrift(input.approvedFlowPerBot, p.price.flowPerBot)) throw new Error("BOT/FLOW price moved more than 2% since preview. Preview again.");
  const credits = computeVoterCredits(await rankedVoters(input.startsAt, input.endsAt, 100_000), input.botReceived, input.approvedFlowPerBot);
  if (!credits.length) throw new Error("No FlowBridge votes in this period.");
  const db = await admin();
  const { data, error } = await db.rpc("credit_vote_period", {
    p_period: { label: input.label, starts_at: input.startsAt, ends_at: input.endsAt, bot_received: input.botReceived,
      flow_per_bot: input.approvedFlowPerBot, price_evidence: p.price, implementation: EXPECTED_VOTE_IMPLEMENTATION,
      total_flow: credits.reduce((s, c) => s + c.flow, 0), voter_count: credits.length, created_by_email: email } as any,
    p_credits: credits as any,
  });
  if (error) throw new Error(/duplicate/i.test(error.message) ? "This period was already credited." : "Could not credit period.");
  return { periodId: data as string, voters: credits.length };
}

export function payoutAccount() {
  const key = process.env["VOTE_PAYOUT_PRIVATE_KEY"];
  if (!key) return null;
  return privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
}

export async function payoutWalletStatus() {
  const acct = payoutAccount();
  if (!acct) return { configured: false as const };
  const c = client();
  const [flow, bot] = await Promise.all([c.readContract({ address: FLOW_TOKEN, abi: ERC20, functionName: "balanceOf", args: [acct.address] }), c.getBalance({ address: acct.address })]);
  return { configured: true as const, address: acct.address, flow: formatUnits(flow, 18), bot: formatUnits(bot, 18) };
}

/** Settle claims whose outcome is not yet recorded. Never re-sends. */
export async function reconcileClaims() {
  const db = await admin();
  const { data } = await db.from("voter_claims").select("id,status,tx_hash,updated_at").in("status", ["RESERVED", "SENT"]);
  const c = client();
  for (const row of data ?? []) {
    if (row.status === "RESERVED" && !row.tx_hash && Date.now() - new Date(row.updated_at).getTime() > 10 * 60_000) {
      await db.from("voter_claims").update({ status: "FAILED", detail: "Never broadcast", updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "RESERVED");
    } else if (row.tx_hash) {
      const r = await c.getTransactionReceipt({ hash: row.tx_hash as Hex }).catch(() => null);
      if (r) await db.from("voter_claims").update({ status: r.status === "success" ? "CONFIRMED" : "FAILED", detail: r.status, updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "SENT");
    }
  }
}

export async function walletSummary(wallet: string) {
  const db = await admin();
  const [{ data: credits }, { data: claims }] = await Promise.all([
    db.from("voter_credits").select("flow").eq("wallet", wallet),
    db.from("voter_claims").select("flow,status,tx_hash,created_at").eq("wallet", wallet).order("created_at", { ascending: false }).limit(20),
  ]);
  const earned = (credits ?? []).reduce((s, c) => s + Number(c.flow), 0);
  const used = (claims ?? []).filter((c) => c.status !== "FAILED").reduce((s, c) => s + Number(c.flow), 0);
  const paid = (claims ?? []).filter((c) => c.status === "CONFIRMED").reduce((s, c) => s + Number(c.flow), 0);
  const pending = (claims ?? []).find((c) => c.status === "RESERVED" || c.status === "SENT") ?? null;
  return { earnedFlow: earned, paidFlow: paid, availableFlow: Math.max(0, earned - used), pending, claims: claims ?? [] };
}

export async function claimFlow(wallet: string) {
  await reconcileClaims();
  const acct = payoutAccount();
  if (!acct) return { ok: false, reason: "NOT_CONFIGURED" };
  const db = await admin();
  const { data: res, error } = await db.rpc("reserve_voter_claim", { p_wallet: wallet });
  if (error) return { ok: false, reason: "UNAVAILABLE" };
  const r = res as any;
  if (!r.ok) return r;
  const id = r.claim_id as string;
  const fail = (detail: string) => db.from("voter_claims").update({ status: "FAILED", detail, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "RESERVED");
  try {
    const c = client();
    const amount = parseUnits(String(r.flow), 18);
    const bal = await c.readContract({ address: FLOW_TOKEN, abi: ERC20, functionName: "balanceOf", args: [acct.address] });
    if (bal < amount) { await fail("Payout wallet low on FLOW"); return { ok: false, reason: "PAYOUT_WALLET_EMPTY" }; }
    const data = encodeFunctionData({ abi: ERC20, functionName: "transfer", args: [wallet as Hex, amount] });
    const w = createWalletClient({ account: acct, chain: botMainnet, transport: http() });
    const req = await w.prepareTransactionRequest({ to: FLOW_TOKEN, data, account: acct, chain: botMainnet });
    const signed = await w.signTransaction(req as any);
    const hash = keccak256(signed);
    // Record the hash before broadcasting so a crash can never cause a second payment.
    await db.from("voter_claims").update({ status: "SENT", tx_hash: hash, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "RESERVED");
    try { await c.sendRawTransaction({ serializedTransaction: signed }); }
    catch {
      const seen = await c.getTransaction({ hash }).catch(() => null);
      if (!seen) { await db.from("voter_claims").update({ status: "FAILED", detail: "Broadcast rejected", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "SENT"); return { ok: false, reason: "BROADCAST_FAILED" }; }
    }
    const receipt = await c.waitForTransactionReceipt({ hash, timeout: 45_000 }).catch(() => null);
    if (!receipt) return { ok: true, status: "SENT", txHash: hash, flow: r.flow };
    await db.from("voter_claims").update({ status: receipt.status === "success" ? "CONFIRMED" : "FAILED", detail: receipt.status, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "SENT");
    return receipt.status === "success" ? { ok: true, status: "CONFIRMED", txHash: hash, flow: r.flow } : { ok: false, reason: "REVERTED", txHash: hash };
  } catch {
    await fail("Could not prepare payout");
    return { ok: false, reason: "UNAVAILABLE" };
  }
}
