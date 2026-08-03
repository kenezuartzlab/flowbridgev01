import { useEffect, useMemo, useState } from "react";
import { createPublicClient, http, isAddress, parseUnits, type Address } from "viem";
import { useAccount, useChainId, useSwitchChain, useWalletClient } from "wagmi";
import { ArrowUpRight, Loader2, X, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { botMainnet } from "@/lib/wagmi";
import { ERC20_ABI } from "@/lib/contracts";
import { NATIVE_TOKEN_ADDRESS } from "@/lib/swap/tokenRegistry";
import { formatBalance4, formatUsd } from "@/lib/format";
import { TokenIcon } from "@/components/TokenIcon";
import type { HoldingRow } from "@/lib/wallet/portfolio";
import { friendlyError } from "@/lib/friendlyError";

/** Keep a little native BOT behind for gas when sending the native asset. */
const GAS_RESERVE_WEI = 2_000_000_000_000_000n; // 0.002 BOT

type Phase = "idle" | "signing" | "pending" | "done" | "error";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  rows: HoldingRow[];
  onSent: () => void;
}

export function SendModal({ isOpen, onClose, rows, onSent }: Props) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

  const held = useMemo(() => rows.filter((r) => r.amount > 0 && !r.balanceFailed), [rows]);
  const [tokenAddr, setTokenAddr] = useState<string>("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [hash, setHash] = useState<string>("");
  const [error, setError] = useState<string>("");

  const selected = held.find((r) => r.token.address === tokenAddr) ?? held[0];

  useEffect(() => {
    if (isOpen && held.length && !held.some((r) => r.token.address === tokenAddr)) {
      setTokenAddr(held[0].token.address);
    }
  }, [isOpen, held, tokenAddr]);

  useEffect(() => {
    if (!isOpen) {
      setPhase("idle");
      setHash("");
      setError("");
      setAmount("");
      setTo("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isNative = !!selected && (selected.token.isNative || selected.token.address === NATIVE_TOKEN_ADDRESS);
  const maxRaw = selected
    ? isNative
      ? selected.raw > GAS_RESERVE_WEI
        ? selected.raw - GAS_RESERVE_WEI
        : 0n
      : selected.raw
    : 0n;
  const maxAmount = selected ? Number(maxRaw) / 10 ** selected.token.decimals : 0;

  let amountRaw: bigint | null = null;
  try {
    amountRaw = selected && amount ? parseUnits(amount, selected.token.decimals) : null;
  } catch {
    amountRaw = null;
  }

  const toValid = isAddress(to.trim());
  const overBalance = !!amountRaw && amountRaw > maxRaw;
  const busy = phase === "signing" || phase === "pending";
  const canSend =
    !!selected && !!walletClient && toValid && !!amountRaw && amountRaw > 0n && !overBalance && !busy;

  const validationHint = !selected
    ? "No tokens available to send."
    : !to
      ? "Enter the recipient's BOT Chain address."
      : !toValid
        ? "That doesn't look like a valid address."
        : !amount
          ? "Enter an amount to send."
          : amountRaw == null
            ? "Amount is not a valid number."
            : amountRaw <= 0n
              ? "Amount must be greater than zero."
              : overBalance
                ? isNative
                  ? "Amount exceeds your balance minus the 0.002 BOT gas reserve."
                  : "Amount exceeds your available balance."
                : "";

  const send = async () => {
    if (!selected || !amountRaw || !walletClient || !address) return;
    setError("");
    setHash("");
    setPhase("signing");
    try {
      if (chainId !== botMainnet.id) {
        await switchChainAsync({ chainId: botMainnet.id });
      }
      const txHash = isNative
        ? await walletClient.sendTransaction({
            to: to.trim() as Address,
            value: amountRaw,
          })
        : await walletClient.writeContract({
            address: selected.token.address as Address,
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [to.trim() as Address, amountRaw],
          });
      setHash(txHash);
      setPhase("pending");
      const pub = createPublicClient({ chain: botMainnet, transport: http() });
      const receipt = await pub.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
      if (receipt.status === "success") {
        setPhase("done");
        onSent();
      } else {
        setPhase("error");
        setError("The transaction was reverted on-chain. No tokens were sent.");
      }
    } catch (e) {
      setPhase("error");
      setError(friendlyError(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-3 backdrop-blur-md sm:items-center">
      <div className="fb-surface w-full max-w-[420px] max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-4">
        <div className="flex items-center justify-between gap-3 border-b border-hairline pb-3">
          <p className="fb-eyebrow">Send on BOT Chain</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close send dialog"
            className="grid h-8 w-8 place-items-center rounded-xl text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {phase === "done" ? (
          <div className="space-y-3 py-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
            <p className="font-mono text-[13px] font-black uppercase tracking-[0.1em]">Sent</p>
            <p className="font-mono text-[11px] leading-relaxed text-muted">
              {amount} {selected?.token.symbol} was delivered to {to.slice(0, 6)}…{to.slice(-4)}.
            </p>
            {hash && (
              <a
                href={`https://scan.botchain.ai/tx/${hash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[10.5px] font-black uppercase tracking-[0.08em] text-primary"
              >
                View on explorer <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="fb-glow mt-2 inline-flex min-h-[42px] w-full items-center justify-center rounded-xl bg-primary px-4 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-primary-foreground"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3 pt-3">
            {held.length === 0 ? (
              <p className="font-mono text-[11px] leading-relaxed text-muted">
                No spendable balances found on BOT Chain for this wallet.
              </p>
            ) : (
              <>
                <label className="block">
                  <span className="fb-eyebrow">Token</span>
                  <div className="fb-inset mt-1 flex items-center gap-2 px-3 py-2">
                    {selected && <TokenIcon symbol={selected.token.symbol} className="h-6 w-6 shrink-0" />}
                    <select
                      value={selected?.token.address ?? ""}
                      onChange={(e) => setTokenAddr(e.target.value)}
                      className="min-h-[32px] w-full bg-transparent font-mono text-[12px] font-black uppercase tracking-[0.06em] outline-none"
                    >
                      {held.map((r) => (
                        <option key={r.token.address} value={r.token.address} className="bg-card text-foreground">
                          {r.token.symbol} — {formatBalance4(r.amount)}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                <label className="block">
                  <span className="fb-eyebrow">Recipient address</span>
                  <input
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="0x…"
                    spellCheck={false}
                    className="fb-inset mt-1 min-h-[42px] w-full px-3 font-mono text-[12px] outline-none"
                  />
                </label>

                <label className="block">
                  <span className="fb-eyebrow">Amount</span>
                  <div className="fb-inset mt-1 flex items-center gap-2 px-3">
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                      inputMode="decimal"
                      placeholder="0.0"
                      className="min-h-[42px] w-full bg-transparent font-mono text-[14px] font-black tabular-nums outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setAmount(maxAmount > 0 ? String(maxAmount) : "0")}
                      className="shrink-0 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary"
                    >
                      Max
                    </button>
                  </div>
                  <span className="mt-1 block font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
                    Available {formatBalance4(maxAmount)} {selected?.token.symbol}
                    {selected && selected.priceUsd > 0 && amountRaw
                      ? ` · ≈ ${formatUsd((Number(amountRaw) / 10 ** selected.token.decimals) * selected.priceUsd)}`
                      : ""}
                    {isNative ? " · 0.002 BOT kept for gas" : ""}
                  </span>
                </label>

                {(validationHint || error) && (
                  <p
                    className={`flex items-start gap-1.5 font-mono text-[10.5px] leading-relaxed ${
                      error ? "text-destructive" : "text-muted"
                    }`}
                  >
                    {error && <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />}
                    {error || validationHint}
                  </p>
                )}

                {phase === "pending" && (
                  <p className="font-mono text-[10.5px] leading-relaxed text-muted">
                    Waiting for on-chain confirmation…
                    {hash ? ` Tx ${hash.slice(0, 8)}…` : ""}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={!canSend}
                  className="fb-glow inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-primary-foreground disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                  {phase === "signing" ? "Confirm in wallet" : phase === "pending" ? "Confirming" : "Send"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
