# First deploy: the owner's bundle

**Date:** 1 November 2026. **Status:** prepared while build task 5 (AT-5) is in progress; used after AT-5 is delivered. Everything here is a RED item for the human owner (accounts, credentials, money, first public publication); the delegate does not act on any of it alone (decision 002).

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
