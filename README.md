# LMS Lego

A learning space that a non-technical owner can shape like Lego bricks and hand to any organization: a school, a university, a company, a training centre. The owner changes the language, the theme, the names of things (teacher or trainer, student or employee, subject or course) and who is in charge. Nothing is rebuilt and no developer is needed.

**Start here**

1. [CURRENT-PROGRESS.md](CURRENT-PROGRESS.md): what is true now, what is next, what is waiting on the owner.
2. [docs/01-PRODUCT-CONTRACT.md](docs/01-PRODUCT-CONTRACT.md): who it is for, the one release promise, the five acceptance tests, what is in and what is postponed.
3. [docs/02-LEGO-MODEL.md](docs/02-LEGO-MODEL.md): the bricks. Kits, canonical concepts, the authority chain and the data model.
4. [docs/03-HOSTING-DECISION.md](docs/03-HOSTING-DECISION.md): the zero-cost hosting choice and when to revisit it.
5. [docs/05-ROADMAP.md](docs/05-ROADMAP.md): the line of releases, why release 1 is small, and when each parked idea comes forward.
6. [docs/04-LATER.md](docs/04-LATER.md): every good idea that is not in this release, with its trigger.

**How the team works** is in [AGENTS.md](AGENTS.md), [docs/00-OPERATING-CONTRACT.md](docs/00-OPERATING-CONTRACT.md) and [docs/06-DELEGATION-AND-ROLES.md](docs/06-DELEGATION-AND-ROLES.md). They are the short working form of the owner's Completion-First Manifesto and the operating model adopted in the `ai-engineering-platform` repository on 15 October 2026. This repository follows the same roles and rules; it does not copy that platform's machinery.

**Rails already in place**

- `npm test` runs every test file (`test/**`) with Node's built-in test runner, including the browser test.
- `.github/workflows/ci.yml` runs the tests on every push to `main` and every pull request, on a fresh GitHub runner, one named step per check (`AT-1 owner shapes a space and appoints its admin`, `AT-4 a learner sees exactly what was assigned`, the AT-1 and AT-4 guards, unit tests, type check, rails). This is the trusted test location: the Builder cannot change its results.

## What is built (release 1 so far: AT-1, AT-4)

