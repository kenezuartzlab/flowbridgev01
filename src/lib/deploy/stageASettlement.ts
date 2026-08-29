/**
 * FlowBridge V30.1E.4 — Stage A settlement record (FlowToken, BOT Mainnet 677).
 *
 * Public chain evidence only: transaction hash, deployed address, runtime
 * parity evidence and token invariants. No key material is recorded here; the
 * broadcast was signed by the protected server-side deployer secret and this
 * module never signs, broadcasts, funds or transfers anything.
 */
import { STAGE_A_ARTIFACT } from './stageADeployer';

export const STAGE_A_SETTLEMENT = {
  stage: 'A_FLOW_TOKEN',
  status: 'STAGE_A_SETTLED',
  chainId: 677,
  deployer: '0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD',
  txHash: '0xa96c2b788b17f9a492bff10f0a002618ed69cb970f7dcc97784ef8330dcb1517',
  blockNumber: 21_189_014,
  gasUsed: 942_745n,
  feeWei: 18_854_900_000_000_000n,
  contractAddress: '0x535ddda826142ac42ce288154e9595f080940ae9',
  onChainRuntimeSha256: '7f1e5cf1b392dc58de1c22dbf6765753ec766fb51f9b9e840aee833cf5c3579e',
  runtimeBytes: 3539,
  /** All 131 byte differences vs the frozen runtime sit in EIP-712 immutable slots. */
  runtimeParity: 'PROVEN_MODULO_IMMUTABLES',
  immutableDiffBytes: 131,
  name: 'FlowBridge',
  symbol: 'FLOW',
  decimals: 18,
  totalSupplyWei: 1_000_000_000_000_000_000_000_000_000n,
  treasurySafe: '0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4',
  treasuryBalanceWei: 1_000_000_000_000_000_000_000_000_000n,
  sourceVerification: 'SUBMISSION_BLOCKED_BY_EXPLORER_EDGE',
  stageB: 'NOT_STARTED',
} as const;

/** Stage A settles only when every economic invariant holds exactly. */
export function stageASettlementValid(): boolean {
  const s = STAGE_A_SETTLEMENT;
  return (
    s.chainId === 677 &&
    s.runtimeBytes === 3539 &&
    s.name === 'FlowBridge' &&
    s.symbol === 'FLOW' &&
    s.decimals === 18 &&
    s.totalSupplyWei === 1_000_000_000n * 10n ** 18n &&
    s.treasuryBalanceWei === s.totalSupplyWei &&
    s.runtimeParity === 'PROVEN_MODULO_IMMUTABLES' &&
    (STAGE_A_ARTIFACT.runtimeSha256 as string) !== (s.onChainRuntimeSha256 as string)
  );
}
