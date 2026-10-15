import { SIGNUP_BONUS_EFFECTIVE_AT, SIGNUP_BONUS_POINTS } from './signupBonusPolicy';

/** Read-only explanation, not a reward eligibility or award decision. */
export function signupPresentation(createdAt: string, awarded: number, walletBound: boolean) {
  if (awarded > 0) return `${awarded} PTS recorded; funding, reconciliation and a published open round are required before claiming FLOW.`;
  if (Date.parse(createdAt) < Date.parse(SIGNUP_BONUS_EFFECTIVE_AT)) return `Not included in the ${SIGNUP_BONUS_POINTS}-PTS signup program: account created before October 4, 2026. Binding a wallet later does not change the signup date.`;
  if (!walletBound) return 'Pending wallet verification. Email verification, a first-time bonus wallet and available funding must also be checked.';
  return 'Wallet bound; no signup award recorded. Email verification, wallet uniqueness, monthly cap, review and funding checks are not yet confirmed. No reward is assumed.';
}