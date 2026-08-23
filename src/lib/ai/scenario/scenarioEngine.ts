/**
 * FlowBridge V23 §2/§3/§5/§6/§8/§9 — the PURE scenario engine.
 *
 * No network, no storage, no clock of its own. Given a canonical server-resolved
 * snapshot, read-only mission context and bounded user planning inputs, it emits
 * a deterministic, typed ScenarioSet.
 *
 * Hard boundaries enforced here:
 *  - every exact value is copied verbatim from the canonical snapshot;
 *  - every derived value is computed by deterministic arithmetic in this file
 *    and is tagged DERIVED_PREVIEW — never executable;
 *  - the downstream stake amount of a claim-then-stake path is always
 *    UNKNOWN_UNTIL_SETTLEMENT (V17 derives it from the verified claim);
 *  - an active mission covering the same action replaces the duplicate path;
 *  - nothing here creates a Mission, ActionIntent, signature or transaction.
 */
import type { DecisionMissionContext, DecisionPreferences } from "../decision/decisionTypes";
import type { EvidenceItem } from "../aiTypes";
import {
  EMPTY_PLANNING_INPUTS,
  SCENARIO_POLICY_VERSION,
  SCENARIO_SCHEMA_VERSION,
  type CanonicalScenarioSnapshot,
  type ScenarioFact,
  type ScenarioKind,
  type ScenarioPlanningInputs,
  type ScenarioResult,
  type ScenarioSet,
} from "./scenarioTypes";

const ACTIVE_STATUSES = new Set(["PLANNED", "ACTIVE", "PAUSED", "BLOCKED"]);

