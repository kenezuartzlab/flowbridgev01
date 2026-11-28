// Trading-account connector boundary. No implementation holds or loads keys.
// Preferred custody: a non-exportable managed signer (cloud KMS/HSM secp256k1 key,
// sign-only IAM scoped to this worker) bound to ONE dedicated trading EOA that is
// never the owner, treasury, rewards or payout wallet, funded only with the canary
// budget. Fallback (dedicated hot EOA in a server secret) carries full-key-exfiltration
// risk: anyone with the secret can move all its funds; keep balance <= budget.
export type SignerStatus = "NOT_CONFIGURED" | "PROPOSED" | "AUTHORIZED";
export interface TradingSigner { address: `0x${string}`; signTransaction(tx: unknown): Promise<`0x${string}`> }
export const SIGNER_POLICY = {
  custody: "MANAGED_NON_EXPORTABLE_PREFERRED",
  forbiddenRoles: ["router owner", "fee treasury", "rewards publisher", "vote payout", "vault publisher"],
  maxBalanceUsdt: 5, // single first-canary cap: 5 USDT-equivalent (quote-verified), plus a separate BOT gas reserve; supersedes the earlier "1 BOT" example
  allowedTargets: "Router V4 leg selectors + exact ERC20 approve/revoke to Router V4 only",
} as const;
/** Always NOT_CONFIGURED in this build: nothing is created, funded or able to sign. */
export function loadTradingSigner(): { status: SignerStatus; signer: TradingSigner | null } { return { status: "NOT_CONFIGURED", signer: null }; }
