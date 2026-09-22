# Community suggestions board — INTENTIONAL PUBLIC READ — ACCEPTED

Date: 2026-09-22 · Table: `public.proposals` · Finding: "Community suggestions
are readable by everyone" (permissive public read policy).

## Verified checks (all green, read-only inspection)

| Check | Result |
| --- | --- |
| Board is intentionally public-facing | PASS — community suggestion wall, displayed to all visitors |
| No private user information in readable fields | PASS — columns are `id`, `category`, `text`, `votes`, `author`, `created_at` only |
| No emails, secrets, admin notes, private wallet metadata, auth data, internal-only fields | PASS — none of those columns exist on the table |
| Only intended community-display fields readable | PASS — every column is display content; `author` is a shortened handle (e.g. `0x3f5...43b2`), enforced by constraint `proposals_author_no_full_wallet` (`author !~ '0x[0-9a-fA-F]{40}'` and length ≤ 60), so a full wallet address cannot be stored |
| Anonymous/public users cannot update or delete others' records | PASS — RLS enabled; the only policy is `Proposals are public readable` (SELECT, `using true`). No INSERT/UPDATE/DELETE policy exists, so all writes through the public API are denied regardless of table privileges |
| Administrative/moderation actions protected | PASS — moderation runs only through privileged server-side paths that bypass RLS after authorization; no public write policy exists |
| RLS / server-side authorization enabled for all non-public operations | PASS — `relrowsecurity = true`; read is the only publicly permitted operation |

## Rationale

Public readability is the intended product behaviour: the suggestions board is a
community feedback wall. The exposed surface contains no personal or sensitive
data, and public write access remains closed by row-level security. No
authorization policy was weakened, added, or relaxed to clear the warning.

Classification: **INTENTIONAL PUBLIC READ — ACCEPTED**.

## MultiSend release state preserved (unchanged by this action)

`FLOWBRIDGE MULTISEND EXPLORER-VERIFIABLE TESTNET RELEASE PASS`

- Active verified BOT Testnet contract: `0x1b97CCbAE4D5128f8E5591ada21476609c7F2960`
- Old address `0x535dDDA826142AC42cE288154e9595f080940aE9`: SUPERSEDED, blocked for
  new sends, paused on chain
- BOT Mainnet (677): LOCKED · BNB Mainnet (56) and BNB Testnet (97): LOCKED
- No deployment or contract change performed under this instruction
