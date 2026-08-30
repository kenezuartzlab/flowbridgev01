# FlowBridge V30.2A R1 — New FlowToken Unsigned Deployment Preparation

**Verdict: FLOWBRIDGE V30.2A R1 FLOWTOKEN PREFLIGHT PASS — APPROVED, NOT BROADCAST**

Owner approval frozen against candidate digest `fnv1a64:e0ac31b5bb297880`.
Evidence: `contracts/production/V30_2A_R1_PREFLIGHT.json`. Gate logic and tests:
`src/lib/deploy/v302aR1Preflight.ts(.test.ts)`.

## 1. Compiler matrix (exact)

| Field | Value |
| --- | --- |
| solc | 0.8.24+commit.e11b9ed9 (Emscripten.clang) |
| optimizer | enabled, runs 200 |
| viaIR | **false** |
| evmVersion | cancun |
| metadata | bytecodeHash ipfs, appendCBOR true |
| warnings | 0 |
| double build | byte-identical |

## 2. Artifact hashes

- source sha256 `96a757b53494a5cee3268ef289183c660c6c8b6bd22e27a44469b6780c83229e`
- standard-input sha256 `d8188e0288c79807f2ff8a209cb099e48cedce51a3ef69086e44c6a448d73590`
- creation sha256 `f15c487550c01c071784a39ff1de895645cb24ab626a719d449103730c7258d5`
- runtime sha256 `73dcb8db0657a18bd57e4021900c57a646da1c6cb9b6eda3c2e3e725db4130f9`
- normalized ABI sha256 `879c21aabfb51e2982e4f45db18453a5812d302be5f75a19484ba127da78b851`
- runtime size 3,760 bytes (EIP-170 headroom 20,816)

All five values reproduce the V30.2A candidate row for R1 exactly.

## 3. Constructor arguments

`("FlowBridge", "FLOW", 0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4, 1000000000000000000000000000)`

constructor-args sha256 `06b40677b34dcbee89ef0a52799c99b453117ef16288f2430bca5fd8cb3b631a`.
Fixed supply 1,000,000,000 FLOW at 18 decimals, minted once in the constructor to the
Treasury Safe. No owner, mint path, minter role, tax, blacklist, rebase, reflection, hook or
proxy exists in the compiled ABI or source.

## 4. Deployer

`0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD` — `eth_getCode` = `0x` (EOA), nonce **8**,
balance **2.2067068 BOT**, chain 677 at block 21,471,458, gas price 20 gwei.

## 5. Expected CREATE address

`0x123E64D074FD5d66DBd4BD62Dc4e71da7101DB63` (deployer + nonce 8).

## 6. Gas

`eth_estimateGas` 994,903 → buffered limit **1,293,373** (+30%), max cost 0.02586746 BOT.

## 7. Unsigned deployment data

5,780 bytes; keccak256 `0xa2f4737d87d3618603dfcc190d6c7c51cdc5c8839d4a1f4eca5b3573d46e423e`,
sha256 `27badf4f90f80d41b2e1637b89bb076f450b17252eadf8019bb8d802df87c0e6`.
Nothing is signed and nothing is broadcast in this gate.

## 8. Verification package

Non-viaIR Solidity Standard-JSON input at
`contracts/production/v30-2a-candidate/standard-inputs/FlowToken.standard-input.json`
(sha256 as above), contract `FlowToken.sol:FlowToken`, with ABI-encoded constructor args
included. Ready for immediate explorer verification the moment R1 settles.

## 9. Old stack and Router

Old FlowToken `0x535dDDA8…40aE9` observed unchanged (3,539 runtime bytes),
`DEPRECATED_PENDING_REPLACEMENT`. No allowance, transfer, funding, burn or migration is
prepared. Router V4 / Router Lens / Router v3 are untouched.

## 10. Frozen V30.2 policy

> A replacement contract does not unlock its dependent deployment until the replacement
> contract is both on-chain settled and publicly source verified.

## 11. R6 exception (recorded, not approved)

`FlowStakingVaultV2`: `viaIR REQUIRED — STACK_TOO_DEEP`, status
`REQUIRED_PENDING_REVIEW`, ownerApproved `false`. Reviewed only when Vault V2 is reached.

## 12. One-time R1 approval binding

Bound to candidate digest, artifact hashes, constructor args, deployer, nonce 8, chain 677,
unsigned-data keccak and gas limit. Any change to any bound field invalidates the approval
and requires a fresh preflight.
