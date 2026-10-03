# Router V4 Registry-Delay Hardening — Proposal (NOT EXECUTED)

Status: **PREPARED ONLY.** No contract write, no delay change. Current activation delay on BOT Mainnet Router V4 `0x79653140D84B78C19354ee984f236Ec92160fc61` is **0 seconds**. Choosing and applying a delay requires a separate, explicit owner authorization.

## 1. Delay options
| Option | Delay | Trade-off |
|---|---|---|
| A | 6 hours | Same-day reaction; minimal operational friction. |
| B | 24 hours | Standard industry baseline; full day for monitoring and community visibility. |
| C | 48–72 hours | Strongest protection against a compromised owner key; slowest legitimate onboarding of new venues. |

Recommendation for discussion only: **Option B (24 h)**. Its alerts are surfaced by the Ops dashboard's Router V4 monitor.

## 2. Operations the delay affects
- Registering a new router/venue and activating a queued registration.
- Changing a venue's router address, type, or wrapped-native configuration.
- Confirm against the frozen source before execution: whether fee changes (global fee, per-router fee) and treasury changes go through the same queue. If they are immediate setters, the delay does not protect them.
- **Not affected:** swaps, quotes, Lens reads, and existing active registrations.

## 3. Existing active BDEX V3 registration
Setting a delay applies to *future* queued changes. The currently active BDEX V3 registration (router id 0, fee 1 bp) stays active and usable; no re-registration is required. Verify on a BOT Testnet deployment of the same frozen bytecode before Mainnet.

## 4. Emergency implications
- `pause()` must remain immediate. Confirm in source that pause is not subject to the delay.
- Deactivating a compromised venue should stay immediate if the contract supports it. If deactivation is queued, document the window during which pause is the only mitigation.
- With a delay, the response to a malicious *queued* change is: monitor alert, then owner cancels the change (if supported) or pauses the router.

## 5. Governance procedure
1. Owner (`0x524Db06954de917025180057BCBeB36eC96A98c5`) approves the delay value in writing.
2. Rehearse `setActivationDelay` (or equivalent) on BOT Testnet against the same bytecode, then verify the read-back value.
3. Run a read-only Mainnet pre-check: owner, pending owner, current delay 0, and no queued changes.
4. Owner signs a single delay-setting transaction. No other changes go in the same session.
5. Post-check: the Ops monitor reads the new delay. Update expected values in `routerV4Health.ts` / the Ops expected map in a separate reviewed change.

## 6. Rollback / recovery
- Lowering the delay should itself be subject to the current delay. Confirm in source. If it is, rollback takes at least the chosen delay.
- If the delay blocks an urgent legitimate change, use pause plus Router V3 (which stays live) for continuity while the change matures.
- Keep the fallback that atomic V4 routes are disabled by the app's health gate whenever drift is detected. The app already pauses atomic V4 when the health check fails.

## 7. Explicitly out of scope for this gate
Zero contract writes, zero configuration changes, no delay selection.
