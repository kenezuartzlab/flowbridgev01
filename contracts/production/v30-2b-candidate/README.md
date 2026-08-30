# V30.2B FlowToken candidate (frozen)

Verbatim uploaded source, vendored OpenZeppelin 5.6.1, no modifications.

Rebuild and re-hash locally:

```
node scripts/rebuild.cjs
```

Compiler: solc `0.8.24+commit.e11b9ed9`, optimizer enabled runs 200, `viaIR: false`,
evmVersion `cancun`, metadata `bytecodeHash: ipfs` + `appendCBOR: true`.

Files:

- `sources/FlowToken.sol` — frozen contract
- `sources/@openzeppelin/contracts/**` — vendored OZ 5.6.1
- `standard-input.json` — self-contained Standard-JSON for explorer verification
- `constructor-args.txt` — ABI-encoded constructor arguments (verbatim)
- `unsigned-deployment-data.txt` — creation bytecode + constructor args
- `MANIFEST.json` — reproduced hashes, sizes, chain state
- `SHA256SUMS.txt` — per-file source hashes

Nothing here signs or broadcasts a transaction.
