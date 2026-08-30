# FlowBridge V30.2B R5 — Staking Controller Preflight (BOT Mainnet 677)

Verdict: **PREFLIGHT PASS — READ-ONLY, NOTHING SIGNED OR BROADCAST**

Candidate: `contracts/production/v30-2b-controller/` (manifest, sources, ABI, bytecode,
Standard JSON, constructor args, unsigned deployment data, SHA256SUMS).
Supersedes the quarantined V30.1 controller `0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf`.

## Build matrix (read from frozen `V30_2A_REDEPLOY_PREFLIGHT.json` replacements[R5], not inferred)

| Setting | Value |
| --- | --- |
| solc | `0.8.24+commit.e11b9ed9` |
| optimizer | enabled, 200 runs |
| viaIR | **false** (not required; zero warnings) |
| EVM version | cancun |
| metadata | bytecodeHash ipfs, appendCBOR true |
| sources | 6 units (FlowStakingController.sol + OpenZeppelin 5.6.1 AccessControl chain, vendored verbatim) |
| double build | two clean compiles byte-identical (creation, runtime, ABI) |

## Artifact hashes

| Artifact | SHA-256 | Bytes |
| --- | --- | --- |
| Source | `b2a58b1128c0a9d42630b0026ce69cc377abbce6c9ea3ec42721c73d40afc0d4` | — |
| Creation | `7734b53078fd6cc2668b9f03534a6c015e8864dfaae7c07d0c12f4b3f022da9d` | 9,559 |
| Runtime | `408ee63a90219cdb873fbff9602dbddfe4875e3c78108ea44c1d7e601c95a250` | 7,997 (EIP-170 headroom 16,579) |
| ABI | `b61bcac1780e51fda835b9e57318a7198c09d4d6e7542a3dabb7640c3fe0e88f` | — |
| Standard JSON | `2cb8a4247762f6bdfb774d834f2788b4db0644792edbaf6a7a5409298e019e06` | — |

All five match the frozen R5 evidence exactly. The Standard-JSON package recompiles to the
same creation/runtime/ABI hashes, so it is verification-ready.

## Constructor

`constructor(address admin, address governor, address publisher)` — the frozen reviewed source
takes no treasury or vault argument.

| Arg | Value |
| --- | --- |
| admin | `0x88A4CC1F5771523baeB83DaEea07D323a3ce9507` (Governance Safe) |
| governor | `0x88A4CC1F5771523baeB83DaEea07D323a3ce9507` (Governance Safe) |
| publisher | `0x0000000000000000000000000000000000000000` (unset — no PUBLISHER_ROLE grant executes) |

Encoded args keccak: `0xf03d5b653f96d9a93b75aceb736e3596e106e4db698b3d0667234dd76f24c856`

## Authority and binding state at deployment

- `DEFAULT_ADMIN_ROLE` → Governance Safe; `GOVERNOR_ROLE` → Governance Safe
- `PUBLISHER_ROLE` unassigned (zero publisher argument, grant is conditional in source)
- Oracle unset — no constructor assignment; governor-only setter
- Deployer receives no role
- Vault: `IFlowStakingVaultV2View public vault` declared with no initializer, never assigned in the
  constructor, settable only by `GOVERNOR_ROLE`
- R4 Reward Treasury `0x96552909998F3DbAf5Ff4979dc158508b3442e65` (live, verified) is the only
  treasury this stack will bind to; the frozen source performs that wiring post-deployment,
  so R5 carries no treasury binding in its payload

## Economics preserved (verified against the frozen source)

| id | product | lock | genesis APR | floor | target | hard cap |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Flexible | none | 18% | 0% | 10% | 12% |
| 1 | Lock 30D | 30 days | 27% | 8% | 14% | 18% |
| 2 | Lock 90D | 90 days | 36% | 10% | 18% | 24% |
| 3 | Lock 180D | 180 days | 48% | 12% | 24% | 32% |
| 4 | Lock 365D | 365 days | 60% | 15% | 30% | 40% |

- Year-1 ceilings: `GENESIS_YEAR1_CAP = 1,000,000 ether`, `STANDARD_YEAR1_CAP = 2,000,000 ether`,
  `TOTAL_YEAR1_CAP = 3,000,000 ether`, enforced at 3 `Year1CapExceeded()` sites
- Fail-closed oracle: `OracleNotConfigured`, `OracleStale`, `OracleInsufficientLiquidity`,
  `OracleDeviationTooHigh` all present; `EpochBudgetExceedsMaxFlow` bounds emission;
  `RateGuardBreached` enforces the weekly ±10% rate guardrail
- No mint authority, no token transfer/transferFrom path, no principal custody

## Inert initial state

`vault` unset (zero), `maxFlowPerEpoch = 0`, `weeklyUsdBudget8 = 0`, oracle unset, publisher unset,
no epoch published, no FLOW movement. The five products are configured (`active = true`) by the
frozen constructor itself — this is the reviewed source's canonical matrix and it is economically
inert while vault, budgets, oracle and publisher remain unset; no activation call is performed here.

## Live read-only preflight

| Field | Value |
| --- | --- |
| Chain ID | 677 (block 21,507,4xx) |
| Deployer | `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` (EOA) |
| Pending nonce | 13 |
| Balance | 2.10338596 BOT (gas price 20 gwei) |
| Predicted CREATE address | `0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF` — codeless |
| Deployment data | 9,655 bytes |
| Deployment-data keccak | `0xdd7e8637e1dc795ffbf238e2cb376b2ed5cdae14efa94767f30541c24a9e779b` |
| Gas estimate | 2,160,779 |
| Buffered limit (+30%) | 2,809,012 |

## Contamination check

No old FlowToken `0x535ddda8…40ae9`, old treasury `0xA861152C…32d0e`, old controller
`0x5095ecc7…52bf`, or old vault address appears in the source or in the deployment payload.

## Hard stops

None triggered: no source drift, no economic parameter drift, no old-address contamination,
no vault binding, zero initial emission budgets, no active oracle/publisher, reproducible
bytecode, viaIR not required.

## Writes performed

None. No signing, no broadcast, no FLOW movement, no treasury funding, no role grant,
no product activation, no oracle/publisher configuration. R5 awaits explicit authorization.
