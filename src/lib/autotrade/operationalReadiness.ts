/** Display facts only; checklist completion never authorizes an effect. */
export function operationalReadiness(facts: { rpcConfigured: boolean; signerConfigured: boolean; intents: number | null; heartbeatAt: string | null; now: number }) {
  return {
    live: false, public: false, registryWrites: false, capUsdt: 5, capStatus: "APPROVED_CAP_ONLY",
    items: [
      { key: "store", label: "Separate Mainnet durable store connected", status: "READY_DISABLED" },
      { key: "rpc", label: "Independent BOT RPC and seven-day evidence", status: facts.rpcConfigured ? "CONFIGURED_REVIEW_REQUIRED" : "NOT_CONFIGURED" },
      { key: "signer", label: "Non-exportable signer and dedicated account", status: facts.signerConfigured ? "CONFIGURED_REVIEW_REQUIRED" : "NOT_CONFIGURED" },
      { key: "acceptance", label: "Bound-wallet operator acceptance", status: "OWNER_WALKTHROUGH_REQUIRED" },
      { key: "security", label: "Independent security and release review", status: "PENDING" },
      { key: "parameters", label: "Exact buy/sell targets and separate gas cap", status: "NOT_APPROVED" },
      { key: "intents", label: "Exact authorized Mainnet effects", status: facts.intents === null ? "READ_UNAVAILABLE" : facts.intents === 0 ? "NONE" : "SOURCE_DISABLED" },
      { key: "scheduler", label: "Published worker and scheduled heartbeat", status: facts.heartbeatAt && facts.now - Date.parse(facts.heartbeatAt) <= 120_000 ? "RECENT_HEARTBEAT_NOT_SCHEDULE_PROOF" : "PAUSED_RELEASE_REQUIRED" },
    ],
    acceptance: ["Sign in with your existing super-admin account.", "Connect its already verified bound wallet on BOT Mainnet; connection does not sign.", "Open Ops → AutoTrade and verify the account gate succeeds.", "Create a paper order using your own targets, run Check now, pause/resume/cancel and confirm saved state after reload.", "Record the paper order and observed heartbeat; do not approve a live order or sign."],
  } as const;
}