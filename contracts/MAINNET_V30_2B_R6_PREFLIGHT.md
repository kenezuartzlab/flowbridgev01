# FlowBridge V30.2B R6 — FlowStakingVaultV2 Production Preflight

**Verdict: R6 VIAIR TECHNICAL-NECESSITY PREFLIGHT PASS — frozen candidate reproducible, zero writes.**

No transaction was signed or broadcast. No funding, wiring, role grant, oracle
config, publisher assignment, epoch publication or approval occurred.

## 1. Frozen build matrix (from `V30_2A_REDEPLOY_PREFLIGHT.json` → `replacements[R6]`)

| Field | Value |
| --- | --- |
| solc | `0.8.24+commit.e11b9ed9` |
| optimizer | enabled, 200 runs |
| viaIR | **true** (technically required — see §2) |
| EVM | cancun |
| metadata | ipfs, appendCBOR |
| OpenZeppelin | 5.6.1, 13 units + contract = 14 source units |

## 2. viaIR=false attempted first — genuine failure

The exact frozen source was compiled with `viaIR:false` and nothing else changed.
No Solidity edit, no optimizer/EVM/metadata change.

```
CompilerError: Stack too deep. Try compiling with `--via-ir` (cli) or the
equivalent `viaIR: true` (standard JSON) while enabling the optimizer.
Otherwise, try removing local variables.
   --> FlowStakingVaultV2.sol:331:39:
331 |         p.varPaid = varPerTokenStored[productId];
```

This is exactly the historically documented condition. viaIR is therefore
technically necessary; removing it would require rewriting reviewed accrual
accounting, producing a new candidate needing independent review. **Explicit
owner approval is required before deploying with viaIR.**

## 3. Reproducibility (frozen viaIR bundle, compiled verbatim, twice)

| Artifact | Hash | Frozen match |
| --- | --- | --- |
| source | `4a82e4f0f9c07e2a24bc7150d80675c6c3d1b8359ce11589aac55fb7c75b2531` | ✓ |
| standard JSON | `5b35d7eb0ed90baabd8862e28d32a1b27498833aefd1e78a81f9de4e74d6bcef` | ✓ |
| creation | `159b884935907d9cf892a160a7bb7f671aad86ca5616c29acc15f6686e80e4f6` | ✓ |
| runtime | `af5ed43ffce266a56bcc8bffcd1b8d8067155a5716024cda089dac286294b7ce` | ✓ |
| normalized ABI | `a22dacc20032a9a188034b1fd1ea4c66eaa8ae3827259ac790a6897fd52369e0` | ✓ |

Creation 11,254 B · runtime 10,366 B · double build byte-identical · 0 Solidity warnings.
EIP-170: within limit, 14,210 B headroom.

## 4. Constructor and dependencies

`constructor(address token_, address controller_, address treasury_, address admin)`

| Arg | Value |
| --- | --- |
| token_ | `0xcaaB50F36252a57529AFeF651fa6B9f9281917fF` (V30.2B R1 FLOW) |
| controller_ | `0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF` (R5) |
| treasury_ | `0x96552909998F3DbAf5Ff4979dc158508b3442e65` (R4) |
| admin | `0x88A4CC1F5771523baeB83DaEea07D323a3ce9507` (Governance Safe) |

Args keccak `0x9585cb6f43265bd83999405e04db60f956ddaadb71b638d223293621b7b8749e`.
All three dependencies have code on chain 677. No old FLOW / treasury /
controller / vault address appears in the source or the deployment payload.

## 5. Economics and security unchanged

Five products are read from the R5 controller only (no local product table);
Genesis 90-day lifetime window with anti-reset lineage; Genesis obligation
reserved at entry with budget release on failure; locked floor fully reserved at
entry or revert; variable accrual via per-product accumulator; epoch settlement
callable only by the controller; unvested Genesis/floor remainder released on
withdraw.

Principal safety: principal is held by the vault and returned only to its owner;
rewards are paid by the treasury, never from principal. No mint path, token tax,
proxy/upgrade path, arbitrary call/delegatecall, sweep/rescue of principal, or
hidden admin transfer. Mutators are reentrancy-guarded.

Pause model: `pause()` = PAUSER_ROLE, `unpause()` = DEFAULT_ADMIN_ROLE.
Pausable: `openPosition`, `claim`. **Not pausable: `withdraw`** — principal exit
is always available.

## 6. Initial role matrix and empty state

DEFAULT_ADMIN_ROLE and PAUSER_ROLE → Governance Safe only. Deployer receives no
role. No treasury VAULT_ROLE grant and no controller→vault binding in this gate.
The constructor binds immutables and grants those two roles only: no token
movement, no approval, no position, zero principal, zero accrued/claimable
rewards, zero vault FLOW balance.

## 7. Test suite (exact candidate source)

forge 1.4.4 against the byte-identical source: **29/29 passed, 0 failed**, both
fuzz properties at 512 runs (accounting conservation, exact principal returned),
including principal isolation, Genesis anti-reset, cap exhaustion immutability,
floor funding, oracle fail-closed paths, rate guard, Year-1 total cap,
reentrancy callback block, and pause-blocks-risk-not-mature-withdrawal.

## 8. Live read-only chain state

chain 677 · deployer `0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` · pending nonce
**14** · balance 2.06053382 BOT · predicted CREATE address
`0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D` (codeless) · deployment data 11,382 B,
keccak `0xcdcd8dafa54a0bf2e11c91acb7b96092f8f1c476836952190b25fe81ea29d27d` ·
gas estimate 2,390,840 · +30% limit 3,108,092.

R5 controller remains inert: `vault == address(0)`, `maxFlowPerEpoch == 0`,
`weeklyUsdBudget8 == 0`.

## 9. Evidence

`contracts/production/v30-2b-vault/` — `PREFLIGHT.json`, `MANIFEST.json`,
`SHA256SUMS.txt`, `sources/`, `abi.json`, `creation-bytecode.txt`,
`runtime-bytecode.txt`, `constructor-args.txt`, `unsigned-deployment-data.txt`,
`verification-standard-input.json` (explorer Standard-JSON package).
