import { useEffect, useMemo, useState } from "react";
import { createPublicClient, http, isAddress, parseAbi, parseUnits, type Address } from "viem";
import { useAccount, useChainId, useSwitchChain, useWalletClient } from "wagmi";
import {
  ArrowUpRight,
  Loader2,
  X,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { botMainnet } from "@/lib/wagmi";
import { NATIVE_TOKEN_ADDRESS } from "@/lib/swap/tokenRegistry";
import { formatBalance4, formatUsd } from "@/lib/format";
import { TokenIcon } from "@/components/TokenIcon";
import type { HoldingRow } from "@/lib/wallet/portfolio";
import { toFriendlyError } from "@/lib/friendlyError";
import { QrScanButton } from "@/components/wallet/QrScanButton";

const ERC20_TRANSFER_ABI = parseAbi([
  "function transfer(address to, uint256 value) returns (bool)",
]);

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
  const [pickerOpen, setPickerOpen] = useState(false);
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
      setPickerOpen(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isNative =
    !!selected && (selected.token.isNative || selected.token.address === NATIVE_TOKEN_ADDRESS);
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

  const usdPreview =
    selected && selected.priceUsd > 0 && amountRaw
      ? (Number(amountRaw) / 10 ** selected.token.decimals) * selected.priceUsd
      : 0;

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
            abi: ERC20_TRANSFER_ABI,
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
      setError(toFriendlyError(e));
    }
  };

  const ctaLabel =
    phase === "signing"
      ? "Confirm in wallet"
      : phase === "pending"
        ? "Confirming"
        : canSend
          ? "Send"
          : "Enter details";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-3 backdrop-blur-md sm:items-center">
      <div className="fb-surface relative w-full max-w-[420px] max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-black tracking-tight">Send</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close send dialog"
            className="fb-inset grid h-9 w-9 place-items-center rounded-full text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {phase === "done" ? (
          <div className="space-y-3 py-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
            <p className="text-[15px] font-black tracking-tight">Sent</p>
            <p className="text-[13px] leading-relaxed text-muted">
              {amount} {selected?.token.symbol} was delivered to {to.slice(0, 6)}…{to.slice(-4)}.
            </p>
            {hash && (
              <a
                href={`https://scan.botchain.ai/tx/${hash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[12px] font-black text-primary"
              >
                View on explorer <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="fb-glow mt-2 inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-primary px-4 text-[13px] font-black text-primary-foreground"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4 pt-4">
            {held.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-muted">
                No spendable balances found on BOT Chain for this wallet.
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <p className="fb-eyebrow">Asset</p>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="fb-inset flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-3 text-left"
                  >
                    {selected && <TokenIcon symbol={selected.token.symbol} preset="md" />}
                    <span className="text-[15px] font-black">${selected?.token.symbol}</span>
                    <ChevronDown className="h-4 w-4 text-muted" />
                  </button>
                  <p className="text-[12px] font-semibold text-muted">
                    Balance: {formatBalance4(selected?.amount ?? 0)} ${selected?.token.symbol}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="fb-eyebrow">Amount</p>
                    <button
                      type="button"
                      onClick={() => setAmount(maxAmount > 0 ? String(maxAmount) : "0")}
                      className="rounded-full bg-primary/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-primary"
                    >
                      Max
                    </button>
                  </div>
                  <div className="fb-inset flex min-h-[56px] items-center gap-2 rounded-2xl px-3">
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                      inputMode="decimal"
                      placeholder="0.000000"
                      aria-label="Amount to send"
                      className="min-h-[52px] w-full bg-transparent text-[22px] font-black tabular-nums tracking-tight outline-none placeholder:text-muted/50"
                    />
                    <span className="shrink-0 text-[13px] font-black text-muted">
                      ${selected?.token.symbol}
                    </span>
                  </div>
                  <p className="text-[12px] font-semibold text-muted">
                    ≈ {formatUsd(usdPreview)}
                    {isNative ? " · 0.002 BOT kept for gas" : ""}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="fb-eyebrow">Recipient address</p>
                  <div className="flex items-center gap-2">
                    <input
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      placeholder="0x… or scan a QR code"
                      spellCheck={false}
                      aria-label="Recipient address"
                      className="fb-inset min-h-[56px] w-full min-w-0 flex-1 rounded-2xl px-3 font-mono text-[13px] outline-none"
                    />
                    <QrScanButton onResult={(addr) => setTo(addr)} />
                  </div>
                </div>

                {(validationHint || error) && (
                  <p
                    className={`flex items-start gap-1.5 text-[12px] font-semibold leading-relaxed ${
                      error ? "text-destructive" : "text-muted"
                    }`}
                  >
                    {error && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                    {error || validationHint}
                  </p>
                )}

                {phase === "pending" && (
                  <p className="text-[12px] font-semibold leading-relaxed text-muted">
                    Waiting for on-chain confirmation…{hash ? ` Tx ${hash.slice(0, 8)}…` : ""}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={!canSend}
                  className="fb-glow inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-[13px] font-black text-primary-foreground disabled:opacity-40"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : canSend ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : null}
                  {ctaLabel}
                </button>
              </>
            )}
          </div>
        )}

        {pickerOpen && (
          <div className="absolute inset-0 z-10 flex items-end rounded-[inherit] bg-background/70 backdrop-blur-sm">
            <div className="fb-surface max-h-full w-full overflow-y-auto rounded-t-3xl p-4">
              <div className="flex items-center justify-between gap-3 pb-2">
                <p className="text-[15px] font-black tracking-tight">Send Token</p>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  aria-label="Close token picker"
                  className="fb-inset grid h-9 w-9 place-items-center rounded-full text-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ul className="divide-y divide-hairline">
                {held.map((r) => (
                  <li key={r.token.address}>
                    <button
                      type="button"
                      onClick={() => {
                        setTokenAddr(r.token.address);
                        setPickerOpen(false);
                      }}
                      className="flex w-full items-center gap-3 py-3 text-left"
                    >
                      <TokenIcon symbol={r.token.symbol} preset="lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-black">${r.token.symbol}</span>
                        <span className="block truncate text-[12px] font-semibold text-muted">
                          {r.token.name ?? r.token.symbol}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[14px] font-black tabular-nums">
                          {formatBalance4(r.amount)}
                        </span>
                        <span className="block text-[12px] font-semibold text-muted tabular-nums">
                          {formatUsd(r.amount * r.priceUsd)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
