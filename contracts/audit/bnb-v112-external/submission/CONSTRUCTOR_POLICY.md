# Deployment / constructor configuration policy — draft, no deployment authorized

Constructor: `(address guardian, address feeRecipient, uint16 feeBps)`; chain must be 56 and immutable WBNB/USDT/router must have code. Guardian nonzero and not adapter; recipient nonzero and not adapter; code accepts illustrative 0/5/10 bps only. These are **test fixtures, not approved fee values or owner addresses**.

No owner guardian, treasury, signer or funded wallet is selected in this packet. No unsigned deployment transaction or executable production registration is provided. There is no BNB mainnet adapter address/transaction recorded. Local Anvil accounts and constructor fixtures are explicitly synthetic and must never be copied into a live deployment decision.

Before a separately authorized deployment:
- Obtain signed independent report tied to final source SHA256 and source/creation/runtime Keccak; resolve or explicitly risk-accept findings through the owner, not the agent.
- Owner separately approves exact guardian custody and pause/unpause policy, fee recipient and fee value, limits/slippage/provider/legal policy, deployment and funded canary. Do not infer these from architecture preference.
- Reproduce source/bytecode; calculate actual deployed runtime by applying exact constructor immutable values; verify against canonical receipt/code and independently sourced RPC evidence.
- Verify actual chain hardfork compatibility, target code identity and canonical factory exact-pair pools. Source hashes alone do not certify live token behavior or liquidity.
- Keep BNB/RWA trading and production registration disabled until all launch gates and independently verified deployment/canary acceptance are separately approved. Preserve BOT execution and reward history.

Changes to source, compiler, optimizer, EVM target or linked/configured runtime assumptions require renewed artifact identification and auditor review; immutable configuration must be explicitly covered by the signed report. Never deploy using a local fork receipt as authorization.