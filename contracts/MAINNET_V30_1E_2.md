# FlowBridge V30.1E Stage A — Deployer Preflight + Unsigned Deployment Review

**Verdict: STAGE A PREFLIGHT PASS — APPROVED, NOT BROADCAST**

Zero deployments, zero signatures, zero Safe transactions, zero FLOW transfers,
zero funding. No private key, seed phrase or signing secret exists in FlowBridge
source, storage, logs or chat; signing happens only in the operator's own wallet.

## 1. Deployer binding

| Field | Value |
| --- | --- |
| Approved deployer (public EOA) | `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` |
| Network | BOT Mainnet, chain id **677** |
| Signer mode | EXTERNAL_WALLET only |

## 2. Live read-only chain verification (`https://rpc.botchain.ai`)

| Check | Observed | Result |
| --- | --- | --- |
| `eth_chainId` | `0x2a5` = 677 | PASS |
| Block height | 21,185,622 | context |
| `eth_getCode(deployer)` | `0x` | PASS (EOA, no contract code) |
| Balance | 2.500000 BOT | PASS |
| `eth_gasPrice` | 20,000,000,000 wei (20 gwei) | PASS |
| `eth_maxPriorityFeePerGas` | 20 gwei (base fee 0) | context |
| Nonce | 0 | PASS (fresh deployer) |
| Deployer is not a Safe/protocol role | true | PASS |

### Safe re-verification (live)

| Safe | Address | Code | Owners | Threshold | Result |
| --- | --- | --- | --- | --- | --- |
| Treasury | `0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4` | 171 bytes | 3 approved | 2 | VERIFIED |
| Governance | `0x88A4CC1F5771523baeB83DaEea07D323a3ce9507` | 171 bytes | 3 approved | 2 | VERIFIED |
| Operations | `0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF` | 171 bytes | 3 approved | 2 | VERIFIED |

### Release identity

| Item | Value | Result |
| --- | --- | --- |
| Candidate digest | `fnv1a64:19671fd13a81be19` | UNCHANGED |
| Decision manifest hash | `fnv1a64:9972234982dbe76f` | UNCHANGED |

### FlowToken artifact parity (rebuilt from source, solc 0.8.24+commit.e11b9ed9, runs 200, viaIR, Cancun, OZ 5.6.1)

| Hash | Rebuilt | V30.1E.1 | Result |
| --- | --- | --- | --- |
| source sha256 | `96a757b5…83229e` | same | MATCH |
| creation sha256 | `200a6a55…2107a2` | same | MATCH |
| runtime sha256 | `f7be82e4…226edf` | same | MATCH |
| normalized ABI sha256 | `879c21aa…78b851` | same | MATCH |
| runtime size | 3,539 bytes | within EIP-170 | PASS |

## 3. Funding recalculated from the live gas price (not hardcoded)

- Approved release envelope: 21,500,000 gas + 30% buffer.
- Live gas price: 20 gwei → required **0.559000 BOT**.
- Deployer balance: **2.500000 BOT** → covered with 1.941 BOT headroom.
- Stage A alone: measured `eth_estimateGas` = **951,394** gas → 0.019028 BOT,
  0.024736 BOT with the same 30% buffer.

Formula stays live: `requiredReleaseFundingWei(gasPriceWei)` recomputes at
signing time; if gas price rises the required balance rises with it.

## 4. Stage A approval (FlowToken only)

Created for Stage A only, bound to deployer + chain 677 + candidate digest +
manifest hash + exact creation-bytecode hash + exact constructor-argument hash.
It is one-time, cannot authorize Stage B–E, funding, or a Safe transaction, and
is invalidated by any drift in those bindings.

## 5. Unsigned deployment review (sign nothing until approved)

| Field | Value |
| --- | --- |
| Deployer | `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` |
| To | `null` (contract creation) |
| Value | 0 BOT |
| Treasury recipient | `0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4` |
| Fixed supply | 1,000,000,000 FLOW, 18 decimals (`1e27` wei) |
| `name_` | `FlowBridge` |
| `symbol_` | `FLOW` |
| `treasury_` | `0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4` |
| `totalSupply_` | `1000000000000000000000000000` |
| Creation bytecode sha256 | `200a6a559c6e43a357f7b7fb677a1d7a4e1d89344fd78bcc34398265fa2107a2` |
| Unsigned data keccak256 | `0x9415ef65a40a2b1e6e61ac0a513b62bb1dcc3173ee07741ed2c6e096d55ae45f` |
| Unsigned data sha256 | `0xceebd8d754c215812371d2ca6c3fd8d59c6ea21b15994a609fd765996f113a56` |
| Unsigned data size | 5,916 bytes (5,660 creation + 256 args) |
| Nonce | 0 |
| Gas estimate | 951,394 |
| Gas price | 20 gwei |
| Max fee for this tx | ≈0.019028 BOT (0.024736 BOT buffered) |

**Expected effect:** deploys FLOW with a fixed 1,000,000,000 supply (18 decimals)
minted once in the constructor to the approved Treasury Safe. No mint path, no
owner, no tax, no blacklist, no upgrade proxy remains after deployment.

## 6. Status

`NOT_DEPLOYED` → awaiting explicit owner instruction to broadcast Stage A from
the operator's external wallet. Nothing was signed or sent in this phase.
