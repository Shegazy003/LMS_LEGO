# Decision 002: owner delegation and who runs each role

**Date:** 31 October 2026. **Status:** in force from the owner's instruction of 31 October 2026: "create sessions or subagents, every one with an assigned role, wisely use the power of the model; you are delegated as owner, even you can do merge by yourself."

## What the owner delegated

The Claude session that founded this repository acts as **owner's delegate** for acceptance: it may approve contracts, accept candidates and merge pull requests. It also serves as **Project Lead** and **Product Manager**. The delegation does not cover what the human owner alone can physically do or must personally bear:

- creating or paying for accounts (Cloudflare, Meta, a domain) and entering any credential;
- publishing to a public address for the first time, and anything that spends money;
- deleting real organizations' data;
- accepting a risk the contract calls RED beyond what is listed here.

Those stay with the human owner and arrive as one bundle, as before.

## Who runs each role

| Role | Runs as | Model | Why |
|---|---|---|---|
| Owner's delegate, Project Lead, Product Manager | The founding session | Claude Opus 5.5 (the owner switched the session's model on 31 October 2026; it began on Fable 5.1) | Holds the whole history; one place for sequencing, stamps and acceptance |
| Product critic | A fresh agent per contract version | Claude Sonnet 5.5 | A second pair of eyes that has not seen the drafting; a focused one-shot review suits a smaller model |
| Builder | A fresh agent per task, in its own git worktree, on its own branch | Claude Opus 5.5 | The task is long and needs the strongest coding model available here |
| Independent Verifier | A fresh agent per candidate, read-only | Claude Sonnet 5.5 | Must not be the Builder's model; judges only from the frozen contract, the exact commit and CI evidence |

## Independence exception (recorded, with compensating controls)

The platform's rule asks for a Verifier from a **different AI vendor** than the Builder. Only Anthropic models are available in this environment, so the Verifier runs on a different Anthropic model (Sonnet) from the Builder (Opus). Compensating controls: the Verifier is a fresh agent that never sees the Builder's conversation, receives only the frozen contract, the exact commit, the diff and the CI run, and may not run the candidate's code outside CI. When another vendor becomes available in this repository's delivery line, this exception ends.

## Track record

| Task | Pull request | Builder | Red runs | Green run | Lead | Verifier | Merged |
|---|---|---|---|---|---|---|---|
| 1 · AT-1 | #4 | Opus 5.5, worktree, `build/at-1` | 41247378486, 41248452055, 41248931525 | 41249055975 on `6362b97` | ACCEPTED | PASS (Sonnet 5.5) | `c9a69e3`, 31 October 2026 |
| 2 · AT-4 | #6 | Opus 5.5, worktree, `build/at-4` | 41250965673 | 41252824667 on `cc20ec3` | ACCEPTED | PASS (Sonnet 5.5) | `b47eca6`, 1 November 2026 |
| 3 · AT-3 | #8 | Opus 5.5, worktree, `build/at-3` | 41254729207, 41255636678 | 41255924519 on `5ce7c4d` | ACCEPTED | PASS (Sonnet 5.5) | `58f8ba6`, 1 November 2026 |
| 4 · AT-2 | #10 | Opus 5.5, worktree, `build/at-2` | 41258695307, 41260026068 | 41260452130 on `11ae007` | ACCEPTED | PASS (Sonnet 5.5) | `d75f138`, 1 November 2026 |
| 5 · AT-5 | #13 | Opus 5.5, worktree, `build/at-5` | 41263260246, 41263926426, 41264571138 | 41264967169 on `4f9c40f` | ACCEPTED | PASS (Sonnet 5.5) | `8133ded`, 1 November 2026 |
| 6 · first-deploy rails | #15 | Opus 5.5, worktree, `build/deploy`; rework by a fresh Opus Builder | 41268178967, 41269112439; rework 41271098299 | 41269301936 on `04c8d6e`; rework 41271638319 on `9f9a995` | ACCEPTED, then ACCEPTED (rework) | HOLD (smoke check accepted a 200 on `/`), then PASS on re-check | `196ada9`, 1 November 2026 |
| 7 · password strength as a setting | #17 | Opus 5.5, worktree, `build/password-strength` | 41273882788 | 41274441035 on `bfd5eff` | ACCEPTED | PASS (Sonnet 5.5) | `7fbe525`, 1 November 2026 |
| 8 · apply password option B | #19 | Opus 5.5, worktree, `build/password-option-b` | 41335118455 | 41335950520 on `e973713` | ACCEPTED | PASS (Sonnet 5.5) | `19a22af`, 1 November 2026 |
| 9 · smoke check waits through a fresh address's 404 | #21 | Opus 5.5, worktree, `build/smoke-first-deploy` | 41357672029 | 41358496582 on `4a38477` | ACCEPTED | PASS (Sonnet 5.5) | `258bbdb`, 1 November 2026 |

## Working rules for the agents (in addition to AGENTS.md)

- **One build task in progress at a time.** The Lead cuts the next one only after the previous candidate is `PASS` and merged.
- **The Builder works in its own worktree and branch** (`build/<task>`), never on `main`, and opens its pull request through the GitHub REST API. It commits the failing tests first (one commit, red in CI), then the implementation (green in CI), so the red/green evidence is in the branch history.
- **Only the Lead edits `CURRENT-PROGRESS.md`.** The Builder reports in the pull request and in its hand-back.
- **Reports carry milestones only**: `CANDIDATE READY` (with pull request, exact commit, CI run, named steps, known limits), `PASS` or `HOLD`, `ACCEPTED`, `REWORK`, `REPLAN`, `BLOCKED RED`.
- **A Builder's worktree stays until its pull request is merged.** On task 6 the Lead removed it at `CANDIDATE READY`, so the Builder could not be resumed for the rework and a fresh Builder took a self-contained brief (recorded 1 November 2026).
- **The Lead stamps before the Verifier reads.** The Verifier's verdict binds the commit hash. The delegate merges on `PASS`; a `HOLD` goes back to the same Builder branch as `REWORK`.
