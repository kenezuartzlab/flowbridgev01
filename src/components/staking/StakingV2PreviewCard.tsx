import { useMemo, useState } from "react";
import { Info, Lock, ShieldCheck } from "lucide-react";

import { SectionHeader, StatusPill, Surface } from "@/components/ui-kit/primitives";
import {
  STAKING_V2_CONSTANTS,
  STAKING_V2_DYNAMIC_RATE_STATUS,
  STAKING_V2_PRODUCTS,
  genesisWindowSeconds,
  resolveStakingV2Availability,
  simpleAccrual,
  type StakingV2Availability,
  type StakingV2Product,
} from "@/lib/staking/stakingV2Matrix";

/**
 * FlowBridge V30.1C §5 — Staking v2 five-option Preview.
 *
 * Descriptive only: nothing here signs, prepares, submits or executes. Every
 * figure is computed from the canonical contract product matrix (parity-tested
 * against FlowStakingController.sol) and clearly labelled Preview / estimate.
 * APR is always labelled APR — v2 has no automatic compounding, so APY is
 * never shown. The dynamic standard rate is fail-closed until a production
 * reference oracle exists, and the UI says so instead of inventing a figure.
 */

const fmt = (n: number, maxFrac = 2): string =>
  n.toLocaleString("en-US", { maximumFractionDigits: maxFrac });

const pct = (bps: number): string => `${fmt(bps / 100, 1)}%`;

const AVAILABILITY_COPY: Record<StakingV2Availability, { label: string; tone: "ok" | "warn"; note: string }> = {
  preview: {
    label: "Preview",
    tone: "warn",
    note: "Staking v2 is a production candidate, not yet deployed. Rates below come from the audited product matrix; nothing here can stake.",
  },
  "unavailable-oracle": {
    label: "Dynamic rate unavailable",
    tone: "warn",
    note: "The standard dynamic rate cannot be published without a healthy reference oracle. Locked-floor products keep their fixed floor; everything else is unavailable, not guessed.",
  },
  "unavailable-funding": {
    label: "Funding insufficient",
    tone: "warn",
    note: "The reward reserve does not currently cover new obligations. New positions are unavailable until the reserve is funded — rewards are never paid from inventory that does not exist.",
  },
  "genesis-exhausted": {
    label: "Genesis filled",
    tone: "warn",
    note: "The Year-1 Genesis allocation is fully used. Standard floor/target rates still apply.",
  },
  live: {
    label: "Live",
    tone: "ok",
    note: "Canonical contract state is available; you always confirm approval and the stake separately in your own wallet.",
  },
};

function ProductOption({
  product,
  amount,
  selected,
  onSelect,
  availability,
}: {
  product: StakingV2Product;
  amount: number;
  selected: boolean;
  onSelect: () => void;
  availability: StakingV2Availability;
}) {
  const genesisSecs = genesisWindowSeconds(product);
  const genesisDays = genesisSecs / 86_400;
  const genesisReward = simpleAccrual(amount, product.genesisAprBps, genesisSecs);
  const steadySecs =
    product.lockSeconds === 0 ? 30 * 86_400 : product.lockSeconds;
  const steadyReward = simpleAccrual(amount, product.targetBps, steadySecs);
  const lockLabel = product.lockDays == null ? "No lock — exit anytime" : `Locked ${product.lockDays} days`;
  const showGenesis = availability !== "genesis-exhausted";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-xl border p-3 text-left transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-hairline bg-card hover:border-primary/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-black">{product.label}</span>
        {product.lockDays != null && <Lock className="h-3 w-3 text-muted-soft" />}
      </div>
      <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.08em] text-muted-soft">{lockLabel}</div>

      {showGenesis && (
        <div className="mt-2 space-y-0.5">
          <div className="text-[10px] font-mono uppercase tracking-[0.08em] text-muted-soft">
            Genesis launch (first {fmt(genesisDays, 0)} days)
          </div>
          <div className="text-[14px] font-black text-primary">{pct(product.genesisAprBps)} APR</div>
          <div className="text-[11px] text-muted">
            est. {fmt(genesisReward)} FLOW over {fmt(genesisDays, 0)}d
          </div>
        </div>
      )}

      <div className="mt-2 space-y-0.5 border-t border-hairline pt-2">
        <div className="text-[10px] font-mono uppercase tracking-[0.08em] text-muted-soft">
          Steady state (target)
        </div>
        <div className="text-[14px] font-black">{pct(product.targetBps)} APR</div>
        <div className="text-[11px] text-muted">
          est. {fmt(steadyReward)} FLOW{product.lockDays == null ? " / 30d" : ` over ${product.lockDays}d`}
        </div>
        {product.floorBps > 0 && (
          <div className="text-[10px] text-muted-soft">
            Fixed floor {pct(product.floorBps)} APR · hard cap {pct(product.hardCapBps)} APR
          </div>
        )}
      </div>
    </button>
  );
}

