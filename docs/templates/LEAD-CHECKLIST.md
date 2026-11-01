# Lead checklist (stamp, merge, record)

On `CANDIDATE READY`:
1. Check the claims on GitHub yourself: pull request head, commit list, the red runs failed only on the new behaviour (step names), the head run green on every named step, files touched (no `docs/` or `CURRENT-PROGRESS.md` from a Builder), the CI workflow diff line by line.
2. Stamp on the pull request: **ACCEPTED** (fits the plan and the frozen contract), **REWORK** (back to the Builder on the same branch, with the list), or **REPLAN** (the contract or plan must change first).
3. Hand the exact commit to a fresh Verifier ([template](VERIFIER-BRIEF.md)).
4. On **PASS**: post the verdict on the pull request, then merge **bound to the verified sha** (`gh api -X PUT repos/Shegazy003/LMS_LEGO/pulls/<n>/merge -f merge_method=merge -f sha=<sha>`), wait for green CI on the merge commit on `main`, then remove the Builder's worktree.
5. On **HOLD**: post it, decide REWORK, brief the Builder (resume the same agent if its worktree still exists; otherwise a fresh Builder with a self-contained brief), then a narrow re-verification.
6. Record: one docs-only pull request updating `CURRENT-PROGRESS.md` (one dated current-state block on top, older blocks become history) and the track record in `docs/06-DELEGATION-AND-ROLES.md`; wait for its CI, merge.
7. Report to the owner in milestones only; RED items in one bundle with a recommendation, the effect and the undo.
