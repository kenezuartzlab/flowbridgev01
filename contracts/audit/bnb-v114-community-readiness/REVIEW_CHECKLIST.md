# Human reviewer checklist (tick only after doing it yourself)
- [ ] Recomputed source SHA256 = `5e82f028…0425` and ran `node scripts/bnb-v114-packet.mjs`
- [ ] Rebuilt with solc 0.8.38 / 200 / cancun; bytecode keccaks match `artifacts/FREEZE.json`
- [ ] Read every external call; confirmed only fixed targets
- [ ] Traced each of the 6 Slither HIGH in `SLITHER_HIGH_TRACES.md`; recorded own conclusion
- [ ] Checked fee math (floor, once, on gross output) and net floor vs gross
- [ ] Checked reentrancy lock covers pause and both swap directions
- [ ] Ran `bunx vitest run contracts/candidates/bnb-swap-adapter-v1-13`
- [ ] Reviewed BOT V4 crosswalk for missed differences
- [ ] Reviewed threat model residuals; listed new risks
