/**
 * FlowBridge MultiSend V1 — workspace.
 *
 * Non-custodial by construction: the contract executes ONE source wallet per
 * on-chain call, so every independent source authorizes its own transaction from
 * its own wallet. FlowBridge never asks for a private key or recovery phrase,
 * never requests a wallet transaction before Review, and re-reads the live fee /
 * configuration immediately before each signature.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ClipboardPaste,
  Download,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";

import { SectionHeader, StatusPill, Surface } from "@/components/ui-kit/primitives";
import { Button } from "@/components/ui/button";
import { QrScanButton } from "@/components/wallet/QrScanButton";
import { ERC20_ABI } from "@/lib/contracts";
import { getCuratedTokens } from "@/lib/swap/tokenRegistry";
import { MULTISEND_ABI } from "@/lib/multisend/abi";
import { errorsCsv, importSummaryText, parseImport, receiptCsv, type ImportPreview } from "@/lib/multisend/csv";
import { MULTISEND_NETWORKS, multiSendContract, networkForChain } from "@/lib/multisend/deployments";
import {
  buildMultiSendPlan,
  equalSplit,
  NATIVE_GAS_RESERVE_WEI,
  quotePercentRecipientsTotal,
  validateSourceAffordability,
} from "@/lib/multisend/planner";
import { parseQrPayload, shortAddress } from "@/lib/multisend/qr";
import {
  initialReceipts,
  isRetryable,
  newClientBatchId,
  nextSignableIndex,
  queueLabel,
  saveSession,
  sessionStatus,
} from "@/lib/multisend/session";
import { isConfigStale, useMultiSendConfig } from "@/lib/multisend/useMultiSendConfig";
import type { Address, MultiSendMode, MultiSendPlan, SourceReceipt } from "@/lib/multisend/types";
import { MultiSendModePicker } from "./MultiSendModePicker";
import { MultiSendGuide } from "./MultiSendGuide";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const NATIVE = "native" as const;
const DEADLINE_SECONDS = 20 * 60;

interface DraftRow {
  id: string;
  source: string;
  recipient: string;
  amountText: string;
}

interface AssetChoice {
  kind: "native" | "erc20";
  address: Address | null;
  symbol: string;
  decimals: number;
}

const rowId = () => Math.random().toString(36).slice(2, 10);

export function MultiSendWorkspace() {
  const { address: connected } = useAccount();
  const walletChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [mode, setMode] = useState<MultiSendMode | null>(null);
  const [chainId, setChainId] = useState<number>(MULTISEND_NETWORKS[0].chainId);
  const network = networkForChain(chainId);
  const publicClient = usePublicClient({ chainId });
  const { config, unavailable, refresh, fetchFresh } = useMultiSendConfig(chainId);

  const [asset, setAsset] = useState<AssetChoice>({ kind: NATIVE, address: null, symbol: "BOT", decimals: 18 });
  const [customToken, setCustomToken] = useState("");
  const [customError, setCustomError] = useState("");

  const [destination, setDestination] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const [balances, setBalances] = useState<Record<string, { asset: bigint; native: bigint }>>({});
  const [reviewed, setReviewed] = useState<{
    plan: MultiSendPlan;
    configFp: string;
    /** Estimated network gas cost in native units, per source wallet. */
    gasCost: Record<string, bigint>;
  } | null>(null);
  const [receipts, setReceipts] = useState<SourceReceipt[] | null>(null);
  const [batchId, setBatchId] = useState<`0x${string}` | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const curated = useMemo(() => {
    if (chainId !== 677 && chainId !== 968) return [];
    return getCuratedTokens(chainId === 677);
  }, [chainId]);

  const nativeSymbol = network?.nativeSymbol ?? "BOT";
  const executable = Boolean(multiSendContract(chainId));

  // Draft persistence: switching accounts in a mobile wallet often reloads the
  // page. The whole plan + queue is kept on this device so the next wallet can
  // continue exactly where the previous one stopped.
  const hydratedRef = useRef(false);
  const restoredKeyRef = useRef<string | null>(null);
  const restoredChainRef = useRef<number | null>(null);
  const pendingResumeRef = useRef<SourceReceipt[] | null>(null);
  const draftKey = (c: number, a: AssetChoice, m: MultiSendMode | null, d: string, r: DraftRow[]) =>
    JSON.stringify([c, a.address, a.kind, m, d, r]);

  useEffect(() => {
    const draft = loadDraft();
    hydratedRef.current = true;
    if (!draft) return;
    restoredKeyRef.current = draftKey(draft.chainId, draft.asset, draft.mode, draft.destination, draft.rows);
    restoredChainRef.current = draft.chainId;
    pendingResumeRef.current = draft.receipts;
    setMode(draft.mode);
    setChainId(draft.chainId);
    setAsset(draft.asset);
    setDestination(draft.destination);
    setRows(draft.rows);
    setBatchId(draft.batchId);
  }, []);

  // Any network / token / mode change invalidates a prepared review.
  useEffect(() => {
    if (restoredKeyRef.current && restoredKeyRef.current === draftKey(chainId, asset, mode, destination, rows)) return;
    restoredKeyRef.current = null;
    pendingResumeRef.current = null;
    setReviewed(null);
    setReceipts(null);
    setError("");
  }, [chainId, asset.address, asset.kind, mode, rows, destination]);

  useEffect(() => {
    if (restoredChainRef.current === chainId) {
      restoredChainRef.current = null;
      return;
    }
    restoredChainRef.current = null;
    setAsset({ kind: NATIVE, address: null, symbol: nativeSymbol, decimals: 18 });
    setRows([]);
    setDestination("");
  }, [chainId, nativeSymbol]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveDraft({ mode, chainId, asset, destination, rows, batchId, receipts });
  }, [mode, chainId, asset, destination, rows, batchId, receipts]);

  /* ------------------------------------------------------------ balances -- */
  const sourceList = useMemo(() => {
    const list = mode === "one-to-many" ? [connected ?? ""] : rows.map((r) => r.source);
    return Array.from(new Set(list.filter((a) => ADDRESS_RE.test(a)).map((a) => a.toLowerCase())));
  }, [mode, rows, connected]);

  const loadBalances = useCallback(async () => {
    if (!publicClient || sourceList.length === 0) return;
    const entries = await Promise.all(
      sourceList.map(async (addr) => {
        try {
          const native = await publicClient.getBalance({ address: addr as Address });
          const assetBalance =
            asset.kind === NATIVE
              ? native
              : ((await publicClient.readContract({
                  address: asset.address as Address,
                  abi: ERC20_ABI,
                  functionName: "balanceOf",
                  args: [addr as Address],
                })) as bigint);
          return [addr, { asset: assetBalance, native }] as const;
        } catch {
          return [addr, { asset: 0n, native: 0n }] as const;
        }
      }),
    );
    setBalances(Object.fromEntries(entries));
  }, [publicClient, sourceList, asset]);

  useEffect(() => {
    void loadBalances();
  }, [loadBalances]);

  /* ------------------------------------------------------- custom token -- */
  const importCustomToken = async () => {
    setCustomError("");
    if (!ADDRESS_RE.test(customToken.trim())) {
      setCustomError("Enter a valid token address.");
      return;
    }
    if (!publicClient) return;
    try {
      const address = customToken.trim() as Address;
      const [symbol, decimals] = await Promise.all([
        publicClient.readContract({ address, abi: ERC20_ABI, functionName: "symbol" }),
        publicClient.readContract({ address, abi: ERC20_ABI, functionName: "decimals" }),
      ]);
      setAsset({ kind: "erc20", address, symbol: String(symbol), decimals: Number(decimals) });
      setCustomToken("");
    } catch {
      setCustomError("That address did not respond as a token on this network.");
    }
  };

  /* ---------------------------------------------------------------- rows -- */
  const addRow = () =>
    setRows((r) => [
      ...r,
      { id: rowId(), source: mode === "one-to-many" ? connected ?? "" : "", recipient: mode === "many-to-one" ? destination : "", amountText: "" },
    ]);

  const updateRow = (id: string, patch: Partial<DraftRow>) =>
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const removeRow = (id: string) => setRows((r) => r.filter((row) => row.id !== id));

  useEffect(() => {
    if (mode !== "many-to-one") return;
    if (!ADDRESS_RE.test(destination)) return;
    setRows((r) => r.map((row) => ({ ...row, recipient: destination })));
  }, [destination, mode]);

  const runImport = (text: string) => {
    if (!mode) return;
    const existingKeys = rows.map((r) => `${r.source.toLowerCase()}>${r.recipient.toLowerCase()}`);
    setPreview(parseImport({ text, mode, existingKeys }));
  };

  const acceptImport = (p: ImportPreview, includeDuplicates: boolean) => {
    const chosen = includeDuplicates ? [...p.valid, ...p.duplicates] : p.valid;
    setRows((r) => [
      ...r,
      ...chosen.map((row) => ({
        id: rowId(),
        source: (row.source ?? (mode === "one-to-many" ? connected ?? "" : "")) as string,
        recipient: (row.recipient ?? destination) as string,
        amountText: row.amountText,
      })),
    ]);
    setPreview(null);
    setPasteText("");
  };

  const download = (name: string, content: string) => {
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* -------------------------------------------------------- amount tools -- */
  const applySameAmount = (text: string) => setRows((r) => r.map((row) => ({ ...row, amountText: text })));

  const applyEqualSplit = (totalText: string) => {
    try {
      const total = parseUnits(totalText as `${number}`, asset.decimals);
      const parts = equalSplit(total, rows.length);
      setRows((r) => r.map((row, i) => ({ ...row, amountText: formatUnits(parts[i], asset.decimals) })));
    } catch {
      setError("That total cannot be split across the current rows.");
    }
  };

  const applyPercent = (percent: number) => {
    if (!config) return;
    setRows((r) =>
      r.map((row) => {
        const bal = balances[row.source.toLowerCase()];
        if (!bal) return row;
        const rowsForSource = r.filter((x) => x.source.toLowerCase() === row.source.toLowerCase()).length || 1;
        const total = quotePercentRecipientsTotal({
          balance: bal.asset,
          isNative: asset.kind === NATIVE,
          feeBps: config.feeBps,
          percent,
        });
        const share = total / BigInt(rowsForSource);
        return { ...row, amountText: formatUnits(share, asset.decimals) };
      }),
    );
  };

  /* -------------------------------------------------------------- review -- */
  const buildPlan = (): MultiSendPlan | null => {
    if (!mode || !config) return null;
    const parsed = rows.map((row, i) => {
      if (!ADDRESS_RE.test(row.source)) throw new Error(`Row ${i + 1}: source wallet is not valid.`);
      if (!ADDRESS_RE.test(row.recipient)) throw new Error(`Row ${i + 1}: recipient is not valid.`);
      return {
        id: String(i + 1),
        source: row.source as Address,
        recipient: row.recipient as Address,
        amount: parseUnits((row.amountText || "0") as `${number}`, asset.decimals),
      };
    });
    return buildMultiSendPlan({
      mode,
      clientBatchId: batchId ?? newClientBatchId(),
      rows: parsed,
      feeBps: config.feeBps,
      maxRecipientsPerSource: config.maxRecipients,
    });
  };

  const openReview = async () => {
    setError("");
    setBusy(true);
    try {
      const fresh = await refresh();
      if (!fresh) throw new Error("MultiSend configuration is unavailable — nothing can be prepared.");
      if (fresh.paused) throw new Error("MultiSend is paused right now.");
      const id = batchId ?? newClientBatchId();
      setBatchId(id);
      const plan = buildMultiSendPlan({
        mode: mode!,
        clientBatchId: id,
        rows: rows.map((row, i) => ({
          id: String(i + 1),
          source: row.source as Address,
          recipient: row.recipient as Address,
          amount: parseUnits((row.amountText || "0") as `${number}`, asset.decimals),
        })),
        feeBps: fresh.feeBps,
        maxRecipientsPerSource: fresh.maxRecipients,
      });

      for (const source of plan.sources) {
        const bal = balances[source.source.toLowerCase()] ?? { asset: 0n, native: 0n };
        const check = validateSourceAffordability({
          plan: source,
          isNative: asset.kind === NATIVE,
          assetBalance: bal.asset,
          nativeBalance: bal.native,
        });
        if (!check.ok) throw new Error(`${shortAddress(source.source)}: ${check.reason}`);
      }

      // Estimated network gas per source wallet, shown separately from the FlowBridge fee.
      const gasCost: Record<string, bigint> = {};
      if (publicClient) {
        const gasPrice = await publicClient.getGasPrice().catch(() => 0n);
        const contract = multiSendContract(chainId);
        const isNative = asset.kind === NATIVE;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
        for (const source of plan.sources) {
          let gas = 21_000n + 40_000n * BigInt(source.recipients.length); // conservative fallback
          if (contract) {
            try {
              gas = await publicClient.estimateContractGas({
                address: contract,
                abi: MULTISEND_ABI,
                functionName: isNative ? "sendNative" : "sendToken",
                args: (isNative
                  ? [plan.clientBatchId, source.recipients, source.amounts, fresh.feeBps, fresh.configNonce, deadline]
                  : [plan.clientBatchId, asset.address as Address, source.recipients, source.amounts, fresh.feeBps, fresh.configNonce, deadline]) as never,
                account: source.source,
                value: (isNative ? source.requiredAssetSpend : undefined) as never,
              });
            } catch {
              /* keep the conservative estimate — an approval may still be pending */
            }
          }
          gasCost[source.source.toLowerCase()] = gas * gasPrice;
        }
      }

      setReviewed({ plan, configFp: `${fresh.configNonce}:${fresh.feeBps}:${fresh.feeRecipient}`, gasCost });
      setReceipts(initialReceipts(plan));
    } catch (e) {
      setReviewed(null);
      setError(e instanceof Error ? e.message : "Could not prepare this session.");
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------------------------------------- signing -- */
  const persist = (next: SourceReceipt[]) => {
    setReceipts(next);
    if (!batchId || !mode || !config) return;
    saveSession({
      clientBatchId: batchId,
      mode,
      chainId,
      assetKind: asset.kind,
      tokenAddress: asset.address,
      tokenSymbol: asset.symbol,
      tokenDecimals: asset.decimals,
      feeBps: config.feeBps,
      configNonce: config.configNonce.toString(),
      destination: mode === "many-to-one" ? (destination as Address) : null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      receipts: next,
    });
  };

  const signSource = async (index: number) => {
    if (!reviewed || !receipts || !config || !publicClient || !batchId) return;
    const source = reviewed.plan.sources[index];
    setError("");
    setBusy(true);
    try {
      if (!connected) throw new Error("Connect your wallet first — nothing was submitted.");
      if (connected.toLowerCase() !== source.source.toLowerCase()) {
        throw new Error(`Switch your wallet to ${shortAddress(source.source)} to authorize this transaction.`);
      }
      if (walletChainId !== chainId) {
        await switchChainAsync({ chainId });
      }

      // Fee / configuration must be re-read as fresh chain state before signing.
      const fresh = await fetchFresh();
      if (!fresh || fresh.paused) throw new Error("MultiSend is paused or unreadable — nothing was submitted.");
      if (isConfigStale({ ...config }, fresh) && `${fresh.configNonce}:${fresh.feeBps}:${fresh.feeRecipient}` !== reviewed.configFp) {
        setReviewed(null);
        throw new Error("The MultiSend fee or configuration changed. Review the refreshed terms and retry.");
      }

      const contract = multiSendContract(chainId)!;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
      const isNative = asset.kind === NATIVE;

      if (!isNative) {
        const allowance = (await publicClient.readContract({
          address: asset.address as Address,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [connected, contract],
        })) as bigint;
        if (allowance < source.requiredAssetSpend) {
          persist(receipts.map((r, i) => (i === index ? { ...r, status: "awaiting-approval" } : r)));
          const approveHash = await writeContractAsync({
            address: asset.address as Address,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [contract, source.requiredAssetSpend],
            chainId,
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
      }

      const args = isNative
        ? ([batchId, source.recipients, source.amounts, fresh.feeBps, fresh.configNonce, deadline] as const)
        : ([batchId, asset.address as Address, source.recipients, source.amounts, fresh.feeBps, fresh.configNonce, deadline] as const);

      // Simulate the exact call before a signature is offered.
      await publicClient.simulateContract({
        address: contract,
        abi: MULTISEND_ABI,
        functionName: isNative ? "sendNative" : "sendToken",
        args: args as never,
        account: connected,
        value: (isNative ? source.requiredAssetSpend : undefined) as never,
      });

      persist(receipts.map((r, i) => (i === index ? { ...r, status: "awaiting-signature" } : r)));
      const hash = await writeContractAsync({
        address: contract,
        abi: MULTISEND_ABI,
        functionName: isNative ? "sendNative" : "sendToken",
        args: args as never,
        chainId,
        value: (isNative ? source.requiredAssetSpend : undefined) as never,
      });
      persist(receipts.map((r, i) => (i === index ? { ...r, status: "submitted", txHash: hash } : r)));
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const ok = receipt.status === "success";
      persist(
        receipts.map((r, i) =>
          i === index ? { ...r, status: ok ? "confirmed" : "failed", txHash: hash, error: ok ? undefined : "Reverted on chain" } : r,
        ),
      );
      await loadBalances();
    } catch (e) {
      const message = e instanceof Error ? e.message : "The transaction was not submitted.";
      const cancelled = /reject|denied|cancell?ed/i.test(message);
      persist(
        receipts.map((r, i) =>
          i === index ? { ...r, status: cancelled ? "cancelled" : "failed", error: message.slice(0, 180) } : r,
        ),
      );
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  /* ----------------------------------------------------------------- UI --- */
  const fmt = (v: bigint) => formatUnits(v, asset.decimals);
  /** Native-unit formatter for gas estimates and remaining coin balances. */
  const gasFmt = (v: bigint) => Number(formatUnits(v, 18)).toFixed(6);
  const status = receipts ? sessionStatus(receipts) : "draft";
  const nextIndex = receipts ? nextSignableIndex(receipts) : null;
  const canReview =
    executable && Boolean(mode) && Boolean(config) && !config?.paused && rows.length > 0 &&
    rows.every((r) => ADDRESS_RE.test(r.source) && ADDRESS_RE.test(r.recipient) && Number(r.amountText) > 0) &&
    (mode !== "many-to-one" || ADDRESS_RE.test(destination));

  return (
    <div className="space-y-4">
      <Surface>
        <SectionHeader
          title="MultiSend"
          hint="Send, consolidate, or organize multiple wallet transfers."
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/" aria-label="Exit MultiSend">
                <ArrowLeft aria-hidden="true" />
                Exit
              </Link>
            </Button>
          }
          badge={
            executable ? (
              <StatusPill tone="ok">Live</StatusPill>
            ) : (
              <StatusPill tone="pending">Not yet live on {network?.label}</StatusPill>
            )
          }
        />
        <MultiSendModePicker value={mode} onChange={setMode} />
        {mode && <MultiSendGuide mode={mode} />}
      </Surface>

      {!executable && (
        <Surface padded className="border-warning/30 bg-warning/5">
          <p className="flex items-start gap-2 text-[12px] leading-snug text-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            The MultiSend contract for {network?.label} is not deployed and verified yet, so nothing can be signed here.
            You can build and check a plan; sending unlocks the moment the verified address is added.
          </p>
        </Surface>
      )}

      {mode && (
        <Surface>
          <SectionHeader title="Network and asset" hint="BOT Chain first, then BNB Chain." />
          <div className="space-y-3 px-4 pb-4">
            <div className="flex flex-wrap gap-1.5">
              {MULTISEND_NETWORKS.map((n) => (
                <button
                  key={n.key}
                  type="button"
                  aria-pressed={chainId === n.chainId}
                  onClick={() => setChainId(n.chainId)}
                  className={`min-h-[32px] cursor-pointer rounded-full border px-3 text-[11px] font-bold ${
                    chainId === n.chainId ? "border-primary/45 bg-primary/10 text-primary" : "border-hairline text-muted"
                  }`}
                >
                  {n.label}
                  {!n.contract && <span className="ml-1 text-[9px] uppercase">soon</span>}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={asset.kind === NATIVE}
                onClick={() => setAsset({ kind: NATIVE, address: null, symbol: nativeSymbol, decimals: 18 })}
                className={`min-h-[32px] cursor-pointer rounded-full border px-3 text-[11px] font-bold ${
                  asset.kind === NATIVE ? "border-primary/45 bg-primary/10 text-primary" : "border-hairline text-muted"
                }`}
              >
                {nativeSymbol}
              </button>
              {curated
                .filter((t) => !t.isNative)
                .map((t) => (
                  <button
                    key={t.address}
                    type="button"
                    aria-pressed={asset.address?.toLowerCase() === t.address}
                    onClick={() =>
                      setAsset({ kind: "erc20", address: t.address as Address, symbol: t.symbol, decimals: t.decimals })
                    }
                    className={`min-h-[32px] cursor-pointer rounded-full border px-3 text-[11px] font-bold ${
                      asset.address?.toLowerCase() === t.address
                        ? "border-primary/45 bg-primary/10 text-primary"
                        : "border-hairline text-muted"
                    }`}
                  >
                    {t.symbol}
                  </button>
                ))}
            </div>

            <div className="flex gap-2">
              <input
                value={customToken}
                onChange={(e) => setCustomToken(e.target.value)}
                placeholder="Add another token by address (0x…)"
                className="min-h-[36px] flex-1 rounded-lg border border-hairline bg-card px-3 font-mono text-[11px]"
              />
              <button
                type="button"
                onClick={() => void importCustomToken()}
                className="min-h-[36px] cursor-pointer rounded-lg border border-hairline px-3 text-[11px] font-bold"
              >
                Check
              </button>
            </div>
            {customError && <p className="text-[11px] text-danger">{customError}</p>}
            {asset.kind === "erc20" && (
              <p className="text-[11px] text-muted">
                Sending <span className="font-mono">{asset.symbol}</span> — exact amounts only. Tokens that take a transfer
                tax are rejected on chain instead of shorting recipients.
              </p>
            )}
          </div>
        </Surface>
      )}

      {mode === "many-to-one" && (
        <Surface>
          <SectionHeader title="Destination" hint="Every source wallet sends to this one wallet." />
          <div className="flex gap-2 px-4 pb-4">
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="0x…"
              className="min-h-[36px] flex-1 rounded-lg border border-hairline bg-card px-3 font-mono text-[11px]"
            />
            <QrScanButton
              onResult={(raw) => {
                const parsed = parseQrPayload(raw, chainId);
                if (parsed.ok) setDestination(parsed.address);
                else setError(parsed.reason);
              }}
            />
          </div>
        </Surface>
      )}

      {mode && (
        <Surface>
          <SectionHeader
            title={mode === "many-to-one" ? "Source wallets" : "Recipients"}
            hint={
              mode === "one-to-many"
                ? "recipient,amount — paste rows, upload a CSV or scan a QR code."
                : mode === "many-to-one"
                  ? "source,amount — each wallet authorizes its own transaction."
                  : "source,recipient,amount — rows are grouped by source wallet."
            }
            action={
              <button
                type="button"
                onClick={addRow}
                className="inline-flex min-h-[32px] cursor-pointer items-center gap-1 rounded-full border border-hairline px-3 text-[11px] font-bold"
              >
                <Plus className="h-3.5 w-3.5" /> Row
              </button>
            }
          />

          <div className="space-y-2 px-4 pb-4">
            {rows.map((row, i) => {
              const bal = balances[row.source.toLowerCase()];
              return (
                <div key={row.id} className="rounded-xl border border-hairline p-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 shrink-0 font-mono text-[10px] text-muted">{i + 1}</span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      {mode !== "one-to-many" && (
                        <div className="flex gap-1.5">
                          <input
                            value={row.source}
                            onChange={(e) => updateRow(row.id, { source: e.target.value })}
                            placeholder="Source wallet 0x…"
                            className="min-h-[32px] min-w-0 flex-1 rounded-lg border border-hairline bg-card px-2 font-mono text-[11px]"
                          />
                          <QrScanButton
                            onResult={(raw) => {
                              const parsed = parseQrPayload(raw, chainId);
                              if (parsed.ok) updateRow(row.id, { source: parsed.address });
                              else setError(parsed.reason);
                            }}
                          />
                        </div>
                      )}
                      {mode !== "many-to-one" && (
                        <div className="flex gap-1.5">
                          <input
                            value={row.recipient}
                            onChange={(e) => updateRow(row.id, { recipient: e.target.value })}
                            placeholder="Recipient 0x…"
                            className="min-h-[32px] min-w-0 flex-1 rounded-lg border border-hairline bg-card px-2 font-mono text-[11px]"
                          />
                          <QrScanButton
                            onResult={(raw) => {
                              const parsed = parseQrPayload(raw, chainId);
                              if (!parsed.ok) return setError(parsed.reason);
                              updateRow(row.id, {
                                recipient: parsed.address,
                                ...(parsed.amountText ? { amountText: parsed.amountText } : {}),
                              });
                            }}
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <input
                          value={row.amountText}
                          onChange={(e) => updateRow(row.id, { amountText: e.target.value })}
                          placeholder={`Amount in ${asset.symbol}`}
                          inputMode="decimal"
                          className="min-h-[32px] min-w-0 flex-1 rounded-lg border border-hairline bg-card px-2 font-mono text-[11px]"
                        />
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          aria-label="Remove row"
                          className="cursor-pointer rounded-lg border border-hairline p-1.5 text-muted"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {bal && (
                        <p className="font-mono text-[10px] text-muted">
                          balance {fmt(bal.asset)} {asset.symbol}
                          {asset.kind === NATIVE && ` · gas reserve kept ${formatUnits(NATIVE_GAS_RESERVE_WEI, 18)}`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {rows.length === 0 && (
              <p className="rounded-xl border border-dashed border-hairline p-3 text-[11.5px] text-muted">
                Add a row, paste from a spreadsheet, upload a CSV or scan QR codes.
              </p>
            )}

            {rows.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => applyPercent(p)}
                    className="min-h-[30px] cursor-pointer rounded-full border border-hairline px-2.5 text-[10.5px] font-bold text-muted"
                  >
                    {p === 100 ? "MAX" : `${p}%`}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const text = window.prompt(`Same amount for every row (${asset.symbol})`);
                    if (text) applySameAmount(text.trim());
                  }}
                  className="min-h-[30px] cursor-pointer rounded-full border border-hairline px-2.5 text-[10.5px] font-bold text-muted"
                >
                  Same amount
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const text = window.prompt(`Total to split equally (${asset.symbol})`);
                    if (text) applyEqualSplit(text.trim());
                  }}
                  className="min-h-[30px] cursor-pointer rounded-full border border-hairline px-2.5 text-[10.5px] font-bold text-muted"
                >
                  Equal split
                </button>
              </div>
            )}

            <div className="space-y-2 rounded-xl border border-hairline p-2">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={3}
                placeholder={
                  mode === "one-to-many"
                    ? "0xRecipient,1.5"
                    : mode === "many-to-one"
                      ? "0xSource,1.5"
                      : "0xSource,0xRecipient,1.5"
                }
                className="w-full rounded-lg border border-hairline bg-card p-2 font-mono text-[11px]"
              />
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => runImport(pasteText)}
                  className="inline-flex min-h-[30px] cursor-pointer items-center gap-1 rounded-full border border-hairline px-2.5 text-[10.5px] font-bold"
                >
                  <ClipboardPaste className="h-3.5 w-3.5" /> Preview paste
                </button>
                <label className="inline-flex min-h-[30px] cursor-pointer items-center gap-1 rounded-full border border-hairline px-2.5 text-[10.5px] font-bold">
                  <Upload className="h-3.5 w-3.5" /> CSV
                  <input
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) runImport(await file.text());
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              {preview && (
                <div className="space-y-2 rounded-lg border border-hairline bg-foreground/5 p-2">
                  <p className="font-mono text-[11px]">{importSummaryText(preview)}</p>
                  {[...preview.invalid, ...preview.unsupportedAmount].length > 0 && (
                    <ul className="space-y-0.5 text-[10.5px] text-muted">
                      {[...preview.invalid, ...preview.unsupportedAmount]
                        .sort((a, b) => a.line - b.line)
                        .slice(0, 5)
                        .map((r) => (
                          <li key={r.line}>
                            Line {r.line}: {r.reason}
                          </li>
                        ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => acceptImport(preview, false)}
                      className="min-h-[30px] cursor-pointer rounded-full border border-primary/45 bg-primary/10 px-2.5 text-[10.5px] font-bold text-primary"
                    >
                      Add {preview.valid.length} valid rows
                    </button>
                    {preview.duplicates.length > 0 && (
                      <button
                        type="button"
                        onClick={() => acceptImport(preview, true)}
                        className="min-h-[30px] cursor-pointer rounded-full border border-hairline px-2.5 text-[10.5px] font-bold text-muted"
                      >
                        Keep duplicates too
                      </button>
                    )}
                    {(preview.invalid.length > 0 || preview.unsupportedAmount.length > 0) && (
                      <button
                        type="button"
                        onClick={() => download("multisend-import-errors.csv", errorsCsv(preview))}
                        className="inline-flex min-h-[30px] cursor-pointer items-center gap-1 rounded-full border border-hairline px-2.5 text-[10.5px] font-bold text-muted"
                      >
                        <Download className="h-3.5 w-3.5" /> Download errors
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPreview(null)}
                      className="min-h-[30px] cursor-pointer rounded-full px-2.5 text-[10.5px] font-bold text-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Surface>
      )}

      {error && (
        <Surface padded className="border-danger/30 bg-danger/5">
          <p className="flex items-start gap-2 text-[12px] leading-snug text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        </Surface>
      )}

      {mode && !reviewed && (
        <button
          type="button"
          disabled={!canReview || busy}
          onClick={() => void openReview()}
          className="min-h-[46px] w-full cursor-pointer rounded-xl border border-primary/45 bg-primary/12 text-[13px] font-black text-primary disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Review"}
        </button>
      )}

      {reviewed && config && (
        <Surface>
          <SectionHeader
            title="Review"
            hint={`${network?.label} · ${asset.symbol}`}
            badge={<StatusPill tone={status === "completed" ? "ok" : "info"}>{status.replace("-", " ")}</StatusPill>}
          />
          <div className="space-y-2 px-4 pb-4 font-mono text-[11.5px]">
            <p className="text-muted">
              {reviewed.plan.sourceWalletCount} source wallets · {reviewed.plan.transferRowCount} transfers ·{" "}
              {reviewed.plan.destinationWalletCount} destination wallets
            </p>
            <div className="flex justify-between">
              <span className="text-muted">Recipients receive</span>
              <span>
                {fmt(reviewed.plan.recipientsTotal)} {asset.symbol}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">FlowBridge fee ({(config.feeBps / 100).toFixed(2)}%)</span>
              <span>
                {fmt(reviewed.plan.serviceFeeTotal)} {asset.symbol}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Estimated network gas (all wallets)</span>
              <span>
                ≈ {gasFmt(Object.values(reviewed.gasCost).reduce((a, b) => a + b, 0n))} {nativeSymbol}
              </span>
            </div>
            <div className="flex justify-between font-black">
              <span>Total asset spend</span>
              <span>
                {fmt(reviewed.plan.recipientsTotal + reviewed.plan.serviceFeeTotal)} {asset.symbol}
              </span>
            </div>
            <p className="text-[10.5px] text-muted">
              The FlowBridge fee and the network gas are always shown separately and never combined.
            </p>

            {/* Per source wallet: total required now, estimated gas, and what stays behind. */}
            <div className="space-y-1.5 pt-2">
              {reviewed.plan.sources.map((s) => {
                const key = s.source.toLowerCase();
                const bal = balances[key] ?? { asset: 0n, native: 0n };
                const gas = reviewed.gasCost[key] ?? 0n;
                const nativeOut = asset.kind === NATIVE ? s.requiredAssetSpend + gas : gas;
                const assetLeft = bal.asset > s.requiredAssetSpend ? bal.asset - s.requiredAssetSpend : 0n;
                const nativeLeft = bal.native > nativeOut ? bal.native - nativeOut : 0n;
                return (
                  <div key={s.source} className="rounded-lg border border-hairline p-2 text-[10.5px]">
                    <p className="font-bold">
                      {shortAddress(s.source)} · {s.recipients.length} recipients
                    </p>
                    <div className="mt-1 flex justify-between">
                      <span className="text-muted">Total required</span>
                      <span>
                        {fmt(s.requiredAssetSpend)} {asset.symbol} ({fmt(s.recipientsTotal)} + {fmt(s.serviceFee)} fee)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Estimated gas</span>
                      <span>
                        ≈ {gasFmt(gas)} {nativeSymbol}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Balance after</span>
                      <span>
                        {asset.kind === NATIVE
                          ? `${gasFmt(nativeLeft)} ${nativeSymbol}`
                          : `${fmt(assetLeft)} ${asset.symbol} · ${gasFmt(nativeLeft)} ${nativeSymbol}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {receipts && (
              <div className="space-y-1.5 pt-3">
                {receipts.map((r, i) => (
                  <div key={r.source} className="flex items-center justify-between gap-2 rounded-lg border border-hairline p-2">
                    <span className="min-w-0 truncate text-[11px] text-muted">{queueLabel(receipts, i)}</span>
                    {r.status === "confirmed" ? (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-success">
                        <Check className="h-3.5 w-3.5" /> done
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || !executable || !isRetryable(r) || i !== nextIndex}
                        onClick={() => void signSource(i)}
                        className="min-h-[30px] shrink-0 cursor-pointer rounded-full border border-primary/45 bg-primary/10 px-2.5 text-[10.5px] font-bold text-primary disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {r.status === "failed" || r.status === "cancelled" ? "Retry" : "Sign"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setReviewed(null);
                  setReceipts(null);
                }}
                className="min-h-[32px] cursor-pointer rounded-full border border-hairline px-3 text-[10.5px] font-bold text-muted"
              >
                Edit plan
              </button>
              {batchId && (
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(batchId)}
                  className="min-h-[32px] cursor-pointer rounded-full border border-hairline px-3 text-[10.5px] font-bold text-muted"
                >
                  Copy batch id
                </button>
              )}
              {receipts?.some((r) => r.status === "confirmed") && (
                <button
                  type="button"
                  onClick={() =>
                    download(
                      "multisend-receipt.csv",
                      receiptCsv({
                        clientBatchId: batchId ?? "",
                        tokenSymbol: asset.symbol,
                        rows: reviewed.plan.sources.flatMap((s, i) =>
                          s.recipients.map((recipient, j) => ({
                            source: s.source,
                            recipient,
                            amount: fmt(s.amounts[j]),
                            status: receipts[i]?.status ?? "draft",
                            txHash: receipts[i]?.txHash,
                          })),
                        ),
                      }),
                    )
                  }
                  className="inline-flex min-h-[32px] cursor-pointer items-center gap-1 rounded-full border border-hairline px-3 text-[10.5px] font-bold text-muted"
                >
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </button>
              )}
            </div>

            <p className="pt-2 text-[10.5px] leading-snug text-muted">
              Each wallet signs its own transaction. Confirmed transfers are kept even if a later wallet is cancelled, and
              only failed or unsigned wallets can be retried.
            </p>
          </div>
        </Surface>
      )}

      {unavailable && executable && (
        <p className="px-1 text-[11px] text-muted">{unavailable}</p>
      )}
    </div>
  );
}
