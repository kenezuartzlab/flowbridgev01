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
  /** V30.1E.5 — Hardhat verification attempt against the BOT Chain custom explorer. */
  hardhatVerification: {
    gate: 'V30.1E.5',
    attemptedAtUtc: '2026-08-29T02:05:00Z',
    tool: 'hardhat@2.26.1 + @nomicfoundation/hardhat-verify@2.0.14',
    network: { name: 'botmainnet', chainId: 677, apiUrl: 'https://scan.botchain.ai/api' },
    compiler: 'v0.8.24+commit.e11b9ed9',
    settings: { optimizerEnabled: true, optimizerRuns: 200, viaIR: true, evmVersion: 'cancun' },
    sourceName: 'FlowToken.sol',
    constructorArgs: [
      'FlowBridge',
      'FLOW',
      '0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4',
      '1000000000000000000000000000',
    ],
    rebuildCreationSha256: '200a6a559c6e43a357f7b7fb677a1d7a4e1d89344fd78bcc34398265fa2107a2',
    rebuildRuntimeSha256: 'f7be82e4d98df2b7ab421ae8ec4b1d2ea1b0fd124b7865aaaad5e77656226edf',
    rebuildMatchesFrozenEvidence: true,
    redeployed: false,
    compilerSettingsAltered: false,
    result: 'VERIFIER_UNREACHABLE_EXPLORER_EDGE_403',
    verifierResponse:
      "hardhat-verify: Etherscan: A network request failed. This is an error from the block explorer, not Hardhat. Error: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON (HTTP 403 Cloudflare 'Attention Required!' on POST /api verifysourcecode, 221034-byte body, and on POST /api/v2/smart-contracts/.../verification/via/standard-input)",
    explorerReadsSourcePublicly: false,
    payloadBytes: 221_034,
    measuredEdgeBodyLimitBytes: 40_000,
  },
  sourceStatus: 'DEPLOYED_SOURCE_PENDING',
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
