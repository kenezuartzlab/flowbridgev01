import { buildOwnershipMessage, validateOwnershipMessage, type OwnershipFields } from '@/lib/wallet/ownershipMessage';

const READ_SCOPE = '\nRead only: show my private voter reward balance and payout history. Never authorize a payout.';

export function buildVoterRewardReadMessage(fields: OwnershipFields): string {
  return buildOwnershipMessage(fields) + READ_SCOPE;
}

export function validateVoterRewardReadMessage(message: string, expected: Parameters<typeof validateOwnershipMessage>[1]): boolean {
  return message.endsWith(READ_SCOPE) && validateOwnershipMessage(message.slice(0, -READ_SCOPE.length), expected);
}