/** Deterministic, dependency-free identity hash (djb2, hex). */
export function scenarioHash(parts: readonly (string | number | boolean | null)[]): string {
  let h = 5381;
  const s = parts.map((p) => String(p)).join("|");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Snapshot identity over canonical economics only — planning inputs excluded. */
export function canonicalSnapshotId(input: {
  boundWallet: string | null;
  chainId: number | null;
  vault: string | null;
  claimableFlow: number | null;
  stakedFlow: number | null;
  earnedFlow: number | null;
  minStakeFlow: number | null;
  stakingAvailable: boolean;
  supportedOpportunityKinds: readonly string[];
}): string {
  return scenarioHash([
    input.boundWallet?.toLowerCase() ?? "none",
    input.chainId,
    input.vault?.toLowerCase() ?? "none",
    input.claimableFlow,
    input.stakedFlow,
    input.earnedFlow,
    input.minStakeFlow,
    input.stakingAvailable,
    [...input.supportedOpportunityKinds].sort().join(","),
  ]);
}

/** §5/§6 — preview only: floor to whole FLOW so no fake precision appears. */
export function previewPortionFlow(claimable: number, percent: number): number {
  if (!Number.isFinite(claimable) || claimable <= 0) return 0;
  return Math.floor((claimable * percent) / 100);
}

const exact = (label: string, value: string, unit: string | null = "FLOW"): ScenarioFact => ({
  label,
  value,
  unit,
  valueClass: "CANONICAL_EXACT",
  source: "CANONICAL_SNAPSHOT",
});

const preview = (label: string, value: string, unit: string | null = "FLOW"): ScenarioFact => ({
  label,
  value,
  unit,
  valueClass: "DERIVED_PREVIEW",
  source: "DETERMINISTIC_PREVIEW",
});

const notAvailable = (label: string): ScenarioFact => ({
  label,
  value: "not available",
  unit: null,
  valueClass: "UNKNOWN_UNTIL_SETTLEMENT",
  source: "NOT_AVAILABLE",
});

export interface ScenarioEngineInput {
  requestId: string;
  actorScopes: readonly string[];
  snapshot: CanonicalScenarioSnapshot;
  missions: readonly DecisionMissionContext[];
  planning?: ScenarioPlanningInputs;
  preferences?: DecisionPreferences;
  /** Snapshot id the open comparison was generated from, for §11 staleness. */
  previousSnapshotId?: string | null;
  now?: Date;
}

export function runScenarioEngine(input: ScenarioEngineInput): ScenarioSet {
  const now = input.now ?? new Date();
  const snap = input.snapshot;
  const planning = input.planning ?? EMPTY_PLANNING_INPUTS;
  const activeMissions = input.missions.filter((m) => ACTIVE_STATUSES.has(m.status));

  const claimSupported =
    snap.supportedOpportunityKinds.includes("REWARDS:CLAIM_FLOW") &&
    typeof snap.claimableFlow === "number" &&
    snap.claimableFlow > 0;
  const stakeSupported =
    snap.supportedOpportunityKinds.includes("STAKING:START_STAKING") && snap.stakingAvailable;

  const missionCovers = (domain: "REWARDS" | "STAKING") =>
    activeMissions.find((m) => m.domains.includes(domain)) ?? null;

  const scenarios: ScenarioResult[] = [];
  const suppressed: ScenarioKind[] = [];
  const evidence: readonly EvidenceItem[] = snap.evidenceRefs;
  const sid = (kind: ScenarioKind) => `${kind.toLowerCase()}:${snap.snapshotId}`;

  /* ---------------------------------------------- §9 continue active mission */
  const rewardsMission = missionCovers("REWARDS");
  const stakingMission = missionCovers("STAKING");
  const coveringMission = rewardsMission ?? stakingMission;

  if (coveringMission) {
    scenarios.push({
      scenarioId: `continue_mission:${coveringMission.id}`,
      scenarioKind: "CONTINUE_MISSION",
      label: "Continue your mission",
      order: 0,
      whatChanges: coveringMission.goalText,
      liquidityNote:
        "Nothing moves until you confirm the next step in your own wallet, so your balance is unchanged right now.",
      canonicalSnapshotId: snap.snapshotId,
      freshness: snap.freshness,
      prerequisites:
        coveringMission.status === "BLOCKED"
          ? [coveringMission.blockingReason ?? "A prerequisite is not satisfied yet."]
          : [],
      exactFacts: [
        {
          label: "missionStatus",
          value: coveringMission.status,
          unit: null,
          valueClass: "CANONICAL_EXACT",
          source: "MISSION_STATE",
        },
        {
          label: "progress",
          value: String(coveringMission.percent),
          unit: "%",
          valueClass: "CANONICAL_EXACT",
          source: "MISSION_STATE",
        },
      ],
      estimatedFacts: [],
      assumptions: [
        "This mission already covers the same economic action, so FlowBridge does not simulate a duplicate path.",
      ],
      userPlanningInputs: planning,
      unresolvedExecutionValues: [
        "Every amount for the remaining steps is re-resolved by FlowBridge before each step.",
      ],
      expectedWalletConfirmations:
        coveringMission.currentStepRequiresWallet || coveringMission.hasPendingWalletStep ? 1 : 0,
      expectedWalletConfirmationLabels:
        coveringMission.currentStepRequiresWallet || coveringMission.hasPendingWalletStep
          ? [coveringMission.currentStepTitle ?? "Next mission step"]
          : [],
      expectedStateChanges: [
        coveringMission.currentStepTitle
          ? `Advances your mission to: ${coveringMission.currentStepTitle}`
          : "Advances your existing mission plan",
      ],
      blockers:
        coveringMission.status === "BLOCKED"
          ? [coveringMission.blockingReason ?? "Mission is blocked."]
          : [],
      candidateMissionTemplate: null,
      missionId: coveringMission.id,
      supported: true,
      explanationOnly: false,
      evidenceRefs: [],
    });
  }

  /* --------------------------------------------------------- §3 CLAIM_ONLY */
  if (claimSupported && !rewardsMission) {
    const x = snap.claimableFlow as number;
    scenarios.push({
      scenarioId: sid("CLAIM_ONLY"),
      scenarioKind: "CLAIM_ONLY",
      label: "Claim only",
      order: 20,
      whatChanges: `Moves your canonically claimable FLOW into your own wallet and leaves it liquid.`,
      liquidityNote: "All claimed FLOW stays liquid in your wallet — nothing is locked.",
      canonicalSnapshotId: snap.snapshotId,
      freshness: snap.freshness,
      prerequisites: snap.boundWallet
        ? []
        : ["Bind and verify a wallet before a claim can be prepared."],
      exactFacts: [
        exact("claimableFlowNow", String(x)),
        notAvailable("guaranteedReturn"),
      ],
      estimatedFacts: [],
      assumptions: [
        "Claimable FLOW is read from your server ledger at snapshot time and is re-resolved again at preparation time.",
      ],
      userPlanningInputs: planning,
      unresolvedExecutionValues: [
        "The exact claimed amount is only final once the claim is canonically settled.",
        "Network gas cost is resolved by your wallet at signing time.",
      ],
      expectedWalletConfirmations: 1,
      expectedWalletConfirmationLabels: ["Claim FLOW"],
      expectedStateChanges: ["Claimable FLOW → liquid wallet FLOW"],
      blockers: snap.boundWallet ? [] : ["No verified bound wallet."],
      candidateMissionTemplate: {
        templateId: stakeSupported ? "CLAIM_THEN_STAKE" : "CLAIM_FLOW",
        opportunityKind: "REWARDS:CLAIM_FLOW",
        authorized: false,
      },
      missionId: null,
      supported: true,
      explanationOnly: false,
      evidenceRefs: evidence,
    });
  } else if (claimSupported && rewardsMission) {
    suppressed.push("CLAIM_ONLY");
  }

  /* ------------------------------------------- §6 CLAIM_THEN_STAKE_PERCENT */
  if (claimSupported && stakeSupported && !rewardsMission && !stakingMission) {
    const x = snap.claimableFlow as number;
    const percent = planning.stakePercent ?? 100;
    const portion = previewPortionFlow(x, percent);
    const liquid = Math.max(0, x - portion);
    const belowMin =
      typeof snap.minStakeFlow === "number" && snap.minStakeFlow > 0 && portion < snap.minStakeFlow;
    scenarios.push({
      scenarioId: sid("CLAIM_THEN_STAKE_PERCENT"),
      scenarioKind: "CLAIM_THEN_STAKE_PERCENT",
      label: `Claim, then stake ${percent}%`,
      order: 10,
      whatChanges: `Claims your FLOW, then stakes a portion of the FLOW you actually receive.`,
      liquidityNote:
        percent >= 100
          ? "Nothing stays liquid in this preview — principal remains withdrawable from the vault at any time."
          : `About ${liquid} FLOW would stay liquid in this current-snapshot preview.`,
      canonicalSnapshotId: snap.snapshotId,
      freshness: snap.freshness,
      prerequisites: [
        "The claim must settle canonically before any stake amount exists.",
        ...(snap.boundWallet ? [] : ["Bind and verify a wallet first."]),
      ],
      exactFacts: [
        exact("claimableFlowNow", String(x)),
        ...(typeof snap.minStakeFlow === "number"
          ? [exact("vaultMinStakeFlow", String(snap.minStakeFlow))]
          : []),
        notAvailable("guaranteedApy"),
      ],
      estimatedFacts: [
        preview(`previewStakePortion (${percent}% of current claimable)`, String(portion)),
        preview("previewLiquidRemaining", String(liquid)),
      ],
      assumptions: [
        "The percentage is applied to the CURRENT snapshot only; it is an illustration, not an executable amount.",
        "Vault reward rate is a live testnet estimate, never a guaranteed APY.",
      ],
      userPlanningInputs: planning,
      unresolvedExecutionValues: [
        "Executable stake amount — derived only from the FLOW actually verified after claim settlement.",
        "Claim settlement amount, block timing and gas cost.",
      ],
      expectedWalletConfirmations: 2,
      expectedWalletConfirmationLabels: ["Claim FLOW", "Stake FLOW"],
      expectedStateChanges: [
        "Claimable FLOW → liquid wallet FLOW",
        "Part of the verified claimed FLOW → staked position (amount resolved after settlement)",
      ],
      blockers: [
        ...(snap.boundWallet ? [] : ["No verified bound wallet."]),
        ...(belowMin
          ? [
              `This preview portion (${portion} FLOW) is below the vault minimum of ${snap.minStakeFlow} FLOW — the stake leg could not be prepared at these values.`,
            ]
          : []),
      ],
      candidateMissionTemplate: {
        templateId: "CLAIM_THEN_STAKE",
        opportunityKind: "REWARDS:CLAIM_FLOW",
        authorized: false,
      },
      missionId: null,
      supported: true,
      explanationOnly: false,
      evidenceRefs: evidence,
    });
  } else if (claimSupported && stakeSupported && (rewardsMission || stakingMission)) {
    suppressed.push("CLAIM_THEN_STAKE_PERCENT");
  }

  /* ------------------------------------------------ §7 STAKE_EXISTING_FLOW */
  if (
    stakeSupported &&
    !stakingMission &&
    typeof planning.previewStakeFlow === "number" &&
    planning.previewStakeFlow > 0
  ) {
    const amount = Math.floor(planning.previewStakeFlow);
    const belowMin =
      typeof snap.minStakeFlow === "number" && snap.minStakeFlow > 0 && amount < snap.minStakeFlow;
    scenarios.push({
      scenarioId: sid("STAKE_EXISTING_FLOW"),
      scenarioKind: "STAKE_EXISTING_FLOW",
      label: "Stake FLOW you already hold",
      order: 30,
      whatChanges: "Locks FLOW you already hold into the vault position you control.",
      liquidityNote:
        "Staked principal is always withdrawable — FlowBridge never locks it beyond your own wallet actions.",
      canonicalSnapshotId: snap.snapshotId,
      freshness: snap.freshness,
      prerequisites: [
        "Your wallet must actually hold this FLOW at signing time; FlowBridge does not treat your typed amount as proof of balance.",
      ],
      exactFacts: [
        ...(typeof snap.minStakeFlow === "number"
          ? [exact("vaultMinStakeFlow", String(snap.minStakeFlow))]
          : []),
        ...(typeof snap.stakedFlow === "number"
          ? [exact("currentStakedFlow", String(snap.stakedFlow))]
          : []),
        notAvailable("walletFlowBalance"),
      ],
      estimatedFacts: [preview("previewStakeAmount (your planning input)", String(amount))],
      assumptions: [
        "The amount you typed is a planning input only. It is not authorization and is re-validated before any preparation.",
      ],
      userPlanningInputs: planning,
      unresolvedExecutionValues: [
        "Your actual wallet FLOW balance at signing time.",
        "Approval requirement, gas cost and final staked amount.",
      ],
      expectedWalletConfirmations: 2,
      expectedWalletConfirmationLabels: ["Approve FLOW (if needed)", "Stake FLOW"],
      expectedStateChanges: ["Liquid wallet FLOW → staked position"],
      blockers: belowMin
        ? [`Below the vault minimum of ${snap.minStakeFlow} FLOW.`]
        : [],
      candidateMissionTemplate: {
        templateId: "STAKE_FLOW",
        opportunityKind: "STAKING:START_STAKING",
        authorized: false,
      },
      missionId: null,
      supported: true,
      explanationOnly: false,
      evidenceRefs: evidence,
    });
  } else if (stakeSupported && stakingMission && planning.previewStakeFlow) {
    suppressed.push("STAKE_EXISTING_FLOW");
  }

  /* --------------------------------------------------------- §3 NO_ACTION */
  scenarios.push({
    scenarioId: sid("NO_ACTION"),
    scenarioKind: "NO_ACTION",
    label: "Do nothing / keep liquid",
    order: 40,
    whatChanges: "Nothing changes. No wallet confirmation, no gas, no lock-up.",
    liquidityNote:
      typeof snap.claimableFlow === "number" && snap.claimableFlow > 0
        ? `Your ${snap.claimableFlow} FLOW stays claimable and unclaimed; your wallet balance is unchanged.`
        : "Your balances stay exactly as they are.",
    canonicalSnapshotId: snap.snapshotId,
    freshness: snap.freshness,
    prerequisites: [],
    exactFacts: [
      ...(typeof snap.claimableFlow === "number"
        ? [exact("claimableFlowNow", String(snap.claimableFlow))]
        : []),
      ...(typeof snap.stakedFlow === "number"
        ? [exact("currentStakedFlow", String(snap.stakedFlow))]
        : []),
    ],
    estimatedFacts: [],
    assumptions: ["Unclaimed FLOW is not lost by waiting; canonical entitlement is unchanged."],
    userPlanningInputs: planning,
    unresolvedExecutionValues: [],
    expectedWalletConfirmations: 0,
    expectedWalletConfirmationLabels: [],
    expectedStateChanges: ["No state change"],
    blockers: [],
    candidateMissionTemplate: null,
    missionId: null,
    supported: true,
    explanationOnly: true,
    evidenceRefs: evidence,
  });

  const ordered = [...scenarios].sort(
    (a, b) => a.order - b.order || a.scenarioId.localeCompare(b.scenarioId),
  );

  /* ------------------------------------------------------ §8 recommendation */
  let recommendedScenarioId: string | null = null;
  let recommendationReason: string | null = null;
  const mission = ordered.find((s) => s.scenarioKind === "CONTINUE_MISSION");
  const firstActionable = ordered.find(
    (s) => !s.explanationOnly && s.blockers.length === 0 && s.scenarioKind !== "CONTINUE_MISSION",
  );
  if (mission) {
    recommendedScenarioId = mission.scenarioId;
    recommendationReason =
      "You already have an active mission covering this action, so continuing it avoids duplicate wallet confirmations.";
  } else if (firstActionable) {
    recommendedScenarioId = firstActionable.scenarioId;
    recommendationReason =
      firstActionable.scenarioKind === "CLAIM_THEN_STAKE_PERCENT"
        ? "It compounds the FLOW you have already earned, and the staked principal stays withdrawable. It costs one extra wallet confirmation."
        : firstActionable.scenarioKind === "CLAIM_ONLY"
          ? "It is the smallest safe step: one confirmation, and everything stays liquid afterwards."
          : "It is the only currently supported path with no blockers.";
  }

  const comparable = ordered.filter((s) => !s.explanationOnly).length;
  const status: ScenarioSet["status"] =
    comparable === 0
      ? "NOTHING_TO_COMPARE"
      : snap.degradedDomains.length > 0 || snap.provenance === "DEGRADED"
        ? "DEGRADED"
        : "OK";

  const stale =
    !!input.previousSnapshotId && input.previousSnapshotId !== snap.snapshotId;

  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    policyVersion: SCENARIO_POLICY_VERSION,
    requestId: input.requestId,
    actorScopes: input.actorScopes,
    generatedAt: now.toISOString(),
    snapshot: snap,
    scenarios: ordered,
    planningInputs: planning,
    recommendedScenarioId,
    recommendationReason,
    activeMissionIds: activeMissions.map((m) => m.id),
    suppressedScenarioKinds: suppressed,
    stale,
    staleReason: stale
      ? "Canonical inputs changed since this comparison was generated. Refresh before building anything."
      : null,
    status,
    notice:
      status === "NOTHING_TO_COMPARE"
        ? "There is no canonical action to compare right now, so FlowBridge is not inventing one."
        : status === "DEGRADED"
          ? "Some canonical sources are unavailable, so those paths are omitted rather than estimated."
          : null,
    memoryUsed: !!input.preferences?.optedIn && planning.preSelectedFromMemory,
    executed: false,
    createdMissions: 0,
    createdActionIntents: 0,
  };
}