export function StakingV2PreviewCard() {
  const [amountInput, setAmountInput] = useState("100");
  const [selectedId, setSelectedId] = useState(2);

  const amount = useMemo(() => {
    const n = Number(amountInput.trim());
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [amountInput]);

  // Contracts are not promoted yet: always Preview. The resolver is still used
  // so every availability state is exercised by tests and ready for live data.
  const availability = resolveStakingV2Availability({
    oracleConfigured: false,
    reserveFunded: false,
    genesisCapacityRemainingFlow: null,
    walletGenesisDaysRemaining: null,
    contractsPromoted: false,
  });
  const state = AVAILABILITY_COPY[availability];

  return (
    <Surface>
      <SectionHeader
        title="Staking v2 — five products"
        hint={`Production candidate ${STAKING_V2_CONSTANTS.TOTAL_YEAR1_CAP_FLOW.toLocaleString("en-US")} FLOW Year-1 ceiling`}
        badge={<StatusPill tone={state.tone}>{state.label}</StatusPill>}
      />

      <div className="border-t border-hairline p-4">
        <p className="text-[11px] leading-relaxed text-muted">{state.note}</p>

        <label className="mt-3 block">
          <span className="text-[10px] font-mono font-bold uppercase tracking-[0.1em] text-muted-soft">
            Preview amount (FLOW)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="mt-1 w-full rounded-lg border border-hairline bg-card px-3 py-2 text-[14px] font-bold outline-none focus:border-primary"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-hairline p-4 sm:grid-cols-3 lg:grid-cols-5">
        {STAKING_V2_PRODUCTS.map((p) => (
          <ProductOption
            key={p.id}
            product={p}
            amount={amount}
            selected={selectedId === p.id}
            onSelect={() => setSelectedId(p.id)}
            availability={availability}
          />
        ))}
      </div>

      <div className="space-y-2 border-t border-hairline p-4 text-[11px] leading-relaxed text-muted">
        <p className="flex gap-2">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            <strong className="text-foreground">Estimates, not promises.</strong> All figures are APR
            (no compounding) computed from the canonical product matrix — actual standard rates are
            published weekly within the floor and hard cap, and Genesis covers at most{" "}
            {STAKING_V2_CONSTANTS.GENESIS_MAX_SECONDS / 86_400} reward-days per wallet, once ever.
          </span>
        </p>
        <p className="flex gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            <strong className="text-foreground">Dynamic standard rate:</strong>{" "}
            {STAKING_V2_DYNAMIC_RATE_STATUS}.
          </span>
        </p>
        <p className="flex gap-2">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            <strong className="text-foreground">Your wallet stays in charge.</strong> When staking
            goes live you will confirm the token approval and the stake as two separate wallet
            confirmations. Nothing here signs or submits anything.
          </span>
        </p>
      </div>
    </Surface>
  );
}
