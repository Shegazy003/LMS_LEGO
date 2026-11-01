# First deploy: the owner's bundle

**Date:** 1 November 2026. **Status:** the deploy rails are built and merged (build task 6, pull request #15); the deploy workflow exists and has never run. Used once the owner has answered the two decisions below and added the secrets. Everything here is a RED item for the human owner (accounts, credentials, money, first public publication); the delegate does not act on any of it alone (decision 002).

## What happens, in order

1. **Owner (about 15 minutes):** create the accounts and give the delivery line one deploy key (steps A to C below).
2. **Team:** a small build task adds a deploy workflow that runs only when started by hand, plus the last-resort owner reset; it goes through the usual Builder → Lead → Verifier route.
3. **Owner and team together, one sitting (about 20 minutes):**
   - the delegate starts the first deploy;
   - **the owner immediately opens the address and completes first setup** (until then, whoever arrives first could claim the owner account);
   - the owner writes the recovery code on paper;
   - the owner walks AT-1 step 4 (the public-address acceptance) and AT-2 step 6 (one real WhatsApp send from a phone);
   - the PDF viewer and its sandbox are checked in a real browser.
4. **Mesk School goes live** when those checks pass.

## Decision needed first: file storage and a payment card

Cloudflare's file storage (R2) has a free allowance of 10 GB, with downloads free. Current guides report that Cloudflare **asks for a payment card before the first storage bucket can be created**, even when usage stays inside the free allowance. Overage beyond the free lines is billed per use; there is no hard spending cap.

| Option | What it means | Free allowance | Card on file | Code change |
|---|---|---|---|---|
| **A. Keep R2 (recommended)** | Add a card when Cloudflare asks; stay inside the free lines; the owner's usage panel shows storage against 10 GB | 10 GB stored, downloads free | Yes | None |
| **B. No card: move files to Workers KV** | Store PDFs and images in Cloudflare's key-value store, which needs no card | 1 GB stored in total, at most 1,000 uploads a day, 25 MB per file | No | One small build task (the file layer is already in one module) |

**Recommendation: A.** Mesk School's pilot will stay far below 10 GB, the usage panel already warns before the line, and B would cap the whole product at 1 GB, about 200 lesson PDFs. If the owner prefers never to have a card on file, B is safe and reversible; say "B" and it becomes the next build task.

## Decision needed second: password strength and the free plan's CPU limit

The Workers Free plan allows **10 ms of CPU per request**; a request over it fails with error 1102. Signing in checks the password with PBKDF2 at 100,000 iterations, measured at about 45 to 65 ms of CPU locally (task 6, dated note in `docs/03-HOSTING-DECISION.md`). On the free plan, sign-in would likely fail.

| Option | What it means | Cost | Security |
|---|---|---|---|
| **A. Workers Paid** | Keep today's password strength; every free-plan limit rises at once | $5 per month (breaks the zero-cost line) | Unchanged |
| **B. Stay free (recommended for the pilot)** | Lower the password-hashing work until a sign-in fits inside 10 ms; stored passwords record their own strength and are upgraded at the next sign-in when the plan allows | $0 | Online guessing stays blocked by the wrong-password limit; weaker only if the database itself were ever stolen |

**Recommendation: B for the Mesk School pilot,** then A when a second organization joins.

Build task 7 (pull request #17) made the strength a setting stored with each password; today's 100,000 stays the default. Measured locally in the Workers runtime: one sign-in costs about 44 ms at 100,000 and about 4.4 ms at 10,000; a password change at 10,000 costs about 9 ms. **Option B means `PASSWORD_ITERATIONS` = 10,000 (the floor), set in the same pull request as the production guard's expected value, and set before the first deploy** so no 100,000-iteration hash is ever written in production. The live CPU column in Workers Logs at the go-live sitting is the real check; if 10,000 still exceeds the limit, option A is the answer.

## Owner's steps (A to C)

**A. Cloudflare account**

1. Go to `dash.cloudflare.com` and sign up with your own email. Choose the Free plan.
2. If you chose option A above: open **R2 Object Storage** in the left menu and accept Cloudflare's prompt to add a payment method. Do not create a bucket; the deploy does that.
3. Note your **Account ID**: it is shown on the right side of the account home page. It is not a secret.

**B. A deploy key for the delivery line**

1. In Cloudflare: your profile icon → **My Profile** → **API Tokens** → **Create Token** → start from the template **"Edit Cloudflare Workers"**.
2. Add two permissions to it: **Account → D1 → Edit** and **Account → Workers R2 Storage → Edit** (skip the R2 line if you chose option B).
3. Under **Account Resources**, choose only your account. Create the token and copy it once; Cloudflare will not show it again.

**C. Hand the key to GitHub, not to anyone**

1. Open `github.com/Shegazy003/LMS_LEGO` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Name `CLOUDFLARE_API_TOKEN`, paste the token, save.
3. Add a second secret named `CLOUDFLARE_ACCOUNT_ID` with the Account ID from A3.
4. Tell the delegate "secrets added". Nobody, including the agents, ever sees the values; the deploy workflow reads them inside GitHub.

## What the deploy build task will contain (for the team)

- A GitHub Actions workflow `deploy.yml` that runs only on manual start (`workflow_dispatch`) from `main`, builds the production bundle, applies the D1 migrations, and runs `wrangler deploy`. It never runs on pull requests, and the test hooks stay compiled out (the production guard already proves this).
- The owner's last-resort reset (password and recovery code both lost): a documented one-line Wrangler command against the production database, run only by the account holder, tested against the local emulation.
- The README's "First deploy" section, pointing to this page.
- Re-read the Cloudflare free-tier figures and WhatsApp rates on the official pages and record any change in `docs/03-HOSTING-DECISION.md`.

## Rollback

- A bad deploy: `wrangler rollback` or one click in the Cloudflare dashboard returns the previous version; migrations are additive, so data is untouched.
- Abandoning Cloudflare entirely: delete the Worker, the D1 database and the R2 bucket in the dashboard, then delete the API token. Nothing else holds data.
