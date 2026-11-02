import { encodeAbiParameters, keccak256, type Address, type Hex } from 'viem';
import { getFlowRewardsChainConfig } from './flowRewardsRegistry';

export const VAULT_V2_RELEASE = 'FLOWBRIDGE-VAULT-V2-DISABLED-20261102';
export const VAULT_V2_CONFIG: { enabled: boolean; chainId: number; address: Address | null; codeHash: Hex | null; publisher: Address | null; cutoverVerified: boolean } = {
  enabled: false, chainId: 677, address: null, codeHash: null, publisher: null, cutoverVerified: false,
};
export const vaultFlowToken = () => getFlowRewardsChainConfig(677)?.token ?? null;
export type VaultAward = {
  id: string; economicId: string; wallet: Address; points: bigint; program: string;
  verified: boolean; reconciled: boolean; funded: boolean; authorized: boolean;
  bindingMatches: boolean; mainnet: boolean; newAfterCutover: boolean; allocated: boolean;
};
export function eligibleVaultAward(a: VaultAward): boolean {
  return a.points > 0n && a.verified && a.reconciled && a.funded && a.authorized && a.bindingMatches && a.mainnet && a.newAfterCutover && !a.allocated
    && ['SIGNUP_BONUS','CORE_SWAP','REFERRAL_MILESTONE'].includes(a.program)
    && /^0x[0-9a-fA-F]{40}$/.test(a.wallet) && BigInt(a.wallet) !== 0n;
}
export function prepareVaultBatch(awards: VaultAward[], freeWei: bigint, batchCap: bigint, dailyRemaining: bigint) {
  if (!awards.length || awards.some(a => !eligibleVaultAward(a))) throw new Error('AWARD_NOT_ELIGIBLE');
  if (new Set(awards.map(a => a.id)).size !== awards.length || new Set(awards.map(a => a.economicId)).size !== awards.length) throw new Error('DUPLICATE_AWARD');
  const sorted = [...awards].sort((a,b) => a.id.localeCompare(b.id));
  const sums = new Map<Address,bigint>();
  for (const a of sorted) { const wallet = a.wallet.toLowerCase() as Address; sums.set(wallet,(sums.get(wallet)??0n)+a.points*10n**18n); }
  const wallets = [...sums.keys()].sort();
  if (wallets.length > 100) throw new Error('RECIPIENT_CAP');
  const amounts = wallets.map(w => sums.get(w)??0n);
  const total = amounts.reduce((a,b)=>a+b,0n);
  if (total > freeWei || total > batchCap || total > dailyRemaining) throw new Error('BACKING_OR_LIMIT');
  // Hash includes economic source IDs: changing an award, wallet or amount changes identity.
  const sourceHash = keccak256(new TextEncoder().encode(JSON.stringify(sorted.map(a=>[a.id,a.economicId,a.wallet.toLowerCase(),a.points.toString(),a.program]))));
  const batchId = keccak256(encodeAbiParameters([{type:'uint256'},{type:'bytes32'},{type:'address[]'},{type:'uint256[]'}],[677n,sourceHash,wallets,amounts]));
  return { batchId, sourceHash, sourceIds: sorted.map(a=>a.id), wallets, amounts, total };
}
export function vaultClaimGate(s: { enabled: boolean; verified: boolean; chainId: number; walletMatches: boolean; paused: boolean; balance: bigint; liabilities: bigint; claimable: bigint }) {
  if (!s.enabled || !s.verified) return 'DEPLOYMENT_UNVERIFIED';
  if (s.chainId !== 677) return 'WRONG_NETWORK';
  if (!s.walletMatches) return 'WALLET_MISMATCH';
  if (s.paused) return 'PAUSED';
  if (s.balance < s.liabilities || s.claimable > s.liabilities) return 'INSOLVENT';
  return s.claimable > 0n ? 'READY' : 'EMPTY';
}
export function confirmedVaultClaim(s: { receipt: 'success'|'reverted'|'pending'; eventWallet: string|null; wallet: string; eventAmount: bigint; expectedAmount: bigint; canonicalBlock: boolean; rereadClaimable: bigint|null }) {
  return s.receipt === 'success' && s.canonicalBlock && s.expectedAmount > 0n && s.eventWallet?.toLowerCase() === s.wallet.toLowerCase() && s.eventAmount === s.expectedAmount && s.rereadClaimable === 0n;
}