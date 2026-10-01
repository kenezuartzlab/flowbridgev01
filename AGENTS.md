<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Router V4 changes ship as new frozen candidate directories under contracts/production/ (never edit a deployed candidate); app ABIs are generated from the compiled artifact into routerV4Abi.generated.ts and guarded by a parity test. Why: hand-written ABIs drifted from deployed bytecode.
- Route execution class (atomic V4 vs staged) is decided only in src/lib/swap/executionCapability.ts behind per-chain flags. Why: one place controls promotion.