One Cloudflare Worker (TypeScript, [Hono](https://hono.dev) router, server-rendered HTML, no front-end framework), D1 for data (`migrations/`), R2 for files. Code in `src/`:

- `app.ts` the routes; `views/` the page templates; `labels.ts` the one label function; `i18n/ui.ts` the product sentences in Arabic and English; `kits/seed.ts` the School, Company and University kits.
- `auth/` passwords (PBKDF2-SHA256, Web Crypto, 100,000 iterations), sessions (HTTP-only cookie, server-side row, 30 days without use), the owner's recovery code.
- `phone.ts` mobile numbers to international form; `files.ts` logo rules (PNG, JPEG or SVG by content, at most 1 MB); `usage.ts` the owner's usage panel; `access.ts` end dates.
- `learning.ts` reading subjects, chapters, lessons and materials inside one space: every query names the `space_id` of every table it touches, and visibility follows assignment (admin: the whole space; publisher: their subjects; learner: published subjects assigned to them directly or through a group). `links.ts` keeps only http and https addresses as links.
- `clock.ts` and `test-hooks.ts`: a movable clock and a seeding route, for tests only (see below).

### Pages inside a space (AT-4)

Every address under `/s/<space>` first checks: signed in, a member of this space, within the end date. After the end date it answers 403 with "Your access to <space> ended on <date>. Contact the <admin label>." in the space's first and second language.

| Address | Who | What |
|---|---|---|
| `/s/<space>` | every member | the home of the person's main role: the admin home (admin), the publisher home (publisher), or the learner home, which lists exactly the published subjects assigned to the learner directly or through a group |
| `/s/<space>/admin`, `/s/<space>/admin/…` | admin only | the admin home; the admin screens of task 4 go here. Anyone else: **403** |
| `/s/<space>/publish`, `/s/<space>/publish/…` | publisher only | a read-only list of the publisher's subjects; the subject editor of task 3 goes here. Anyone else: **403** |
| `/s/<space>/learn/<subject>` | whoever may read it | the subject with its chapters and lessons in order |
| `/s/<space>/read/<lesson>` | whoever may read it | the lesson with its materials in order: PDF and image (the image shown in the page), video link and web link (new tab, `rel="noopener noreferrer"`), the note as plain text |
| `/s/<space>/file/<material>` | whoever may read it | the PDF or image from R2, through the Worker, after the same check, with `nosniff`, a sandbox policy and `no-cache` (the browser asks every time, so an ended membership cannot reopen a file from its cache). A stored type that does not fit the kind is only offered as a download |
| `/account` | everyone signed in | My account: change your own password (current password required; every other sign-in of yours ends), in the language of your space |

Anything a person may not read (an id from another space, a subject not assigned to them, an unpublished subject, an id that does not exist) answers the same 403, so an address reveals nothing. Learner pages carry no edit control. Pages follow the kit's labels and the space's first language, right-to-left for Arabic, at phone width; text people typed (titles, notes) keeps its own direction.

## Run it locally

Needs Node 22. No Cloudflare account: Wrangler emulates the Worker, D1 and R2 on your machine (data in `.wrangler/`).

```sh
npm ci
npm run dev        # applies migrations to the local database, then serves http://localhost:8787
```

Open http://localhost:8787. The first visit asks for the owner account and shows the recovery code once. Then: New space, Appoint admin, sign out, sign in as the admin.

To try the end date, use the test build, which has a movable clock: `npm run dev:test`, then move the clock 31 days ahead with
`curl -X POST localhost:8787/__test/clock -H 'content-type: application/json' -d '{"offsetMs": 2678400000}'` (and `{"offsetMs": 0}` to come back). The production build does not contain this route.

**The learner journey (AT-4).** The admin and publisher screens that create learners, groups, subjects and content come in later tasks, so the test build has a seeding route for them. With `npm run dev:test` running, create the owner, a space and its admin in the browser, copy the space id from the address bar, then:

```sh
curl -X POST localhost:8787/__test/seed -H 'content-type: application/json' -d '{
  "spaceId": "<space id>", "grantedBy": "<admin username>",
  "people": [{"username": "salma.learner", "password": "salma-first-pass", "display_name": "Salma",
              "mobile": "01033334444", "role": "learner", "valid_until": "2026-12-31"}],
  "groups": [{"name": "Science", "members": ["salma.learner"]}],
  "subjects": [{"title": "Mathematics", "published": true, "groups": ["Science"],
    "chapters": [{"title": "Fractions", "lessons": [{"title": "Adding fractions", "materials": [
      {"kind": "link", "title": "Practice online", "url": "https://example.org/"},
      {"kind": "note", "title": "Remember", "text": "1/4 + 2/4 = 3/4"}]}]}]}]
}'
```

A PDF or an image is `{"kind": "pdf", "title": "…", "base64": "<file bytes in base64>", "contentType": "application/pdf"}` (or `"image"` with `image/png`, `image/jpeg`). Then sign in as `salma.learner`. The production build does not contain this route either.

## Run the tests

```sh
npm ci
npx playwright install chromium   # once, for the browser test
npm test                          # everything
npm run test:unit                 # unit tests only
npm run test:at1                  # AT-1 in Chromium against the Worker running locally
npm run test:at4                  # AT-4 in Chromium, phone width, Arabic
npm run test:guard:labels         # no role word hard-coded in a page
npm run test:guard:clock          # the test clock and the seeding route are absent from the production bundle
npm run test:guard:spaces         # a space never reads another space's rows
npm run typecheck
```

The AT-1 test starts `wrangler dev --env test` on a free port with a fresh database, drives the real pages in Chromium (owner setup, recovery code, sign-in and sign-out, new space with logo and colour, admin appointment, the admin's right-to-left home, the end date, the usage panel) and saves screenshots to `evidence/at-1/` (CI uploads them).

The AT-4 test does the same for the learner: the owner part through the real pages, learners, the group "Science", the subject "Mathematics" with chapter "Fractions", lesson "Adding fractions" and five materials (real PDF and PNG bytes in R2) through the test seeding route; then the first learner's home, password change, the subject, the lesson and all five materials; the second learner refused; role gating; and the "access ended" message after the first learner's end date. Screenshots go to `evidence/at-4/`.

The space guard (`test/guards/space-isolation.test.ts`) scans every SQL statement under `src/` and fails if one touches a space's table without naming its `space_id`; checks that every space table carries `space_id` and that the database refuses a child row pointing into another space; and, against the running Worker, that a learner and an admin of one space get 403 and nothing of another space's subject, lesson and files, by either space's address, with real ids.

## How the test hooks are kept out of production

`wrangler.jsonc` sets the build constant `__TEST_HOOKS__` to `false` for production and `true` only in `env.test`. The clock route and the seeding route (`/__test/clock`, `/__test/seed`, both in `src/test-hooks.ts`) are registered behind `if (__TEST_HOOKS__)`, so the production build removes them entirely; each also needs the runtime flag `TEST_HOOKS=1`, which only `env.test` sets. `test/guards/production-guard.test.ts` builds both bundles and fails if the production one contains either route, the seeding code or the flag (and if the test one lacks them, so the check means something).

## Known limits

- **Usage counts are approximate.** Requests and database writes are counted in memory in each Worker instance and added to the day's row at most once a minute (one database write per instance per minute at most, so counting never costs a write per request). Counts an instance holds when Cloudflare shuts it down are lost, so the panel can read a little low, never high. Files stored is read from R2 itself on each owner home view (one list call per 1,000 files).
- **Dates are UTC days.** An end date means access through that UTC day; it ends at 00:00 UTC the next day (02:00 or 03:00 in Egypt).
- **Learner pages read, they do not edit.** Creating learners, groups, subjects and content through screens is tasks 3 (publisher) and 4 (admin); until then they exist only through the test seeding route.
- **Visibility is checked per request.** A learner removed from a group, or a subject unpublished, disappears at their next page; a file already downloaded stays on their device.
- **One space's language per person on My account.** The page follows the person's latest membership; a person in two spaces with different first languages sees the language of that one.
- **No sign-in rate limit yet.** Each attempt costs a full PBKDF2 hash, which slows guessing, but repeated attempts are not blocked.
- **Owner last resort** (both password and recovery code lost): not built in this task. It needs a short documented step for the Cloudflare account holder; it belongs with the first deploy.
- **Pages outside a space** (sign-in, setup, owner) follow the browser's language: Arabic if the browser prefers it, otherwise English. Inside a space, pages use the space's first language.
- **Dev tooling:** `npm audit` reports advisories in the `undici` copy bundled with Wrangler 4.149 (used only for local emulation and tests, never deployed). The fixed Wrangler releases were under two weeks old when this was pinned; update Wrangler in a later task.

## Deploy and rollback

Deploying is the owner's step (it needs the owner's Cloudflare account; see the hosting decision). `wrangler.jsonc` holds no account id, database id or secret. On the first `wrangler deploy`, Wrangler's automatic provisioning creates the D1 database and the R2 bucket in the owner's account (if the installed Wrangler does not, create them with `wrangler d1 create lms-lego` and `wrangler r2 bucket create lms-lego-files`). Then `wrangler d1 migrations apply lms-lego --remote`. Re-read the free-plan figures in the hosting decision before the first deploy.

- **Roll back the code:** Wrangler keeps previous versions of the Worker; `wrangler rollback` (or one click under the Worker's Deployments in the Cloudflare dashboard) returns to the previous version.
- **Data:** migrations are additive (new tables and columns only), so older code keeps working with a newer database. D1 keeps 30 days of point-in-time history for recovery.

**Origin.** The brainstorm that led here compared Moodle, Open edX, Canvas, Frappe Learning, LearnHouse, Chamilo, BookStack and Google Classroom, and ended at two conclusions: the owner's real need is small (subject, chapter, lesson, material, with controlled access), and zero recurring cost is a hard requirement. Both conclusions shaped the product contract and the hosting decision.
