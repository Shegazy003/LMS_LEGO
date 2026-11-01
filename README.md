# LMS Lego

A learning space that a non-technical owner can shape like Lego bricks and hand to any organization: a school, a university, a company, a training centre. The owner changes the language, the theme, the names of things (teacher or trainer, student or employee, subject or course) and who is in charge. Nothing is rebuilt and no developer is needed.

**Start here**

1. [CURRENT-PROGRESS.md](CURRENT-PROGRESS.md): what is true now, what is next, what is waiting on the owner.
2. [docs/01-PRODUCT-CONTRACT.md](docs/01-PRODUCT-CONTRACT.md): who it is for, the one release promise, the five acceptance tests, what is in and what is postponed.
3. [docs/02-LEGO-MODEL.md](docs/02-LEGO-MODEL.md): the bricks. Kits, canonical concepts, the authority chain and the data model.
4. [docs/03-HOSTING-DECISION.md](docs/03-HOSTING-DECISION.md): the zero-cost hosting choice and when to revisit it.
5. [docs/05-ROADMAP.md](docs/05-ROADMAP.md): the line of releases, why release 1 is small, and when each parked idea comes forward.
6. [docs/04-LATER.md](docs/04-LATER.md): every good idea that is not in this release, with its trigger.
7. [docs/07-FIRST-DEPLOY.md](docs/07-FIRST-DEPLOY.md): the owner's steps and decision for the first public address.

**How the team works** is in [AGENTS.md](AGENTS.md), [docs/00-OPERATING-CONTRACT.md](docs/00-OPERATING-CONTRACT.md) and [docs/06-DELEGATION-AND-ROLES.md](docs/06-DELEGATION-AND-ROLES.md). They are the short working form of the owner's Completion-First Manifesto and the operating model adopted in the `ai-engineering-platform` repository on 15 October 2026. This repository follows the same roles and rules; it does not copy that platform's machinery.

**Rails already in place**

- `npm test` runs every test file (`test/**`) with Node's built-in test runner, including the browser test.
- `.github/workflows/ci.yml` runs the tests on every push to `main` and every pull request, on a fresh GitHub runner, one named step per check (`AT-1 owner shapes a space and appoints its admin`, `AT-4 a learner sees exactly what was assigned`, `AT-3 the publisher builds the subject`, `AT-2 the admin staffs the space and assigns a subject`, the AT-1, AT-4, AT-3 and AT-2 guards, unit tests, type check, rails). This is the trusted test location: the Builder cannot change its results. Chromium is cached between runs in Playwright's folder, keyed on the runner image (`ImageOS`, `ImageVersion`) and the exact Playwright version, and its install is bounded and retried (one earlier run timed out in the download).

## What is built (release 1 so far: AT-1, AT-4, AT-3, AT-2)

