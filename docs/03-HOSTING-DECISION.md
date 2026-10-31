# Decision 001: hosting at zero recurring cost

**Date:** 31 October 2026. **Status:** PROPOSED to the owner (the account is a RED item: the owner creates it). Everything else in this decision is AMBER and reversible.

## The decision

Host LMS Lego on **Cloudflare's free plan**: Workers for the application, D1 for the database, R2 for uploaded files. One deployment serves every space. The free `*.workers.dev` address works from day one for the pilot; the owner's own domain (about $10 a year, bought by the owner) is recommended before a second organization, so the product carries the owner's name (open question 7 in the contract).

| Need | Service | Free allowance (checked 31 October 2026) | What it means for a school of 300 people |
|---|---|---|---|
| Application and pages | Workers | 100,000 requests per day | About 300 page views per person per day; far more than a school uses |
| Database | D1 | 5 million rows read and 100,000 rows written per day; 5 GB storage; queries stop until midnight UTC when a daily limit is exceeded (enforced since 1 September 2026) | Writes are the tight one: every sign-in, upload and edit is a write. 100,000 a day is still roughly 300 per person |
| PDFs and images | R2 | 10 GB stored, 1 million writes and 10 million reads per month, **no download charges** | Roughly 2,000 lesson PDFs of 5 MB; downloads are free however many times students open them |
| Videos | Links to YouTube (unlisted), Vimeo or Google Drive | Free | The lesson stores the link; the video never touches our storage |
| Sign-in | Username and password set by the appointing person; server-side sessions in D1 | Free | No email service is needed |
| Tests | GitHub Actions on a private repository | 2,000 minutes per month on the free plan | Each run is about 2 minutes |

Recurring cost: **$0** while within those lines. First paid step if a line is crossed: the Workers Paid plan at $5 per month, which lifts every limit above at once. That step is a RED decision for the owner and needs no code change.

## Why this and not the alternatives

| Option | Verdict | Reason |
|---|---|---|
| **Cloudflare free (chosen)** | Yes | Truly recurring free tier, no download fees for files, no server to patch, the whole product is one deployable unit, and the free plan runs forever rather than for a trial year |
| Google Classroom | No | Free and simple, but it is Google's product with Google's names and theme. The owner cannot shape it, brand it or hand it over as their own |
| Frappe Learning on a free Oracle ARM machine | No | The owner would own a Linux server (updates, backups, outages). The official image is not built for ARM, so setup is not simple |
| Frappe Learning on an existing PC with Cloudflare Tunnel | No | The PC must stay on; one power cut or a Windows update takes every school offline |
| Supabase free plus Vercel free | No | Supabase pauses free projects after a week without activity, which a school hits every holiday; Vercel's free plan forbids commercial use |
| Paid VPS ($5 to $10 per month) | Not now | The owner set zero cost as a hard requirement; this is the fallback if Cloudflare's model proves unfit |

## What the Builder should assume (AMBER defaults; change them if a test demands it)

- One Worker written in TypeScript with a small router (Hono), serving **server-rendered HTML**. No front-end framework, no build pipeline beyond Wrangler. A page is a function that returns HTML with the space's labels and theme.
- D1 with SQL migrations committed in the repository. Tests run against a local D1 (Wrangler's Miniflare) in GitHub Actions; no cloud account is needed to run the test suite.
- R2 for uploads, served through the Worker so access control applies to files as well as pages. Uploads are limited to PDF and image types and 25 MB per file.
- Passwords hashed with the Web Crypto PBKDF2 available in Workers; sessions as HTTP-only cookies.
- Right-to-left and left-to-right come from the kit's language; one layout, `dir` attribute set per page.
- Browser-level acceptance tests use Playwright against `wrangler dev` inside GitHub Actions and save screenshots to `evidence/`, which CI uploads.

## Rollback and recovery (non-negotiables kept)

- **Data integrity:** D1 keeps automatic point-in-time history for 30 days on every plan, which is the recovery path for this release; a per-space export that an admin can download is in Later. The owner's home shows storage and daily usage against the free lines so exhaustion is seen before a space goes dark.
- **Security and privacy:** every query is scoped by `space_id`; sessions expire; no secrets in the repository; the owner's Cloudflare account is the only credential and only the owner holds it.
- **Rollback:** Wrangler keeps previous Worker versions; rolling back is one command or one click in the Cloudflare dashboard. Database migrations are written to be additive so a rollback of code never breaks data.
- **Reproducibility:** `wrangler deploy` from a clean checkout of the exact accepted commit produces the live version.

## When to revisit (closed until one of these is true)

- Any daily D1 or Workers limit is hit on two days in one month.
- Uploaded files exceed 8 GB.
- An organization asks for video uploads rather than links.
- An organization requires data to stay in a specific country.

## Owner's one action

Create a free Cloudflare account under the owner's own email, and later a free GitHub secret for deployment. Nobody else ever sees these credentials. Until then, the Builder works entirely in GitHub Actions with local emulation, so nothing waits on the account except the first public address.

Sources checked on 31 October 2026: Cloudflare's D1 pricing and the 1 September 2026 free-tier enforcement changelog, and R2 pricing as reported by current third-party summaries; the Builder re-reads the official pricing pages before the first deploy and notes any change here.
