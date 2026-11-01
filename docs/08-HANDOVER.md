# Handover: continuing LMS Lego from Claude Desktop (or any new session)

**Date:** 1 November 2026 (UTC). **Written by:** the founding Claude Code cloud session, acting as owner's delegate, Project Lead and Product Manager (decision 002). Everything needed to continue is in this repository; nothing depends on the cloud session that wrote it.

## 1. Where things stand

- **Release 1 is accepted and live** at **https://lms-lego.lmslego.workers.dev** (owner acceptance 1 November 2026). Details and evidence: [CURRENT-PROGRESS.md](../CURRENT-PROGRESS.md).
- `main` is green; no open pull requests; no work in progress.
- Next by the [roadmap](05-ROADMAP.md): release 2 (guardians and exam results) when Mesk School has used release 1 for one term, or earlier if the school asks.

## 2. Read in this order

1. [CURRENT-PROGRESS.md](../CURRENT-PROGRESS.md): the one current-state block on top is the truth.
2. [AGENTS.md](../AGENTS.md) and [00-OPERATING-CONTRACT.md](00-OPERATING-CONTRACT.md): roles, decision classes, test-first, evidence.
3. [06-DELEGATION-AND-ROLES.md](06-DELEGATION-AND-ROLES.md): the owner's delegation, who runs each role on which model, the track record, the lessons.
4. [01-PRODUCT-CONTRACT.md](01-PRODUCT-CONTRACT.md) (accepted, closed), [02-LEGO-MODEL.md](02-LEGO-MODEL.md), [05-ROADMAP.md](05-ROADMAP.md), [04-LATER.md](04-LATER.md).
5. [03-HOSTING-DECISION.md](03-HOSTING-DECISION.md) and [07-FIRST-DEPLOY.md](07-FIRST-DEPLOY.md): hosting, the owner's decisions, deploy.
6. `README.md`: run the product and its tests locally, routes, known limits, first deploy, password strength, last-resort reset.

## 3. How the team runs (repeat exactly)

| Role | Runs as | Model |
|---|---|---|
| Owner's delegate, Project Lead, Product Manager | the main Claude session | the session's model (Opus 5.5 at handover) |
| Product critic | a fresh agent per contract version | Sonnet |
| Builder | a fresh agent per task, in its own git worktree, branch `build/<name>` | Opus |
| Independent Verifier | a fresh read-only agent per candidate, different model from the Builder | Sonnet |

Templates: [Builder brief](templates/BUILDER-BRIEF.md), [Verifier brief](templates/VERIFIER-BRIEF.md), [Lead checklist](templates/LEAD-CHECKLIST.md). The line: Builder (red commit and red CI run, then green) → Lead stamp on the pull request → Verifier PASS or HOLD → delegate merges bound to the verified sha → green CI on `main` → docs-only record pull request.

**The owner's delegation** (decision 002) lets the delegate approve contracts, accept candidates and merge. It does **not** cover accounts, credentials, money, first public publication of something new, or deleting real data: those go to the owner as one RED bundle with a recommendation.

## 4. Operations

| Item | Where |
|---|---|
| Live address | https://lms-lego.lmslego.workers.dev (Cloudflare Workers Free; Worker `lms-lego`) |
| Database | Cloudflare D1 `lms-lego` (migrations in `migrations/`, additive only) |
| File storage | Cloudflare R2 `lms-lego-files` (owner's card on file, free up to 10 GB) |
| Password strength | `PASSWORD_ITERATIONS` = 10,000 in `wrangler.jsonc` (owner decision B); move to 100,000 with the $5 plan (decision A) when a second organization joins |
| Deploy | GitHub → Actions → `deploy` → Run workflow on `main`. Manual only; secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are the owner's, in GitHub repository secrets; nobody reads them |
| Last good deploy | run 41361374176 on `258bbdb`, version `3d84e561` |
| Rollback | `npx wrangler rollback` with the owner's credentials, or one click in the Cloudflare dashboard (Worker → Deployments) |
| Owner lost password and recovery code | `node scripts/owner-last-resort.mjs` on the owner's computer, then the one printed `wrangler d1 execute --remote` line, then `/recover` (README) |
| Health | Cloudflare → Workers & Pages → `lms-lego` → Metrics (CPU time, errors). At acceptance: CPU 3 ms, 0 errors |

## 5. Things that are not in this repository (by design)

- **Secrets:** the Cloudflare deploy token and account id live only in GitHub repository secrets; the Cloudflare login is the owner's.
- **The owner's recovery code:** on paper with the owner.
- **The two visual pages** are published on claude.ai; their source is in [docs/visual](visual/README.md).
- **The founding brainstorm** is in [docs/history](history/README.md).
- **The parent platform** `Shegazy003/ai-engineering-platform` was read for its manifesto and roles and was never changed.

## 6. Moving to Claude Desktop

1. Clone: `git clone https://github.com/Shegazy003/LMS_LEGO` and open the folder in Claude Code (Desktop). `CLAUDE.md` points here.
2. Install: Node 22, then `npm ci`, then `npx playwright install chromium` (the cloud session used a pre-installed Chromium; Desktop needs this once).
3. Check: `npm test` (rails), `npm run typecheck`, then the steps listed in `.github/workflows/ci.yml` if you want the full suite locally. CI on GitHub remains the trusted test location.
4. GitHub access: sign in `gh` (`gh auth login`). Differences from the cloud session: `gh pr create` works on Desktop (the cloud proxy blocked GraphQL and the Actions secrets API, so the cloud session used `gh api` REST calls); the live `workers.dev` address is reachable from a desktop network (it was blocked from the cloud container).
5. Agents: use the Agent tool with `isolation: worktree` for Builders, a different model for Verifiers, and the templates above. Keep a Builder's worktree until its pull request is merged.
6. Attribution: end commit messages and pull request bodies with the attribution lines the new session's system instructions give; do not copy the cloud session's session link into new work.

## 7. Open items and small follow-ups

From [CURRENT-PROGRESS.md](../CURRENT-PROGRESS.md), none blocking:
- the owner's pass over the Arabic kit labels (now editable in the kit editor) and the real subject names from Hadeer and Shimaa;
- switch on Workers Logs for troubleshooting (`observability` in `wrangler.jsonc`, a short task);
- a test driving a concurrent password change against the guarded re-hash;
- direct cross-origin sweep cases for a null Origin, other port, scheme and subdomain;
- a custom domain before a second organization (about $10 a year, the owner's purchase).

Merged branches (`build/*`, `ops/*`, `contract-0.3`, `later/*`) are kept on GitHub as history; every one is merged into `main`, so deleting them later loses nothing.

## 8. Lessons recorded

- A brand-new `workers.dev` address answers 404 for a few seconds; the smoke check now waits through it (task 9).
- The Workers Free plan's 10 ms CPU limit governs password hashing; measure before choosing a strength (task 7).
- Removing a Builder's worktree before merge prevents resuming it for a REWORK (task 6).
- One AT-1 test crossed midnight UTC; tests take time from the Worker's clock (task 4).
