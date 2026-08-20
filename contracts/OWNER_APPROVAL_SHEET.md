# FlowBridge V12.2 — Owner Approval Sheet (BOT Testnet 968)

**Status: APPROVED for BOT Testnet 968 only. Deployment is not yet broadcast —
see "Broadcast prerequisites" below. BOT Mainnet 677 remains BLOCKED.**

The single deployment source of truth is `contracts/config/bot-testnet.json`,
mirrored as frozen constants in `src/lib/rewards/flowApprovedTestnetPolicy.ts`.
Scripts and the app compare against those and fail closed on any mismatch.

Authority rules still apply: chat history, UI copy and test fixtures are **not**
deployment authority. The values below come from the owner-approved V12.2 gate
document and apply to BOT Testnet only. They are **not** mainnet tokenomics and
imply no promise of future mainnet conversion.

## Canonical parameter table (BOT Testnet 968)

| Parameter | Status | Value |
| --- | --- | --- |
| Network | APPROVED | BOT Testnet — chainId 968 |
| Token name | APPROVED | FlowBridge Token |
| Token symbol | APPROVED | FLOW |
| Decimals | APPROVED | 18 (canonical `pure` override in `contracts/FlowToken.sol`) |
| Fixed total supply | APPROVED | 1,000,000,000 FLOW (`1000000000000000000000000000` raw) |
| Treasury / initial recipient | APPROVED | `0xFA3DE5CFa1DE8EcC36197dCC0FC34fef5c1C7e47` |
| Distributor initial funding | APPROVED | 10,000,000 FLOW (`10000000000000000000000000` raw) |
| Contract owner | APPROVED | `0x628e237b73C5a37EF3968527563FA1a26b32BB97` |
| Reward signer (public address) | APPROVED | `0xA7d016C50e2B54B0942e8bEF0b4E5a82362330a2` (private key stays server-only) |
| Claim authorization lifetime | APPROVED | 900 seconds |
| BOT Mainnet 677 economics | BLOCKED | PROMOTION_PENDING — registry addresses null, claims disabled |

## <a id="v122-bot-testnet-conversion-policy"></a>BOT Testnet conversion policy

- 1 FLOW Point = 1 FLOW (1e18 base units), **BOT Testnet validation only**.
- Entitlement is **cumulative** (`claimed[]` advances; only the delta transfers).
- **Campaign PTS are excluded** and never enter FLOW entitlement.
- Authorization lifetime 900 seconds; signatures bind chainId 968 + distributor.
- Encoded in `src/lib/rewards/flowConversionPolicy.ts` as a chain-scoped policy;
  every other chain (including mainnet) resolves to `null` / fail-closed.

## Deployment order (authorized operations only)

1. Deploy `FlowToken(name, symbol, treasury, totalSupply)` — single mint of the
   fixed supply to the approved treasury; no post-deploy mint path.
2. Deploy `FlowRewardsDistributor(token, rewardSigner, owner)` — Ownable2Step,
   ownership starts at the approved owner.
3. Treasury transfers exactly 10,000,000 FLOW to the distributor. If the
   treasury wallet cannot sign in the authorized environment, record the
   distributor as **UNFUNDED** and stop — no workaround, no substitute funder.

No swap, bridge, campaign attestation, staking, ownership transfer, signer
rotation or user `claim()` is authorized in this gate.

## Broadcast prerequisites (current environment)

`bun contracts/scripts/preflight.bot-testnet.ts` is the hard gate and reports
every missing prerequisite. As of this gate the build environment lacks:

- `BOT_TESTNET_RPC_URL` (no RPC endpoint, so chainId 968 cannot be confirmed),
- `DEPLOYER_PRIVATE_KEY` exposed to the deployment environment,
- compiled artifacts in `contracts/artifacts/` (no solc/foundry toolchain here),
- `FLOW_REWARD_SIGNER_PRIVATE_KEY` deriving to the approved signer address
  (otherwise claim authority reports `SIGNER_SECRET_CONFIGURATION_REQUIRED`).

Until preflight returns PASS, no transaction may be prepared or broadcast, and
`src/lib/rewards/flowRewardsRegistry.ts` keeps BOT Testnet token/distributor
addresses `null` with claims disabled, so `/earn` stays fail-closed.

## After a successful deployment

1. `bun contracts/scripts/verify-deployment.ts contracts/deployments/bot-testnet.json`
   against live BOT Testnet RPC (metadata, supply, treasury balance, distributor
   token/owner/signer/pause, distributor balance).
2. Only then write the deployed addresses into `flowRewardsRegistry.ts` and
   enable BOT Testnet claims — and only if the signer secret derives to the
   approved reward-signer address.
3. The first real user FLOW claim belongs to the separate **V12.3** canary gate.
