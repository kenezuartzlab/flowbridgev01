# Stage E — staking-v2 verification packages (preflight, not deployed)

Frozen build line `stakingV2`:

- solc `0.8.24+commit.e11b9ed9`
- optimizer enabled, runs `200`
- `viaIR: true`
- EVM version `cancun`
- OpenZeppelin `5.6.1`

## Preserved compiler inputs

| Contract | Standard JSON input | SHA-256 | Reproduces frozen bytecode |
| --- | --- | --- | --- |
| FlowStakingRewardTreasury | `standard-input-FlowStakingRewardTreasury.json` | `9d5417ab7722455497ccf8147aa9246829daf824e062752a1174554e38ba5ed8` | yes |
| FlowStakingController | `standard-input-FlowStakingController.json` | `eb28fb7cc46f74324c15210665d36d4485aa1a13392aa4e12fe8d89e930209ca` | yes |
| FlowStakingVaultV2 | `standard-input-FlowStakingVaultV2.json` | `cea8ef2f131aee8fc7b05f918fa97daa41240c3ee88f08ca991a3acfb4af9636` | yes |

Each file contains every source unit exactly as resolved by the frozen import
callback (main source plus its OpenZeppelin dependencies) together with the exact
compiler settings. Recompiling a file from a clean process reproduces the frozen
creation and runtime bytecode byte-for-byte.

Stage D lesson applied: the explorer verification payload must be generated from
these preserved inputs. Reconstructing an approximate source tree or renaming
source units changes metadata and destroys parity. Flattened single-file
verification is not applicable to a `viaIR` build.

## Status

Preflight only. No staking contract has been signed, broadcast, funded or
activated. Stage A/B FlowToken and Rewards Distributor remain
`DEPLOYED_ONCHAIN_VERIFIED_SOURCE_PENDING`; Stage D Activity Registry remains
`EXPLORER_TRANSPORT_BLOCKED`. Neither state is altered by Stage E.
