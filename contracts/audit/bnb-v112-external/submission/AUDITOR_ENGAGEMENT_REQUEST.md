# Ready-for-quote request — draft, NOT SENT

To an owner-selected independent security firm:

Please quote a confidential audit of FlowBridge's **final frozen V1.12 BNB swap adapter**, a non-upgradeable Solidity contract with inlined interfaces, native BNB wrapping/unwrapping, fixed WBNB/USDT/Pancake V3 router, two factory-verified fee tiers, caller/context-bound snapshots, net-after-fee floors, exact allowance and immutable emergency guardian. No deployment exists for this adapter in project records. Source freeze SHA256: `feb06ff5e1e392b2264dca4f86cb40c07af2a033fbd557ea10f2e9d2e333575b`.

Scope includes all source, constructor/configuration assumptions, six OPEN HIGH Slither balance paths, malicious callbacks/transfer/approval/refund behavior, guardian censorship/authority, dual-tier context, stranded assets, MEV limits, real external-token/router assumptions and artifact/hardfork reproduction. V1.11 is differential baseline only. App/WalletConnect dependency findings are supplemental and need a separately priced application scope if audited; no private customer data or secrets are included.

Please provide proposed reviewers, methods, schedule, price and confidentiality terms, explicit coverage/exclusions, a remediation/re-audit allowance, and signed final report requirements. The report must name exact source/bytecode hashes, compiler/settings, reviewed constructor policy, unresolved risk and verification limitations. Any subsequent source change requires renewed review. No automated self-review or mock/fork test is acceptable as a substitute for independent firm sign-off.

## Official options — not endorsements or engagements
- OpenZeppelin Security Audits: https://www.openzeppelin.com/security-audits (official page HTTP 200 checked 2026-11-22).
- Trail of Bits Software Assurance: https://trailofbits.com/services/software-assurance/ (official page HTTP 200 checked 2026-11-22).
- ChainSecurity: https://www.chainsecurity.com/ (official site HTTP 200 checked 2026-11-22; use its official contact options).

Availability, quote, pricing, agreement and suitability are **not verified**. No contact made, no packet sent, no firm engaged, no payment agreed. Owner selects a named auditor and authorizes the scope/sharing/agreement separately.

## Submission / acceptance checklist
- [ ] Owner chooses named firm and confirms appropriate confidentiality agreement and exact allowed scope.
- [ ] Auditor independently verifies INTEGRITY.json and final SHA256/Keccak/Standard JSON artifact.
- [ ] Auditor distinguishes synthetic fork fixtures from public target contracts and confirms no mainnet adapter deployment.
- [ ] Auditor reviews all six HIGH traces without suppressed detectors and assesses realistic exploit preconditions.
- [ ] Auditor reproduces tests/fork or documents archive/tooling blockers and tests additional adversarial cases.
- [ ] Auditor reports dependency risks separately from Solidity scope and identifies exclusions.
- [ ] Firm delivers signed report tied to final freeze; reviewer identity and authenticity independently checked.
- [ ] Remediation causes new frozen artifact and re-audit where needed; owner reviews residual risk.
- [ ] Deployment/financial/publication approvals remain separate even after audit sign-off.