One Cloudflare Worker (TypeScript, [Hono](https://hono.dev) router, server-rendered HTML, no front-end framework), D1 for data (`migrations/`), R2 for files. Code in `src/`:

- `app.ts` the routes; `views/` the page templates; `labels.ts` the one label function; `i18n/ui.ts` the product sentences in Arabic and English; `kits/seed.ts` the School, Company and University kits.
- `auth/` passwords (PBKDF2-SHA256, Web Crypto, 100,000 iterations), sessions (HTTP-only cookie, server-side row, 30 days without use), the owner's recovery code.
- `phone.ts` mobile numbers to international form; `files.ts` logo rules (PNG, JPEG or SVG by content, at most 1 MB); `usage.ts` the owner's usage panel; `access.ts` end dates.
- `publishing.ts` the publisher's writes (chapters, lessons, materials, publish, move up and down): each finds its item only inside the space and only in a subject the publisher is responsible for, and each insert or update repeats that check inside its own SQL statement. `views/publish.ts` the publisher's pages. `files.ts` also holds the lesson upload rules.
- `learning.ts` reading subjects, chapters, lessons and materials inside one space: every query names the `space_id` of every table it touches, and visibility follows assignment (admin: the whole space; publisher: their subjects; learner: published subjects assigned to them directly or through a group). `links.ts` keeps only http and https addresses as links.
- `admin.ts` the admin's writes and lookups (people, groups, subjects, who may read a subject), each inside one space; `views/admin.ts` and `views/people.ts` the admin's pages and one person's page (shared with the owner for admins).
- `reset.ts` one-time reset links (token, life, the wa.me link, the fixed message); `views/reset.ts` the page a link opens. `auth/limits.ts` the sign-in rate limit.
- `clock.ts` and `test-hooks.ts`: a movable clock and a seeding route, for tests only (see below).

### Pages inside a space (AT-4)

Every address under `/s/<space>` first checks: signed in, a member of this space, within the start and end dates. After the end date it answers 403 with "Your access to <space> ended on <date>. Contact the <admin label>." in the space's first and second language; before the start date, with "Your access to <space> starts on <date>."

| Address | Who | What |
|---|---|---|
| `/s/<space>` | every member | the home of the person's main role: the admin home (admin), the publisher home (publisher), or the learner home, which lists exactly the published subjects assigned to the learner directly or through a group |
| `/s/<space>/admin`, `/s/<space>/admin/…` | admin only | the admin home and the admin's pages (AT-2, below). Anyone else: **403** |
| `/s/<space>/publish`, `/s/<space>/publish/…` | publisher only | the publisher's pages (AT-3, below). Anyone else: **403** |
| `/s/<space>/learn/<subject>` | whoever may read it | the subject with its chapters and lessons in order |
| `/s/<space>/read/<lesson>` | whoever may read it | the lesson with its materials in order: PDF and image (the image shown in the page), video link and web link (new tab, `rel="noopener noreferrer"`), the note as plain text |
| `/s/<space>/file/<material>` | whoever may read it | the PDF or image from R2, through the Worker, after the same check, with `nosniff`, a sandbox policy and `no-cache` (the browser asks every time, so an ended membership cannot reopen a file from its cache). A stored type that does not fit the kind is only offered as a download |
| `/account` | everyone signed in | My account: change your own password (current password required; every other sign-in of yours ends), in the language of your space |

### The publisher's pages (AT-3)

Everything is under `/s/<space>/publish`, behind the publisher gate, and changes only a subject whose responsible publisher is the person signed in, in this space. Anything else (another publisher's subject, another space's id, a learner, an admin, an expired publisher, a form posted from another site) answers 403 and changes nothing. The address segments are neutral words, not concept names, so a Company space's addresses do not say "subjects".

| Address | What |
|---|---|
| `/s/<space>/publish` | the publisher's home: exactly their own subjects, each a link into its editor, with "published" or "not published yet" |
| `/s/<space>/publish/edit/<subject>` | the subject editor: published or not, with one Publish or Unpublish button; chapters in order, each with its lessons, move up and down, and "add a lesson"; "add a chapter"; a preview link (the learner's view) |
| `…/edit/<subject>/add`, `…/publish`, `…/unpublish` | add a chapter (last); publish; unpublish |
| `/s/<space>/publish/part/<chapter>/add`, `…/move` | add a lesson to a chapter (last); move a chapter up or down |
| `/s/<space>/publish/compose/<lesson>` | the lesson editor: the materials in order as the learner sees them, each with move up and down, then four forms: upload a PDF or an image, add a video link, add a web link, add a note |
| `…/compose/<lesson>/add`, `…/move` | add a material (last); move a lesson up or down |
| `/s/<space>/publish/item/<material>/move` | move a material up or down |

**Publishing** is the subject's `is_published`: before it, a learner assigned to the subject does not see it (not listed, and its addresses answer 403); after it, they see it with its materials in order; unpublishing hides it again at their next page. The publisher always sees their own subject, published or not.

**Upload rules.** PDF, PNG, JPEG, WebP or GIF, at most 25 MB, recognised by the file's first bytes, not by its name or declared type. The kind (PDF or image) and the stored type come from the content. Anything else (a Word file, a web page, plain text, an SVG drawing) is refused with a plain message in the space's language, and nothing is stored. GIF is accepted because it is a plain picture format with no active content. SVG is refused because it is an XML document that can carry scripts; the owner's logo may still be SVG. A request declaring a body far over 25 MB is refused before it is read. Files go to R2 under `spaces/<space>/files/<material>` and are served only through `/s/<space>/file/<material>` with the access check. Video and web links accept only `http` and `https` addresses; a video plays where it is kept (it opens in a new tab), and no third-party frame is embedded. A note is stored as text and always shown escaped.

Anything a person may not read (an id from another space, a subject not assigned to them, an unpublished subject, an id that does not exist) answers the same 403, so an address reveals nothing. Learner pages carry no edit control. Pages follow the kit's labels and the space's first language, right-to-left for Arabic, at phone width; text people typed (titles, notes) keeps its own direction.

### The admin's pages (AT-2)

Everything is under `/s/<space>/admin`, behind the admin gate; anyone else (a publisher, a learner, an expired admin, an admin of another space) gets 403 and nothing changes. Address words are neutral (`people`, `sets`, `topics`), so no address names a concept. The admin's home shows the kit's four labels (Teacher, Student, Class, Subject in a School space); each is the way into its page.

| Address | What |
|---|---|
| `/s/<space>/admin/people` | the space's publishers and learners (name, role, end date, the mobile's **last four digits** only), and the form to appoint one: name, username, first password, role (**publisher or learner only**), mobile typed the local way (010…; for a learner, a parent's number), end date (**not after the admin's own**) |
| `/s/<space>/admin/people/<person>` | one person: **Send reset link by WhatsApp**, and **Set a new password** (every sign-in of that person ends) |
| `…/people/<person>/link` | GET: the confirmation step, "the link will go to the number ending in 3333", one confirming tap. POST (the tap): the link, as a **WhatsApp** button and a **Copy** button side by side |
| `/s/<space>/admin/sets`, `…/sets/<group>` | groups: a name and the learners in it; change who is in it |
| `/s/<space>/admin/topics`, `…/topics/<subject>` | subjects: a title and one responsible publisher; then who may read it (groups and single learners) |

A refused form (an unreadable number, an admin role, an end date past the admin's own, a taken username, an id that is not a publisher, learner or group of this space) shows its plain message in the space's language and stores nothing. Mobiles are read with the space's default country code and stored in international form (`010 2222 3333` → `+201022223333`). People start today (`valid_from`) and end on their end date.

The owner has the same person page for the admins they appointed, at `/owner/spaces/<space>/people/<admin>` (linked from the owner's space page): a new password, or a reset link in the space's first language.

### Reset links (AT-2, contract section 8)

1. The appointer (the admin for publishers and learners, the owner for admins) opens the person's page and presses **Send reset link by WhatsApp**.
2. The page shows the registered number's last four digits and asks for one confirming tap.
3. The tap makes the link and shows it once: a **WhatsApp** button, `https://wa.me/<international digits>?text=<message>`, which opens WhatsApp on the appointer's own phone (or WhatsApp Web) with the message typed in; and a **Copy** button for the same link, for any other channel. The product never sends anything and never calls Meta.
4. The message is a fixed product sentence in the space's first language: it names the space and the sender, gives the product's address, says the link is valid 30 minutes and works once, and puts the link alone on the last line. Nothing the appointer types enters it.
5. The person (or the parent) opens the link: the page shows the space's name and plain instructions, asks for the **username** and a new password.

Safeguards: the token is 256 random bits and only its SHA-256 is stored; the link works for 30 minutes from creation and once; a new link kills every older one of that person; a wrong username does not use the link up, but five wrong usernames kill it; every failed username also counts for the rate limit below; setting the password ends every sign-in of that person; the page sends `Referrer-Policy: no-referrer` and is never cached. The full number appears only in the WhatsApp button's address on the link step: never in a list, a person page, the confirmation step, the reset page or a log.

**What the school must know (contract section 6).** Sending a link through WhatsApp shows the sender's own number to the person who receives it, and puts that person's number into the sender's phone. The school decides whether its admins use a school phone or a personal one. When it collects parents' numbers, it tells them what they are for: only to send a password link. The Copy button exists so the school can choose another channel.

### Sign-in rate limit

Failed attempts at every password door (sign-in, the owner's recovery code, a reset link's username) are counted in D1 per **username** and per **client** (its address as Cloudflare reports it, stored only as a hash). Five failures refuse that username until 15 minutes after the first of them; fifty failures refuse that client until an hour after the first. A refused attempt answers 429 with a plain message ("Too many failed attempts. Try again in N minutes."), checks no password and writes nothing.

Why this design fits the free plan (100,000 database writes a day): a success writes nothing (it removes the username's count only when there is one); a failure writes two rows (one per key) and removes rows whose window has ended, each once; a refused attempt only reads. One client can spend at most about 150 writes an hour, whatever it sends. Counting in each Worker's memory would cost nothing but would not hold: Cloudflare runs many short-lived instances, and an attacker would simply reach a fresh one.

## Run it locally

Needs Node 22. No Cloudflare account: Wrangler emulates the Worker, D1 and R2 on your machine (data in `.wrangler/`).

```sh
npm ci
npm run dev        # applies migrations to the local database, then serves http://localhost:8787
```

Open http://localhost:8787. The first visit asks for the owner account and shows the recovery code once. Then: New space, Appoint admin, sign out, sign in as the admin.

To try the end date, use the test build, which has a movable clock: `npm run dev:test`, then move the clock 31 days ahead with
`curl -X POST localhost:8787/__test/clock -H 'content-type: application/json' -d '{"offsetMs": 2678400000}'` (and `{"offsetMs": 0}` to come back). The production build does not contain this route.

**The learner journey (AT-4).** The admin's pages (AT-2) and the publisher's (AT-3) create all of this in the browser; the test build also has a seeding route as a shortcut. With `npm run dev:test` running, create the owner, a space and its admin in the browser, copy the space id from the address bar, then:

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

**The publisher journey (AT-3).** The admin's pages create the starting point (see the admin journey below); as a shortcut, seed it, then do everything else in the browser:

```sh
curl -X POST localhost:8787/__test/seed -H 'content-type: application/json' -d '{
  "spaceId": "<space id>", "grantedBy": "<admin username>",
  "people": [
    {"username": "hadeer", "password": "hadeer-first-pass", "display_name": "Hadeer", "mobile": "01022223333", "role": "publisher", "valid_until": "2026-12-31"},
    {"username": "shimaa", "password": "shimaa-first-pass", "display_name": "Shimaa", "mobile": "01066667777", "role": "publisher", "valid_until": "2026-12-31"},
    {"username": "salma.learner", "password": "salma-first-pass", "display_name": "Salma", "mobile": "01033334444", "role": "learner", "valid_until": "2026-12-31"}],
  "groups": [{"name": "Science", "members": ["salma.learner"]}],
  "subjects": [{"title": "Mathematics", "publisher": "hadeer", "published": false, "groups": ["Science"]}]
}'
```

**The admin journey (AT-2)** needs no seeding: with `npm run dev`, create the owner, a space (country code +20) and its admin in the browser, sign out, sign in as the admin (a narrow window gives the phone layout). From the admin's home: the Teacher tile opens People (appoint Hadeer and Shimaa as teachers and two students, typing mobiles as 010…); the Class tile opens groups (form Science with the first student); the Subject tile opens subjects (create Mathematics with Hadeer, then tick Science). Open Hadeer from People and press **Send reset link by WhatsApp**: the confirmation shows the last digits; after the tap, the WhatsApp button opens `wa.me` with the message, and Copy copies the link. Open the link in another browser profile, type `hadeer` and a new password. Sign in as Hadeer and publish Mathematics; the first student's home lists it.

Sign in as `hadeer` (use a narrow window for the phone layout): open Mathematics, add the chapter "Fractions", add the lesson "Adding fractions", open it, try uploading a Word file (refused with a plain message), then upload a PDF and an image, add a video link, a web link and a note, and press Publish. In a second browser profile, sign in as `salma.learner`: Mathematics appears only after Publish, and disappears again after Unpublish. Signed in as `shimaa`, Hadeer's editor addresses answer 403.

## Run the tests

```sh
npm ci
npx playwright install chromium   # once, for the browser test
npm test                          # everything
npm run test:unit                 # unit tests only
npm run test:at1                  # AT-1 in Chromium against the Worker running locally
npm run test:at4                  # AT-4 in Chromium, phone width, Arabic
npm run test:at3                  # AT-3 in Chromium, phone width, Arabic
npm run test:at2                  # AT-2 in Chromium, phone width, Arabic
npm run test:at1:midnight         # AT-1 with the Worker's clock starting at 23:59:58 UTC
npm run test:guard:reset          # reset links: single use, username, 30 minutes, who may issue, the number kept private
npm run test:guard:doors          # the sign-in rate limit, and access starting on its start date
npm run test:guard:labels         # no role word hard-coded in a page
npm run test:guard:clock          # the test clock and the seeding route are absent from the production bundle
npm run test:guard:spaces         # a space never reads another space's rows
npm run test:guard:roles          # every admin and publisher route is behind its role gate
npm run typecheck
```

The AT-1 test starts `wrangler dev --env test` on a free port with a fresh database, drives the real pages in Chromium (owner setup, recovery code, sign-in and sign-out, new space with logo and colour, admin appointment, the admin's right-to-left home, the end date, the usage panel) and saves screenshots to `evidence/at-1/` (CI uploads them).

The AT-4 test does the same for the learner: the owner part through the real pages, learners, the group "Science", the subject "Mathematics" with chapter "Fractions", lesson "Adding fractions" and five materials (real PDF and PNG bytes in R2) through the test seeding route; then the first learner's home, password change, the subject, the lesson and all five materials; the second learner refused; role gating; and the "access ended" message after the first learner's end date. Screenshots go to `evidence/at-4/`.

The AT-3 test seeds only the starting point (people, the group Science, the empty subject Mathematics assigned to Hadeer; the admin screens are task 4). Everything Hadeer does goes through her real pages in Chromium at phone width in Arabic: her home, chapter "Fractions", lesson "Adding fractions", three disguised files and two non-http links refused with the plain message (plus a file over 25 MB), the PDF, image, video link, web link and note in order, publish (the assigned learner sees nothing before and the five materials in order after, opening each), unpublish, and moving up and down. Then refusals: Shimaa (who edits her own subject) gets 403 on Hadeer's editor and on every editing action; so do a learner, the admin and an expired publisher; writes cannot reach another space's subject; cross-site and origin-less forms, uploads included, are refused; and nothing is stored or changed by any refusal. Screenshots go to `evidence/at-3/`.

The role guard (`test/guards/role-gates.test.ts`) reads the router's own route table (and the middleware the router declares through its `use()` helper, so a catch-all handler that happens to take two parameters is still a handler) and fails if a route that changes data, or that serves an admin, publisher or owner page, is registered outside `/s/<space>/admin/*`, `/s/<space>/publish/*` or `/owner`, or before that prefix's gate, apart from a short named list (setup, sign-in, sign-out, recovery, own password, the test-only hooks). A self-check proves it catches planted violations. A live sweep then calls every gated route, by its own method and with real ids, as a learner, an admin and a publisher, and expects 403 wherever the role is missing.

The AT-2 test needs no seeding route at all: the owner, the space and its admin come from the owner's real forms; every admin action goes through the admin's real pages in Chromium at phone width in Arabic: appointing Hadeer, Shimaa and two learners (an unreadable number, an admin role and an end date past the admin's own are refused), the group Science, the subject Mathematics and its assignments, reset links for Hadeer and the first learner (last digits, one tap, the WhatsApp and Copy buttons side by side, the decoded message compared word for word, the clipboard, a wrong username, a second use, a fresh link killing the old one, 30-minute expiry), a new password set directly, and the four homes (Hadeer publishes through her own screen). Screenshots go to `evidence/at-2/`. The reset-link guard (`test/guards/reset-links.test.ts`) checks the same rules at request level, plus the stored hash, the bounded attempts, sessions ending, who may issue (and that refusals store nothing), the number never in a page or the log, and the owner's side. The doors guard (`test/guards/doors.test.ts`) checks the rate limit (per username, per client, no writes when refused, reset usernames counted) and `valid_from`.

The AT-1 test takes "today" from the Worker's clock and sets the clock to fixed times of the end date, so it passes whenever it runs; `npm run test:at1:midnight` (a CI step) starts the Worker's clock two seconds before midnight UTC to prove it.

The space guard (`test/guards/space-isolation.test.ts`) scans every SQL statement under `src/` and fails if one touches a space's table without naming its `space_id`; checks that every space table carries `space_id` and that the database refuses a child row pointing into another space; and, against the running Worker, that a learner and an admin of one space get 403 and nothing of another space's subject, lesson and files, by either space's address, with real ids.

## How the test hooks are kept out of production

`wrangler.jsonc` sets the build constant `__TEST_HOOKS__` to `false` for production and `true` only in `env.test`. The clock route and the seeding route (`/__test/clock`, `/__test/seed`, both in `src/test-hooks.ts`) are registered behind `if (__TEST_HOOKS__)`, so the production build removes them entirely; each also needs the runtime flag `TEST_HOOKS=1`, which only `env.test` sets. `test/guards/production-guard.test.ts` builds both bundles and fails if the production one contains either route, the seeding code or the flag (and if the test one lacks them, so the check means something).

## Known limits

- **Usage counts are approximate.** Requests and database writes are counted in memory in each Worker instance and added to the day's row at most once a minute (one database write per instance per minute at most, so counting never costs a write per request). Counts an instance holds when Cloudflare shuts it down are lost, so the panel can read a little low, never high. Files stored is read from R2 itself on each owner home view (one list call per 1,000 files).
- **Dates are UTC days.** An end date means access through that UTC day; it ends at 00:00 UTC the next day (02:00 or 03:00 in Egypt).
- **Learner pages read, they do not edit.** Publishers build content through their pages (AT-3); admins create people, groups and subjects (AT-2).
- **The admin adds; nothing is renamed, ended early, extended or removed yet.** A person's end date, a group's name and a subject's title cannot be changed from the screens, and nobody can be removed. Group members and a subject's readers and publisher can be changed.
- **The rate limit can be used against a person.** Anyone who knows a username can refuse it for 15 minutes with five wrong passwords (that person's appointer can still set a new password, but sign-in waits out the 15 minutes). A school behind one address shares the client allowance of 50 failures an hour. The client key is an unsalted hash of the address (an IPv4 address could be recovered by trying them all); its row is removed once its window has ended and another failure arrives.
- **A reset link sets the password; it does not sign the person in.** They sign in with it straight after. If the password write fails after the link was claimed, the link is spent and the appointer makes a new one.
- **The owner's reset message names the owner by their username** (the owner account has no separate display name).
- **The publisher adds, orders and publishes; nothing is renamed or removed yet.** A wrong material or chapter cannot be deleted or renamed from the screens in this release (the journey in the Lego model is add, reorder, publish). A file stays in R2 for as long as its material exists.
- **Uploads are read whole into the Worker's memory** (at most 25 MB, plus a little form overhead; a larger declared body is refused before reading). Uploading a file costs one R2 write and one database write.
- **A file opened in the browser shows in its own viewer.** Chromium and Firefox show PDFs inline; a phone may download the PDF instead. Images show in the lesson page.
- **Published is all or nothing.** Publishing shows the whole subject to whoever it is assigned to; there are no drafts of single lessons.
- **Visibility is checked per request.** A learner removed from a group, or a subject unpublished, disappears at their next page; a file already downloaded stays on their device.
- **One space's language per person on My account.** The page follows the person's latest membership; a person in two spaces with different first languages sees the language of that one.
- **Owner last resort** (both password and recovery code lost): not built in this task. It needs a short documented step for the Cloudflare account holder; it belongs with the first deploy.
- **Pages outside a space** (sign-in, setup, owner) follow the browser's language: Arabic if the browser prefers it, otherwise English. Inside a space, pages use the space's first language.
- **Dev tooling:** `npm audit` reports advisories in the `undici` copy bundled with Wrangler 4.149 (used only for local emulation and tests, never deployed). The fixed Wrangler releases were under two weeks old when this was pinned; update Wrangler in a later task.

## Deploy and rollback

Deploying is the owner's step (it needs the owner's Cloudflare account; see the hosting decision). `wrangler.jsonc` holds no account id, database id or secret. On the first `wrangler deploy`, Wrangler's automatic provisioning creates the D1 database and the R2 bucket in the owner's account (if the installed Wrangler does not, create them with `wrangler d1 create lms-lego` and `wrangler r2 bucket create lms-lego-files`). Then `wrangler d1 migrations apply lms-lego --remote`. Re-read the free-plan figures in the hosting decision before the first deploy.

- **Roll back the code:** Wrangler keeps previous versions of the Worker; `wrangler rollback` (or one click under the Worker's Deployments in the Cloudflare dashboard) returns to the previous version.
- **Data:** migrations are additive (new tables and columns only), so older code keeps working with a newer database. D1 keeps 30 days of point-in-time history for recovery. Task 4 adds `migrations/0003_people.sql` (`reset_link`, `attempt_limit`); code from before it ignores both tables.

**Origin.** The brainstorm that led here compared Moodle, Open edX, Canvas, Frappe Learning, LearnHouse, Chamilo, BookStack and Google Classroom, and ended at two conclusions: the owner's real need is small (subject, chapter, lesson, material, with controlled access), and zero recurring cost is a hard requirement. Both conclusions shaped the product contract and the hosting decision.
