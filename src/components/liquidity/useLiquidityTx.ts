/**
 * Liquidity V1 — explicit, user-signed execution with lifecycle tracking.
 * Exact approvals only; simulate before every signature; Confirmed only after a
 * successful receipt; leftover allowances are reported (clearing is a separate
 * user-signed action — never automatic).
 */
import { useCallback, useRef, useState } from "react";
import { useAccount, useConfig, useWriteContract } from "wagmi";
import { getAccount } from "wagmi/actions";
import type { Abi, Address } from "viem";
import { ERC20_LITE_ABI } from "@/lib/liquidity/abis";
import { liqClient, readAllowance } from "@/lib/liquidity/chainReads";
import { phaseFromReceipt, upsertLiquidityActivity, type LiquidityActivity, type LiquidityActivityKind, type TxPhase } from "@/lib/liquidity/lifecycle";
import { approvalAmounts, assertLiquidityExecution } from "@/lib/liquidity/executionSafety";

export interface ApprovalNeed { token: Address; symbol: string; spender: Address; amount: bigint }
export interface LiquidityCall { address: Address; abi: Abi; functionName: string; args: readonly unknown[]; value?: bigint }
export interface LiquidityOp {
  kind: LiquidityActivityKind;
  chainId: number;
  dex: string;
  pair: string;
  amounts: string[];
  tokenId?: string;
  pool?: string;
  approvals: ApprovalNeed[];
  call: LiquidityCall;
  /** Account captured at review time; a later account change invalidates review. */
  account?: Address;
  label: string;
}

export interface TxStepView { label: string; phase: TxPhase; hash?: string; error?: string }

export function useLiquidityTx() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const config = useConfig();
  const running = useRef(false);
  const [steps, setSteps] = useState<TxStepView[]>([]);
  const [busy, setBusy] = useState(false);
  const [leftover, setLeftover] = useState<ApprovalNeed[]>([]);

  const run = useCallback(async (op: LiquidityOp): Promise<boolean> => {
    if (running.current) return false;
    if (!address) { setSteps([{ label: op.label, phase: "failed", error: "Connect a wallet first" }]); return false; }
    running.current = true;
    const expectedWallet = op.account ?? address;
    const guard = () => {
      const current = getAccount(config);
      assertLiquidityExecution({ chainId: op.chainId, walletChainId: current.chainId, wallet: current.address, expectedWallet, dex: op.dex, kind: op.kind, target: op.call.address });
    };
    const pub = liqClient(op.chainId);
    setBusy(true);
    setLeftover([]);
    const view: TxStepView[] = [];
    const push = (s: TxStepView) => { view.push(s); setSteps([...view]); return view.length - 1; };
    const patch = (i: number, s: Partial<TxStepView>) => { view[i] = { ...view[i], ...s }; setSteps([...view]); };
    const activity: LiquidityActivity = {
      id: `${op.kind}-${Date.now()}`, kind: op.kind, chainId: op.chainId, dex: op.dex, pair: op.pair,
      amounts: op.amounts, tokenId: op.tokenId, pool: op.pool, wallet: address, createdAt: Date.now(), txs: [], completed: false,
    };
    const sendOne = async (label: string, call: LiquidityCall, approval: boolean) => {
      const i = push({ label, phase: approval ? "approval-required" : "preparing" });
      try {
        guard();
        await pub.simulateContract({ account: address, address: call.address, abi: call.abi, functionName: call.functionName as never, args: call.args as never, value: call.value } as never);
        guard();
        patch(i, { phase: "waiting-signature" });
        const hash = await writeContractAsync({ address: call.address, abi: call.abi, functionName: call.functionName as never, args: call.args as never, value: call.value, chainId: op.chainId } as never);
        patch(i, { phase: "submitted", hash });
        activity.txs.push({ hash, label, phase: "submitted" });
        upsertLiquidityActivity(activity);
        patch(i, { phase: "confirming" });
        const receipt = await pub.waitForTransactionReceipt({ hash });
        const phase = phaseFromReceipt(receipt);
        patch(i, { phase });
        activity.txs[activity.txs.length - 1].phase = phase;
        upsertLiquidityActivity(activity);
        if (phase !== "confirmed") throw new Error("Transaction reverted on-chain");
      } catch (e) {
        const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message ?? "Failed";
        const submitted = view[i].hash;
        patch(i, { phase: submitted && view[i].phase !== "failed" ? "confirming" : "failed", error: submitted && view[i].phase !== "failed" ? "Receipt unavailable. Check the transaction before retrying; it may still confirm." : msg.slice(0, 200) });
        if (!submitted) activity.error = msg.slice(0, 200);
        if (activity.txs.length) upsertLiquidityActivity(activity);
        throw e;
      }
    };
    try {
      guard();
      for (const a of op.approvals) {
        if (a.spender.toLowerCase() !== op.call.address.toLowerCase()) throw new Error("Approval spender does not match the liquidity contract.");
      }
      for (const a of op.approvals) {
        const cur = await readAllowance(op.chainId, a.token, address, a.spender);
        for (const amount of approvalAmounts(cur, a.amount)) {
          await sendOne(amount === 0n ? `Reset ${a.symbol} approval to 0` : `Approve exactly ${a.symbol}`, { address: a.token, abi: ERC20_LITE_ABI as Abi, functionName: "approve", args: [a.spender, amount] }, true);
        }
        if (await readAllowance(op.chainId, a.token, address, a.spender) !== a.amount) throw new Error(`${a.symbol} approval was not applied exactly. Stopped before liquidity submission.`);
      }
      await sendOne(op.label, op.call, false);
      activity.completed = true;
      upsertLiquidityActivity(activity);
      const left: ApprovalNeed[] = [];
      for (const a of op.approvals) {
        const rest = await readAllowance(op.chainId, a.token, address, a.spender);
        if (rest > 0n) left.push({ ...a, amount: rest });
      }
      setLeftover(left);
      return true;
    } catch (e) {
      if (!view.length) setSteps([{ label: op.label, phase: "failed", error: (e as Error).message }]);
      if (!activity.txs.some(t => t.phase === "submitted" || t.phase === "confirming")) {
        activity.error = (e as Error).message;
        upsertLiquidityActivity(activity);
      }
      return false;
    } finally {
      setBusy(false);
      running.current = false;
    }
  }, [address, config, writeContractAsync]);

  const clearLeftover = useCallback(async (chainId: number, a: ApprovalNeed) => {
    if (!address || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const pub = liqClient(chainId);
      const current = getAccount(config);
      if (current.address?.toLowerCase() !== address.toLowerCase() || current.chainId !== chainId) throw new Error("Wallet or network changed. Review again.");
      await pub.simulateContract({ account: address, address: a.token, abi: ERC20_LITE_ABI, functionName: "approve", args: [a.spender, 0n] });
      const hash = await writeContractAsync({ address: a.token, abi: ERC20_LITE_ABI, functionName: "approve", args: [a.spender, 0n], chainId });
      const r = await pub.waitForTransactionReceipt({ hash });
      if (r.status === "success") setLeftover((l) => l.filter((x) => x.token !== a.token || x.spender !== a.spender));
    } finally {
      setBusy(false);
      running.current = false;
    }
  }, [address, config, writeContractAsync]);

  return { run, steps, busy, leftover, clearLeftover, reset: () => { setSteps([]); setLeftover([]); } };
}
