/**
 * V36.3A — network attribution for funded signup awards (pure).
 *
 * award_signup_bonus() records SIGNUP_BONUS rows without a chain id. A row is
 * treated as a BOT Mainnet 677 reward-program allocation only when every
 * provenance fact holds AND the program's backing is independently verified.
 * Nothing here writes or converts historical/Testnet awards.
 */
import { SIGNUP_BONUS_EFFECTIVE_AT, SIGNUP_BONUS_POLICY_VERSION } from "./signupBonusPolicy";

export const SIGNUP_REASONS = ["SIGNUP_BONUS_REFEREE", "REFERRAL_SIGNUP_BONUS"] as const;

export type SignupAttribution =
  | "MAINNET_SIGNUP_ALLOCATION"
  | "AWAITING_FUNDING_CONFIRMATION"
  | "NOT_SIGNUP_PROGRAM"
  | "WRONG_POLICY_VERSION"
  | "ACCOUNT_BEFORE_PROGRAM"
  | "EMAIL_NOT_VERIFIED"
  | "WALLET_NOT_BOUND"
  | "WALLET_MISMATCH"
  | "DUPLICATE_WALLET"
  | "NO_RESERVATION"
  | "NOT_FUNDED"
  | "HAS_OTHER_CHAIN";

export interface SignupAwardFacts {
  reason: string;
  programId: string | null;
  chainId: number | null;
  fundingState: string | null;
  policyVersion: string | null;
  reservationId: string | null;
  ledgerWallet: string | null;
  /** The qualifying (referee) account — creation date and email decide program eligibility. */
  refereeCreatedAt: string | null;
  refereeEmailVerified: boolean;
  /** Wallet currently bound to the award recipient's profile. */
  recipientBoundWallet: string | null;
  /** How many SIGNUP_BONUS_REFEREE awards share the referee wallet. */
  refereeWalletAwardCount: number;
  programFundingVerified: boolean;
}

export function attributeSignupAward(f: SignupAwardFacts): SignupAttribution {
  if (f.programId !== "SIGNUP_BONUS" || !(SIGNUP_REASONS as readonly string[]).includes(f.reason)) return "NOT_SIGNUP_PROGRAM";
  if (f.chainId != null && f.chainId !== 677) return "HAS_OTHER_CHAIN";
  if (f.policyVersion !== SIGNUP_BONUS_POLICY_VERSION) return "WRONG_POLICY_VERSION";
  if (f.fundingState !== "FUNDED") return "NOT_FUNDED";
  if (!f.reservationId) return "NO_RESERVATION";
  if (!f.refereeCreatedAt || Date.parse(f.refereeCreatedAt) < Date.parse(SIGNUP_BONUS_EFFECTIVE_AT)) return "ACCOUNT_BEFORE_PROGRAM";
  if (!f.refereeEmailVerified) return "EMAIL_NOT_VERIFIED";
  if (!f.recipientBoundWallet) return "WALLET_NOT_BOUND";
  if (!f.ledgerWallet || f.ledgerWallet.toLowerCase() !== f.recipientBoundWallet.toLowerCase()) return "WALLET_MISMATCH";
  if (f.refereeWalletAwardCount !== 1) return "DUPLICATE_WALLET";
  // Provenance verified — still excluded until backing is independently confirmed.
  if (!f.programFundingVerified) return "AWAITING_FUNDING_CONFIRMATION";
  return "MAINNET_SIGNUP_ALLOCATION";
}

/** Settlement may count a signup row as chain 677 only in this state. */
export const countsAsMainnetSignup = (a: SignupAttribution) => a === "MAINNET_SIGNUP_ALLOCATION";
