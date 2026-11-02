# LMS Lego

A learning space that a non-technical owner can shape like Lego bricks and hand to any organization: a school, a university, a company, a training centre. The owner changes the language, the theme, the names of things (teacher or trainer, student or employee, subject or course) and who is in charge. Nothing is rebuilt and no developer is needed.

**Start here**

0. **New session? Start with [docs/08-HANDOVER.md](docs/08-HANDOVER.md).**
1. [CURRENT-PROGRESS.md](CURRENT-PROGRESS.md): what is true now, what is next, what is waiting on the owner.
2. [docs/01-PRODUCT-CONTRACT.md](docs/01-PRODUCT-CONTRACT.md): who it is for, the one release promise, the five acceptance tests, what is in and what is postponed.
3. [docs/02-LEGO-MODEL.md](docs/02-LEGO-MODEL.md): the bricks. Kits, canonical concepts, the authority chain and the data model.
4. [docs/03-HOSTING-DECISION.md](docs/03-HOSTING-DECISION.md): the zero-cost hosting choice and when to revisit it.
5. [docs/05-ROADMAP.md](docs/05-ROADMAP.md): the line of releases, why release 1 is small, and when each parked idea comes forward.
6. [docs/04-LATER.md](docs/04-LATER.md): every good idea that is not in this release, with its trigger.
7. [docs/07-FIRST-DEPLOY.md](docs/07-FIRST-DEPLOY.md): the owner's steps and decision for the first public address; the team's side is the README section "First deploy".

**How the team works** is in [AGENTS.md](AGENTS.md), [docs/00-OPERATING-CONTRACT.md](docs/00-OPERATING-CONTRACT.md) and [docs/06-DELEGATION-AND-ROLES.md](docs/06-DELEGATION-AND-ROLES.md). They are the short working form of the owner's Completion-First Manifesto and the operating model adopted in the `ai-engineering-platform` repository on 15 October 2026. This repository follows the same roles and rules; it does not copy that platform's machinery.

**Rails already in place**

- `npm test` runs every test file (`test/**`) with Node's built-in test runner, including the browser test.
- `.github/workflows/ci.yml` runs the tests on every push to `main` and every pull request, on a fresh GitHub runner, one named step per check (`AT-1 owner shapes a space and appoints its admin`, `AT-4 a learner sees exactly what was assigned`, `AT-3 the publisher builds the subject`, `AT-2 the admin staffs the space and assigns a subject`, `AT-5 the kit changes every word, and no code changes`, the AT-1, AT-4, AT-3, AT-2 and AT-5 guards, unit tests, type check, rails). This is the trusted test location: the Builder cannot change its results. Chromium is cached between runs in Playwright's folder, keyed on the runner image (`ImageOS`, `ImageVersion`) and the exact Playwright version, and its install is bounded and retried (one earlier run timed out in the download).

## What is built (release 1: AT-1, AT-4, AT-3, AT-2, AT-5; release 1.1: AT-6, AT-7, AT-8)

One Cloudflare Worker (TypeScript, [Hono](https://hono.dev) router, server-rendered HTML, no front-end framework), D1 for data (`migrations/`), R2 for files. Code in `src/`:

- `app.ts` the routes; `views/` the page templates; `labels.ts` the one label function; `i18n/ui.ts` the product sentences in Arabic and English; `kits/seed.ts` the School, Company and University kits.
- `auth/` passwords (PBKDF2-SHA256, Web Crypto; the strength is a setting, 100,000 iterations by default, see "Password strength"), sessions (HTTP-only cookie, server-side row, 30 days without use), the owner's recovery code.
- `phone.ts` mobile numbers to international form; `files.ts` logo rules (PNG, JPEG or SVG by content, at most 1 MB); `usage.ts` the owner's usage panel; `access.ts` end dates.
- `publishing.ts` the publisher's writes (chapters, lessons, materials, publish, move up and down): each finds its item only inside the space and only in a subject the publisher is responsible for, and each insert or update repeats that check inside its own SQL statement; from release 1.1 also renaming a chapter, a lesson or a material and replacing a material's file. `removal.ts` removing and restoring a chapter, a lesson or a material (one soft statement each; nothing is deleted) and "Recently removed". `views/publish.ts` the publisher's pages. `files.ts` also holds the lesson upload rules.
- `learning.ts` reading subjects, chapters, lessons and materials inside one space: every query names the `space_id` of every table it touches, never reads a removed chapter, lesson or material (release 1.1), and visibility follows assignment (admin: the whole space; publisher: their subjects; learner: published subjects assigned to them directly or through a group). `links.ts` keeps only http and https addresses as links.
- `admin.ts` the admin's writes and lookups (people, groups, subjects, who may read a subject), each inside one space, and from release 1.1 the search and the corrections (name, mobile, end date, End access now, Restore access) and renaming groups and subjects; `views/admin.ts` and `views/people.ts` the admin's pages and one person's page (shared with the owner for admins).
- `reset.ts` one-time reset links (token, life, the wa.me link, the fixed message); `views/reset.ts` the page a link opens. `auth/limits.ts` the sign-in rate limit.
- `kits/edit.ts` the owner's kit editor rules (labels, kit switch); `names.ts` the bounds on usernames, display names and labels.
- `clock.ts` and `test-hooks.ts`: a movable clock, a seeding route and the running Worker's boot identity, for tests only (see below).

### The kit editor (AT-5)

On the owner's page for one space (`/owner/spaces/<id>`), owner only:

- **Switch the kit** to School, Company or University. The form says, in place, that switching replaces every name in the space with the chosen kit's names, including names the owner edited. The first press opens a confirm step on its own page (no browser `confirm()`): it repeats the warning and offers **Yes, replace the names** or **Cancel**. Only the confirming press writes.
- **What a switch replaces:** the space's own kit row takes a fresh copy of the chosen seed kit's name, labels and reserved settings. **What it keeps:** the space's languages and theme (logo and colour), and everything outside the kit row: people, memberships, groups, assignments, subjects, chapters, lessons and materials are not touched (AT-5 checks every row).
- **Edit any name** of any of the nine concepts in each of the space's languages (one box per language and concept; each concept is described in plain words so the owner knows which name it is). Each name is 1 to 40 characters on one line; every language must carry exactly the nine keys; names are stored as typed and escaped wherever they are shown. Saving edits only this space's kit row: never the seed kits (product constants in `src/kits/seed.ts`) and never another space.
- **Edit the theme:** a new colour and, optionally, a new logo (same rules as at creation: PNG, JPEG or SVG by content, at most 1 MB).
- Each form writes one statement on this space's kit row, and only the part it edits (`json_set`), so the three forms never overwrite each other. **No code change and no deploy is needed to relabel**: every page reads its words through the one label function from the space's kit row.

### My account: language (AT-5)

My account shows the language of the person's pages and a link, **Change the language**, to `/account/language`: a choice among the languages of the person's space (their latest membership; for the owner, who has none, Arabic and English), each named in its own words. The choice is stored per person (`user.lang`, `migrations/0004_person_language.sql`). Inside a space it decides the page language and direction (`dir="rtl"` for Arabic, `dir="ltr"` for English) of that person's pages when the space offers that language; without a choice the space's first language applies, as before. Outside any space, a signed-in person's pages follow their stored choice when there is one (simpler than a separate rule); otherwise they keep today's behaviour (the browser's language). The WhatsApp reset message stays in the space's first language whatever the sender reads. The language choice has its own page so that My account keeps one form besides signing out (AT-4 checks that).

### Bounds and cross-origin forms (AT-5 carried items)

- **Usernames** are at most 32 characters wherever one is accepted (every username box says so with `maxlength`). At a password door (sign-in, recovery code, reset link) a longer one is read as no username at all: it matches no account and never builds a longer rate-limit key.
- **Display names** are 1 to 100 characters on one line (no line breaks, tabs, separators or bidirectional controls) on both appoint forms, so the fixed WhatsApp message keeps its four lines and stays short.
- **Every form refuses a post from another site or with no Origin**, whatever the body type (form, multipart, text or JSON): a request that may change something must carry this site's own Origin (or a browser's same-origin `Sec-Fetch-Site`).
- The Arabic "access ended" sentence names whom to contact after «للتواصل:», so it reads correctly with any admin label; the Arabic link hint isolates `http://` and `https://` left-to-right.

### Pages inside a space (AT-4)

Every address under `/s/<space>` first checks: signed in, a member of this space, within the start and end dates and not ended with "End access now" (release 1.1). After the end date (or from the moment of End access now, with that day's date) it answers 403 with "Your access to <space> ended on <date>. Contact the <admin label>." in the space's first and second language; before the start date, with "Your access to <space> starts on <date>."

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
| `/s/<space>/publish/part/<chapter>`, `/s/<space>/publish/item/<material>` | one chapter's page, one material's page (release 1.1, AT-8): rename it; for a PDF or an image, replace the file; the way to remove it |
| `…/part/<chapter>/name`, `…/compose/<lesson>/name`, `…/item/<material>/name` | POST: the new title (the lesson's rename form is on the lesson editor) |
| `…/item/<material>/file` | POST: the replacement file (same kind: a PDF for a PDF, an image for an image) |
| `…/part/<chapter>/remove`, `…/compose/<lesson>/remove`, `…/item/<material>/remove` | GET: the remove step, a page that names the item (Cancel is a plain link back); POST: remove it |
| `…/part/<chapter>/restore`, `…/compose/<lesson>/restore`, `…/item/<material>/restore` | POST: restore it, in its old place |
| `/s/<space>/publish/edit/<subject>/removed` | Recently removed: everything removed in that subject, newest first, each with Restore |

**Publishing** is the subject's `is_published`: before it, a learner assigned to the subject does not see it (not listed, and its addresses answer 403); after it, they see it with its materials in order; unpublishing hides it again at their next page. The publisher always sees their own subject, published or not.

**Upload rules.** PDF, PNG, JPEG, WebP or GIF, at most 25 MB, recognised by the file's first bytes, not by its name or declared type. The kind (PDF or image) and the stored type come from the content. Anything else (a Word file, a web page, plain text, an SVG drawing) is refused with a plain message in the space's language, and nothing is stored. GIF is accepted because it is a plain picture format with no active content. SVG is refused because it is an XML document that can carry scripts; the owner's logo may still be SVG. A request declaring a body far over 25 MB is refused before it is read. Files go to R2 under `spaces/<space>/files/<material>` and are served only through `/s/<space>/file/<material>` with the access check. Video and web links accept only `http` and `https` addresses; a video plays where it is kept (it opens in a new tab), and no third-party frame is embedded. A note is stored as text and always shown escaped.

Anything a person may not read (an id from another space, a subject not assigned to them, an unpublished subject, an id that does not exist) answers the same 403, so an address reveals nothing. From release 1.1 a lesson or a file that was removed answers "not found" (404) to someone who may read its subject (403 to anyone else). Learner pages carry no edit control.

### Correcting content (release 1.1, AT-8)

The publisher corrects her own content from the screens; nothing is lost by a mistaken tap, and nothing is deleted.

- **Rename** a chapter (on its own page: "Change" under the chapter in the subject editor), a lesson (on the lesson editor) or a material (on its own page: "Change" under the material in the lesson editor). A title is 1 to 100 characters on one line, the same rule as renaming a group or a subject (AT-7); a refused title is said plainly and nothing is stored. Only the title changes; every page reads it from the row, so learners see it at their next page.
- **Replace a file.** On a PDF's (or an image's) own page, "Replace the file" takes another file of the same kind, checked exactly like an upload (recognised by its content, at most 25 MB). The title, the place and the address stay the same. The new bytes are stored under a new key (`spaces/<space>/files/<material>/<random>`) and one statement switches the material to them, so the address serves the new file at once; its ETag differs, so a browser's cached copy of the old file is never confirmed (no "not modified"). The old file is **kept** in storage (see AMBER choices below) and still counted on the owner's usage panel; it is no longer served by any address.
- **Remove** a material, a lesson or a chapter. "Remove" opens a step, a page that names the item; "Yes, remove it" removes it, Cancel goes back and changes nothing. Visiting any address with a plain link (GET) never removes anything. A removal is one database statement that marks the item's own row removed (`removed_at`, `migrations/0006_content_removed.sql`): the row, its place, its children and its file stay exactly as they were, so it cannot be left half done. A removed item disappears from every page at once (the learner's home, subject page and lesson page, the publisher's editor and preview, the admin's preview), and its address, and the file link of a removed material, answer "not found".
- **What still shows comes first.** A lesson that still shows a material, or a chapter that still shows a lesson, is refused with a plain message that names what to remove first (and lists it); the check is inside the same statement as the removal.
- **Recently removed** (a link at the bottom of the subject editor and the lesson editor) lists everything removed in that subject, newest first, with where it sat and the day it was removed. **Restore** puts an item back in its old place with the same file (moving other items while it was removed skips it and keeps its place). An item inside a removed lesson or chapter waits for that one: restore the chapter, then the lesson, then the material. Removed items stay in storage and stay counted on the owner's usage panel (emptying "Recently removed" is release 1.1 Later).
- **Who may.** Only the subject's responsible publisher: every address is under `/s/<space>/publish/*`, so the publisher gate and the cross-origin check cover it, and every lookup and write repeats the ownership check inside its statement. Another publisher, an admin, a learner and a forged or origin-less post get 403 and nothing changes.

**AMBER choices (build task 12).** (1) A replaced file's old object is **kept** in R2, not deleted, under "nothing is deleted in this release"; it costs storage (counted on the usage panel) and is not reachable from any screen or address. Undo: a later task may list or delete those objects (they sit under their material's own prefix, `spaces/<space>/files/<material>/`), or this choice can be reversed in code by deleting the old key after the switch, as the theme does for logos. (2) A removed lesson or file answers 404 "not found" to people who may read its subject, while every other unreadable address keeps the release 1 answer, 403. Undo: answer 403 for removed items too (one line in `app.ts`). (3) Restoring an item inside a removed lesson or chapter is refused (restore the holder first) rather than restoring the holder with it. Undo: restore the holders in the same statement. Pages follow the kit's labels and the space's first language, right-to-left for Arabic, at phone width; text people typed (titles, notes) keeps its own direction.

### The admin's pages (AT-2)

Everything is under `/s/<space>/admin`, behind the admin gate; anyone else (a publisher, a learner, an expired admin, an admin of another space) gets 403 and nothing changes. Address words are neutral (`people`, `sets`, `topics`), so no address names a concept. The admin's home shows the kit's four labels (Teacher, Student, Class, Subject in a School space); each is the way into its page.

| Address | What |
|---|---|
| `/s/<space>/admin/people` | the space's publishers and learners (name, role, end date, the mobile's **last four digits** only), with a **search box** (release 1.1) and, below, a collapsed **Ended** part; and the form to appoint one: name, username, first password, role (**publisher or learner only**), mobile typed the local way (010…; for a learner, a parent's number), end date (**not after the admin's own**) |
| `/s/<space>/admin/people/<person>` | one person: **Correct the details** (release 1.1), **Send reset link by WhatsApp**, **Set a new password** (every sign-in of that person ends) and **End access now**; once access has ended, **Restore access** in place of the last three, and the reset link and new password are refused with a plain message (both steps of the link too) until access is restored |
| `…/people/<person>/link` | GET: the confirmation step, "the link will go to the number ending in 3333", one confirming tap. POST (the tap): the link, as a **WhatsApp** button and a **Copy** button side by side |
| `…/people/<person>/correct` | POST: the corrected name, mobile number and end date (release 1.1, below) |
| `…/people/<person>/end` | GET: the confirm step, naming the person, with **Cancel** (a plain link back, which changes nothing). POST (the confirming tap): access ends at once |
| `…/people/<person>/restore` | POST: a new end date; access comes back |
| `/s/<space>/admin/sets`, `…/sets/<group>` | groups: a name and the learners in it; change who is in it (untick a learner to remove her); **rename it** (release 1.1) |
| `…/sets/<group>/name` | POST: the group's new name (release 1.1, AT-7) |
| `/s/<space>/admin/topics`, `…/topics/<subject>` | subjects: a title and one responsible publisher; then who may read it (groups and single learners; untick one to unassign it); **rename it** (release 1.1) |
| `…/topics/<subject>/name` | POST: the subject's new name (release 1.1, AT-7) |

A refused form (an unreadable number, an admin role, an end date past the admin's own, a taken username, an id that is not a publisher, learner or group of this space) shows its plain message in the space's language and stores nothing. Mobiles are read with the space's default country code and stored in international form (`010 2222 3333` → `+201022223333`). People start today (`valid_from`) and end on their end date.

The owner has the same person page for the admins they appointed, at `/owner/spaces/<space>/people/<admin>` (linked from the owner's space page): a new password, or a reset link in the space's first language; from release 1.1 also the corrections, End access now and Restore access below (the owner has no end date of their own, so only "not before today" applies). The owner's list of admins shows an ended admin with "access ended on <date>".

### Correcting a person (release 1.1, AT-6)

The admin (and the owner, for the admins they appointed) corrects the everyday mistakes in a person from the screens; nothing is deleted.

- **Search.** The people list has a search box. The server narrows the list to the people of this space whose name or username contains what was typed (letter case aside for a–z; at most 100 characters are read; `%` and `_` are plain characters). Nobody matching gives a plain message.
- **Correct the details.** The display name (release 1 bounds: 1 to 100 characters on one line); the registered mobile number (left empty, it stays; a new one is read with the space's country code and refused if it cannot be read; the form never shows the number, only its last digits); and, while access lasts, the end date. A new number kills **every reset link issued before it**, so a link already sent to the wrong number stops working; the next link goes to the new number, and the next WhatsApp message carries the corrected name.
- **Typed end dates.** A typed date must be a real date, **not before today** and **not later than the admin's own end date** (release 1 rules 2 and 3); otherwise the plain message, and nothing is stored. A date of today keeps access through the end of that UTC day. The rule is for typed dates only: a correction that leaves the end date as it was is not checked again, and End access now types no date.
- **End access now.** A confirm step names the person; Cancel is a plain link back and changes nothing. The confirming tap, in one database transaction, writes today's date into the membership's new `ended_on` column (migration `0005`; `valid_until` is kept), stops every sign-in of the person, and kills every open reset link. Their next page, at once, shows "Your access to <space> ended on <today>. Contact the <admin label>." in the space's first language and then its second (for an admin ended by the owner: "Contact the owner."); that sign-in is then over. They can still sign in (release 1 rule 3) and see only the same message; every direct link (home, subject, lesson, file, publisher and admin pages) is refused with it.
- **Ended.** People whose access has ended (by date or with End access now) move to a collapsed **Ended** part of the people list, with the day it ended. Their groups and subjects are kept.
- **Restore access.** On an ended person's page, a new (typed) end date clears the end; the person comes back with the same groups and subjects, because they were never removed.

How a stopped sign-in still shows the message once: End access now sets the expiry of the person's sessions to 0. The session check deletes such a session at its next request, clears the cookie, and remembers the person for that one request only; inside a space whose membership has ended, that request gets the message, anywhere else it goes to sign-in.

### Tidying groups and subjects (release 1.1, AT-7)

The admin tidies groups and subjects from the screens; nothing is deleted, and everything can be put back.

- **Rename a group or a subject.** On the group's page and on the subject's page, a rename form ("Rename the Class", "تغيير الاسم: فصل", in the kit's words; the Arabic heading puts the kit's word after a colon, so it reads cleanly whatever the word is). A name is 1 to 100 characters on one line, the release 1 display-name bounds (no line breaks, tabs, separators or bidirectional controls; counted as characters; spaces around it are trimmed). An empty, blank, too-long or multi-line name is refused with a plain message and nothing is stored. A rename is one statement on the group's or subject's own row: members, assignments, the publisher, the published state and every chapter, lesson, material and file stay as they were. Every page reads the name from that row, so the new name shows at the next page for everyone: the admin's lists and pages, the publisher's home, editor and lesson trail, the learner's home, subject page and lesson trail, in every language of the space.
- **Remove a learner from a group, unassign a group from a subject.** Untick the learner on the group's page, or the group on the subject's page, and save (the release 1 forms). Visibility is checked on every request, so the removed learner, and every learner of the unassigned group, loses the subject at their next page and on every direct link: the subject, its lessons and its files (a file asked for again with the browser's cached copy is refused too, never answered "not modified"). A learner who also has the subject another way (assigned directly, or through another group) keeps it.
- **Put it back.** Tick the learner or the group again: access comes back at once, with the same content, because nothing of the content was touched.
- **Who may.** Only an admin of that space: every new address is under `/s/<space>/admin/*`, so the admin gate and the cross-origin check cover it; a publisher, a learner, another space's admin (by either space's address) and a forged or origin-less post get 403 and nothing changes.

**AT-6 follow-ups (the AT-6 Verifier's carried items).**

- A person whose access has ended (End access now, or an end date in the past) gets no reset link and no new password from the appointer: both steps of **Send reset link by WhatsApp** and **Set a new password** answer with "Access for <name> has ended. Restore access first; then you can send a reset link or set a new password." in the appointer's language, and nothing is stored. The same holds on the owner's page for an ended admin. After **Restore access** both work again.
- The once-a-day session refresh only extends a session whose expiry is still above 0 (`src/auth/session.ts`), so a refresh that read the session a moment before End access can never bring that stopped sign-in back.
- `/home`, the list of a person's spaces, marks a space whose access has ended with "access ended on <date>" ("انتهى الوصول في <date>"); its link still opens the "access ended" message.

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

### Password strength

Passwords are hashed with PBKDF2-SHA256. How much work one hash takes (the iteration count) is a **deploy-time setting**, not code, so the owner's decision 2 in [docs/07-FIRST-DEPLOY.md](docs/07-FIRST-DEPLOY.md) changes one value and nothing else.

**In force: option B, 10,000 iterations** (the owner's answer of 1 November 2026, applied by build task 8 before the first deploy, so no 100,000-iteration hash is ever written in production). The live check is the **CPU time column in Workers Logs at the go-live sitting** (see "How to check the CPU live" below); until then the edge CPU cost is a local measurement, not a confirmed figure.

**The setting.** `PASSWORD_ITERATIONS` in the `vars` of `wrangler.jsonc`, read by the Worker on every request (`src/auth/password.ts`).

| Value | What the Worker does |
|---|---|
| `"10000"` (production, option B) | the floor: every new or re-written password in production is hashed at 10,000 |
| absent | the code's default, 100,000 (the test environment runs this way; see "Tests" below) |
| a whole number from **10,000** (floor) to **100,000** (ceiling) | hashes every new or re-written password at that strength |
| anything else (below 10,000, above 100,000, `100,000`, `1e5`, empty, words) | **refuses to serve**: every request answers a server error, and the Worker log says `PASSWORD_ITERATIONS must be a whole number from 10000 to 100000 …`. The deploy's smoke check fails on it, so the mistake is seen at once and rolled back |

The floor stops a typo from silently weakening every password. The ceiling is the highest count Cloudflare's Workers runtime accepts for PBKDF2, and it stops a typo from making every sign-in slower than today. A refusal was chosen over quietly falling back to the floor: nobody should end up on a weaker strength they did not choose. CI also checks the value before anything ships: the production guard (run by CI and by the deploy workflow) fails unless production states exactly the decided value, 10,000 since option B.

**Each password carries its strength.** A stored hash looks like `pbkdf2-sha256$<iterations>$<salt>$<hash>`, the same format as before this setting existed, so every hash already written (at 100,000) keeps working. A check reads the count from the stored value, so passwords made at different strengths live side by side. A count that has been tampered with (negative, outside the floor and ceiling, not a plain whole number) never verifies and costs no hashing. The comparison stays constant-time. For an unknown username the Worker checks against a dummy hash made at the configured strength, so the time it takes does not reveal whether the username exists.

**Re-written at the next sign-in.** When someone signs in successfully and their stored hash was made at a different strength, the Worker re-hashes the password they just typed at the configured strength: one database write, only then, never on an ordinary sign-in. This works in both directions, so a later move from B to A strengthens everyone gradually as they sign in. Every password the product writes is already at the configured strength: owner setup, appointing an admin, publisher or learner, a password set by the appointer, change own password, and the reset-link and recovery-code paths (which end with a new password).

**The owner's decision and the setting.**

| Owner's answer (docs/07, decision 2) | `PASSWORD_ITERATIONS` |
|---|---|
| **B.** Stay on the free plan (**chosen, 1 November 2026; in force**) | `"10000"`, with the decided value in `test/guards/production-guard.test.ts` set to 10,000 in the same pull request (build task 8) |
| **A.** Workers Paid ($5 a month), later | back to `"100000"` and the guard's decided value with it, in one pull request; passwords strengthen at each person's next sign-in |

**Tests.** The test environment (`--env test`) deliberately keeps the code's default of 100,000 rather than production's 10,000. The hashing code is the same at any count, so the acceptance tests prove the same behaviour either way; their existing checks of the stored strength stay as they were; and every test run keeps exercising the "absent means the default" path end to end. The cost is a slower CI run, not a weaker one. Production's own value is proven twice in CI: the production guard requires `wrangler.jsonc` to state exactly 10,000, and the password-strength step starts the production build with its own configuration and checks that it stores a new password at that strength.

**Measured cost (local).** `npm run measure:password-cost` runs the product's own hashing code inside the local Workers runtime (`wrangler dev`, workerd) and prints milliseconds. On the build machine (Intel Xeon at 2.80 GHz, 4 cores; 1 November 2026), median of 9 trials × 5 runs:

| Iterations | Hash (ms) | Verify (ms) | Hash + verify (ms) |
|---:|---:|---:|---:|
| 10,000 | 4.6 | 4.4 | 9.0 |
| 20,000 | 9.0 | 8.8 | 17.8 |
| 50,000 | 23.0 | 23.0 | 46.0 |
| 100,000 | 45.4 | 44.4 | 89.8 |

(A separate run measured 15,000 at 6.6 ms to hash and 6.8 ms to verify.) The cost grows in a straight line with the count: about 0.45 ms per 1,000 iterations here. A sign-in costs one verify. A password change, and a sign-in that re-writes an older hash, cost a verify and a hash. Setup, appointing, a password set by the appointer, the reset link and the recovery code cost one hash.

**Why option B is 10,000.** It is the highest count measured here that leaves a safe margin under the free plan's 10 ms. A sign-in takes about 4.4 ms, under half the limit, which leaves room for the rest of the request and for a slower moment. 15,000 would make a sign-in about 6.8 ms and a password change about 13 ms, over the limit. 20,000 leaves no margin even for a plain sign-in. Even at 10,000, the requests that do two hashes (a password change, a one-time re-write) come to about 9 ms here, close to the line.

**What is uncertain.** These numbers are from this machine. Cloudflare's edge runs other processors (possibly faster), and Cloudflare allows some short bursts over the limit. CI therefore never turns timing into a pass or a fail. The real check happens live, at the go-live sitting:

**How to check the CPU live.** In the Cloudflare dashboard, open **Workers & Pages** → `lms-lego` → **Logs** (Workers Logs). Sign in a few times, change a password once, and read the **CPU time** column for `POST /signin` and `POST /account/password`. Look for "exceeded CPU time limit" (error 1102). If sign-in stays well under 10 ms, the setting is right. If it goes over, the only remaining choice is option A, because the floor does not go lower. If it has plenty of room, a higher value can be proposed afterwards, measured the same way.

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
npm run test:at5                  # AT-5 in Chromium, phone width, Arabic first, then English
npm run test:at6                  # AT-6 in Chromium, phone width, Arabic first, then English, clock at midday UTC
npm run test:at1:midnight         # AT-1 with the Worker's clock starting at 23:59:58 UTC
npm run test:guard:reset          # reset links: single use, username, 30 minutes, who may issue, the number kept private
npm run test:guard:doors          # the sign-in rate limit, and access starting on its start date
npm run test:guard:labels         # no role word hard-coded in a page
npm run test:guard:clock          # the test clock and the seeding route are absent from the production bundle
npm run test:guard:spaces         # a space never reads another space's rows
npm run test:guard:roles          # every admin and publisher route is behind its role gate
npm run test:guard:cross-origin   # every POST route refuses another site's or an origin-less post
npm run test:guard:bounds         # usernames, display names and kit labels are bounded
npm run test:guard:end-access     # ending access is immediate and stops sessions and reset links; typed dates; who may correct
npm run test:guard:end-access-followups  # an ended person gets no reset link or new password; /home marks ended spaces; the refresh race
npm run test:at7                  # AT-7 in Chromium, phone width, Arabic first, then English, clock at midday UTC
npm run test:guard:unassign       # removing a learner or unassigning a group takes effect on every direct link, cached files included
npm run test:at8                  # AT-8 in Chromium, phone width, Arabic first, then English, clock at midday UTC
npm run test:guard:removed        # removed content never reaches a learner: every read path, one statement per removal, a crawl
npm run test:deploy-rails         # the production bundle, deploy.yml's safety rules, migrations applied twice, the smoke check
npm run test:last-resort          # the owner's last-resort reset against the local database
npm run test:password-strength    # password strength: stored per password, re-written at sign-in, production at the decided 10,000 (code default 100,000)
npm run measure:password-cost     # prints what one hash and one check cost locally (not a test)
npm run typecheck
```

The AT-1 test starts `wrangler dev --env test` on a free port with a fresh database, drives the real pages in Chromium (owner setup, recovery code, sign-in and sign-out, new space with logo and colour, admin appointment, the admin's right-to-left home, the end date, the usage panel) and saves screenshots to `evidence/at-1/` (CI uploads them).

The AT-4 test does the same for the learner: the owner part through the real pages, learners, the group "Science", the subject "Mathematics" with chapter "Fractions", lesson "Adding fractions" and five materials (real PDF and PNG bytes in R2) through the test seeding route; then the first learner's home, password change, the subject, the lesson and all five materials; the second learner refused; role gating; and the "access ended" message after the first learner's end date. Screenshots go to `evidence/at-4/`.

The AT-3 test seeds only the starting point (people, the group Science, the empty subject Mathematics assigned to Hadeer; the admin screens are task 4). Everything Hadeer does goes through her real pages in Chromium at phone width in Arabic: her home, chapter "Fractions", lesson "Adding fractions", three disguised files and two non-http links refused with the plain message (plus a file over 25 MB), the PDF, image, video link, web link and note in order, publish (the assigned learner sees nothing before and the five materials in order after, opening each), unpublish, and moving up and down. Then refusals: Shimaa (who edits her own subject) gets 403 on Hadeer's editor and on every editing action; so do a learner, the admin and an expired publisher; writes cannot reach another space's subject; cross-site and origin-less forms, uploads included, are refused; and nothing is stored or changed by any refusal. Screenshots go to `evidence/at-3/`.

The role guard (`test/guards/role-gates.test.ts`) reads the router's own route table (and the middleware the router declares through its `use()` helper, so a catch-all handler that happens to take two parameters is still a handler) and fails if a route that changes data, or that serves an admin, publisher or owner page, is registered outside `/s/<space>/admin/*`, `/s/<space>/publish/*` or `/owner`, or before that prefix's gate, apart from a short named list (setup, sign-in, sign-out, recovery, own password, the test-only hooks). A self-check proves it catches planted violations. A live sweep then calls every gated route, by its own method and with real ids, as a learner, an admin and a publisher, and expects 403 wherever the role is missing.

The AT-2 test needs no seeding route at all: the owner, the space and its admin come from the owner's real forms; every admin action goes through the admin's real pages in Chromium at phone width in Arabic: appointing Hadeer, Shimaa and two learners (an unreadable number, an admin role and an end date past the admin's own are refused), the group Science, the subject Mathematics and its assignments, reset links for Hadeer and the first learner (last digits, one tap, the WhatsApp and Copy buttons side by side, the decoded message compared word for word, the clipboard, a wrong username, a second use, a fresh link killing the old one, 30-minute expiry), a new password set directly, and the four homes (Hadeer publishes through her own screen). Screenshots go to `evidence/at-2/`. The reset-link guard (`test/guards/reset-links.test.ts`) checks the same rules at request level, plus the stored hash, the bounded attempts, sessions ending, who may issue (and that refusals store nothing), the number never in a page or the log, and the owner's side. The doors guard (`test/guards/doors.test.ts`) checks the rate limit (per username, per client, no writes when refused, reset usernames counted) and `valid_from`.

The AT-5 test needs no seeding route: Mesk School, its people, the group Science, Mathematics and its five materials are made through the real owner, admin and publisher screens (AT-1, AT-2, AT-3) in Chromium at phone width in Arabic. Then the owner creates Delta Logistics on the Company kit, switches Mesk School to the Company kit through the confirm step and renames Trainer to Coach / مرشد. It checks every admin, publisher and learner page for مرشد, موظّف, فريق, دورة and for the absence of the old words; the first learner's lesson (titles, order, addresses, file bytes) and every people and content row unchanged; Delta Logistics and the seed kit untouched; the admin and the first learner switching to English (left-to-right) while another learner stays Arabic; and the theme. **"No code changes" is checked three ways** around the owner's kit change: the same commit and no change on disk to the code or its configuration; the production bundle built as a deploy builds it (`wrangler deploy --dry-run`) hashes to the same SHA-256; and the same running Worker instance served before and after (the test build's boot identity is unchanged, so nothing was reloaded or redeployed). Every row of every product table is compared before and after: the only row written is Mesk School's own kit row (the usage counter table, which every page view moves, is left out of the comparison). Screenshots go to `evidence/at-5/`. The cross-origin guard posts to every POST route of the router (read from its route table, so a new form is swept too) as the person who may use it, from another site or with no Origin, as form, multipart with files, text and JSON: all 403, no session started, no row or file changed; a positive control then changes things through the same forms from the product's own pages. The bounds guard checks usernames, display names, labels (and their escaping), the kit choice, the theme inputs and the account language at request level.

The AT-6 test sets the Worker's clock to midday UTC for the whole run. It seeds only what earlier tests proved: the owner, Mesk School and its admin through the owner's real forms; Hadeer and Shimaa (publishers), two learners, the group Science and two published subjects through the seeding route. Everything AT-6 is about goes through the admin's real screens in Chromium at phone width in Arabic: searching by part of a name, a username and an Arabic name; correcting the first learner's name, number (an unreadable one refused) and end date, the reset link sent before the change dead, the next one to the new number with the new name, the new name on the people, groups and subject pages; the extended learner still in after the old end date; End access now on the second learner (the confirm step, Cancel changing no row, then the confirming tap), the learner's next page with the message dated today, the old sign-in and reset link dead, every direct link refused after signing in again; Hadeer's end date moved to today (still in at midday, out 30 seconds after midnight UTC), a date before today and one past the admin's own refused; the collapsed Ended part; Restore access (dates refused, then accepted; only the membership row changed, the same groups and subjects). Then the same screens in English. Screenshots go to `evidence/at-6/`. The end-access guard checks the same at request level, plus two sign-ins at once, the publisher's pages and writes, a midnight boundary to the second, correcting a name with no typed date the day after, the bounds on names and numbers, search scoped to the space with plain-text wildcards, the refusals (a publisher, a learner, another space's admin by either address, another admin, an admin on themselves, an admin on the owner's route, a forged and an origin-less post; no row changes) and the owner correcting, ending and restoring an admin.

The AT-7 test sets the Worker's clock to midday UTC. It seeds only what earlier tests proved: the owner, Mesk School (مدرسة مسك) with its admin and a second space (Delta Logistics) with its admin through the owner's real forms; Hadeer (publisher), two learners, the group Science and two published subjects of Hadeer's (Mathematics and Reading, each with a chapter, a lesson, a PDF and a note, both assigned to Science) through the seeding route. Everything AT-7 is about goes through the admin's real screens in Chromium at phone width in Arabic: renaming Science to Science 5A (an empty, a 101-character and a two-line name refused with the plain message, no row changed; then only the group row changed), renaming Mathematics to الرياضيات للصف الخامس (refusals; then only the subject's title changed, the content rows untouched); the new names on the admin's, the publisher's and the learner's pages in Arabic, then on the publisher's and the learner's pages in English; removing the first learner from the group (only her membership row changed; her next page lists nothing; subject, lesson and file refused for both subjects; the other learner keeps both); unassigning the group from Reading (only that assignment changed; its learner keeps only the other subject; Reading's subject, lesson and file refused; the publisher still edits it); re-adding both (both learners have both subjects again, the same file bytes, the same members and assignments, the content rows identical); the admin's screens in English (a refused name in English, a rename shown at once on the learners' English and Arabic pages); and, at request level, the refusals (a publisher, a learner, another space's admin by either address, a forged and an origin-less post, an admin with another space's ids; no row changes) and the bounds (empty, blank, 101 characters, line breaks, tabs, separators, bidirectional controls refused; exactly 100 characters, emoji counted as one, accepted). Screenshots go to `evidence/at-7/`. The unassign guard checks, with the learners' existing sign-ins, that a removed learner and the learners of an unassigned group are refused at once on the subject, the lesson and each file (PDF and image), also when the browser offers the file's cached ETag (403, never 304), that a learner assigned directly keeps the subject, that the group's other subjects stay, that re-adding restores access with the same bytes and members, that no content row changes and the publisher keeps her editor throughout, and that a refused change of members or readers changes nobody's access. The follow-ups guard checks the ended person's reset link (both steps) and new password refused with the plain message in Arabic and English (by End access now and by a past end date, and on the owner's page for an ended admin), nothing stored, and both working again after Restore access; and `/home` marking an ended space in Arabic and English (a person with places in two spaces is written straight into the test database: no screen makes one in this release). `test/unit/session-refresh.test.ts` drives the refresh race step by step on SQLite with the product's own schema and functions (the session check reads a session due for refresh, End access lands, then the refresh is written: the expiry stays 0), and checks that every statement in `src/` that extends a session keeps a stopped one stopped.

The AT-1 test takes "today" from the Worker's clock and sets the clock to fixed times of the end date, so it passes whenever it runs; `npm run test:at1:midnight` (a CI step) starts the Worker's clock two seconds before midnight UTC to prove it.

The space guard (`test/guards/space-isolation.test.ts`) scans every SQL statement under `src/` and fails if one touches a space's table without naming its `space_id`; checks that every space table carries `space_id` and that the database refuses a child row pointing into another space; and, against the running Worker, that a learner and an admin of one space get 403 and nothing of another space's subject, lesson and files, by either space's address, with real ids.

The AT-8 test sets the Worker's clock to midday UTC. It seeds only what earlier tests proved: the owner, Mesk School (مدرسة مسك) and its admin through the owner's real forms; Hadeer and Shimaa (publishers), the learner Salma, the group Science and the published subject Mathematics (assigned to Hadeer and to Science) through the seeding route, and Hadeer's chapters (Fractions, Decimals), lessons (Adding fractions, Fractions quiz, Place value) and materials (a PDF, an image, a web link, a note) the same way, since AT-3 proved her screens make exactly these rows (Shimaa's own subject Physics is seeded as a positive control). Everything AT-8 is about goes through Hadeer's real screens in Chromium at phone width in Arabic, read on Salma's real pages: renaming the chapter, the lesson and the worksheet (empty, 101-character and two-line titles refused, and line breaks, tabs and bidirectional controls refused at request level; each rename changes one title only; Salma sees the new titles in place at once); replacing the worksheet's PDF (text pretending to be a PDF, an image in place of a PDF, no file and a 25 MB + 1 byte file refused, nothing stored; then only `storage_key` changes, the old file is still counted in storage and the new one added, Salma gets the new bytes at the same address, and her cached ETag gets the new bytes, not 304); removing the worksheet (the step names it; two plain visits and Cancel change nothing; then one row and one column change, the file stays counted, Salma's lesson no longer lists it and its file link answers 404, also with the old ETag), restoring it from Recently removed (every row exactly as before, in its old place, the same file bytes) and removing it again; a lesson that still shows materials and a chapter that still shows a lesson refused with the plain message and the list (also by direct POST), the empty lesson removed (its address 404 for Salma) and restored in place, and the empty chapter removed after its lesson and restored before it (a lesson inside a removed chapter has no Restore and a direct restore is refused); the same screens in English (rename heading, the step and Cancel, the refusal, Recently removed, a restore on Salma's English page, "not found" in English); Shimaa, the admin and Salma refused on every new page and every write (and forged and origin-less posts from Hadeer's own session), nothing changed; and every GET and HEAD of every publisher route, with real ids, changing nothing. Screenshots go to `evidence/at-8/`. The removed-content guard (`test/guards/removed-content.test.ts`) checks that every SQL read of chapters, lessons and materials outside the publisher's own modules filters `removed_at IS NULL` for each of them (with a self-check); that removing and restoring is one soft `UPDATE` each, with the ownership check and the "still shows content" check inside it; that every learner read path in the router's route table, opened by a learner, an admin and the publisher with the ids of removed items (including items under a lesson or chapter marked removed directly in the database, a state the screens never leave), answers 404 and shows or sends nothing removed, cached ETags included; and that a crawl of every page reachable from the learner's home finds no removed title or id.

## How the test hooks are kept out of production

`wrangler.jsonc` sets the build constant `__TEST_HOOKS__` to `false` for production and `true` only in `env.test`. The clock route and the seeding route (`/__test/clock`, `/__test/seed`, both in `src/test-hooks.ts`) are registered behind `if (__TEST_HOOKS__)`, so the production build removes them entirely; each also needs the runtime flag `TEST_HOOKS=1`, which only `env.test` sets. `test/guards/production-guard.test.ts` builds both bundles and fails if the production one contains either route, the seeding code or the flag (and if the test one lacks them, so the check means something).

## Known limits

- **Usage counts are approximate.** Requests and database writes are counted in memory in each Worker instance and added to the day's row at most once a minute (one database write per instance per minute at most, so counting never costs a write per request). Counts an instance holds when Cloudflare shuts it down are lost, so the panel can read a little low, never high. Files stored is read from R2 itself on each owner home view (one list call per 1,000 files).
- **Dates are UTC days.** An end date means access through that UTC day; it ends at 00:00 UTC the next day (02:00 or 03:00 in Egypt).
- **Learner pages read, they do not edit.** Publishers build content through their pages (AT-3); admins create people, groups and subjects (AT-2).
- **The admin corrects people and tidies groups and subjects.** From release 1.1 a person's name, mobile number and end date can be corrected and their access ended now or restored (AT-6); a group's name and a subject's title can be changed, learners removed from groups and groups or learners unassigned from subjects, and all of it put back (AT-7); nothing is deleted. A username or a role cannot be corrected, and duplicate groups or subjects cannot be merged (release 1.1 Later).
- **A new name is 1 to 100 characters, while creating still takes the release 1 bounds.** Creating a group takes up to 100 characters and a subject title up to 200, on any line count, as in release 1; renaming takes the display-name bounds (1 to 100 characters, one line). A subject created with a longer title keeps it until it is renamed to a shorter one.
- **Two groups or two subjects may carry the same name.** A rename does not check that the name is free in the space (as creating does not); the admin tells them apart by their members or readers.
- **Removing is per way of access.** A learner removed from a group keeps a subject that also reaches her directly or through another group; untick that too. Saving a group or a subject's readers writes the whole form, so two admins saving the same one at the same moment: the later save wins.
- **Search reads the letters as typed.** Letter case is ignored only for a–z. Arabic is matched letter for letter: أ and ا, ى and ي, ة and ه, and marks such as ّ are different letters to the search, so "سلمي" does not find "سلمى".
- **A person's name and number belong to the person, not to one space.** A correction shows wherever that person appears. (In this release a person is appointed in one space.)
- **End access now stops every sign-in of the person, in every space they belong to.** Sessions belong to the person, not to a space; in a space where they still have access they simply sign in again. The message shows once on the stopped sign-in's next page inside the ended space; after that the browser is signed out, and signing in again shows the same message.
- **Ended people keep their place in groups and subject choices.** An ended learner still appears (unmarked) among the members of a group and the readers of a subject, so saving a group does not drop them; Restore access therefore brings back exactly what they had. Unticking them there removes that membership, as for anyone.
- **The owner's list of admins has no separate "Ended" part.** An ended admin stays in the list with "access ended on <date>"; the owner opens them to restore.
- **No history of corrections.** Who changed a name (a person's, a group's or a subject's), a number, a date, a group's members or a subject's readers, and the old value, is not kept (release 1.1 Later: an audit history). D1's 30-day point-in-time history is the last resort.
- **The rate limit can be used against a person.** Anyone who knows a username can refuse it for 15 minutes with five wrong passwords (that person's appointer can still set a new password, but sign-in waits out the 15 minutes). A school behind one address shares the client allowance of 50 failures an hour. The client key is an unsalted hash of the address (an IPv4 address could be recovered by trying them all); its row is removed once its window has ended and another failure arrives.
- **A reset link sets the password; it does not sign the person in.** They sign in with it straight after. If the password write fails after the link was claimed, the link is spent and the appointer makes a new one.
- **The owner's reset message names the owner by their username** (the owner account has no separate display name).
- **The publisher corrects content; nothing is deleted.** From release 1.1 a chapter, a lesson or a material can be renamed, a material's file replaced in place, and a material, an empty lesson or an empty chapter removed and restored (AT-8). A removed item and a replaced file stay in R2, counted on the usage panel, for good in this release: emptying "Recently removed" to free storage is release 1.1 Later. A lesson cannot be moved to another chapter (Later), and there is no bulk removal (Later).
- **A lesson or a chapter is removed only when empty.** Removing a lesson takes removing each of its materials first, and a chapter each of its lessons; restoring goes the other way (chapter, then lesson, then material), one at a time.
- **A replaced file cannot be brought back from the screens.** The old object is kept in storage, but no screen offers it again; replace the file again with the right one. The material's address stays the same, so a learner who had downloaded the old file keeps their copy.
- **Renamed titles take the AT-7 bounds, while adding still takes the release 1 bounds.** Adding a chapter, a lesson or a material takes a title of up to 200 characters on any line, as in release 1; renaming takes 1 to 100 characters on one line. A longer title stays until it is renamed.
- **Moving skips removed items.** A move swaps an item with its nearest neighbour that shows; removed items keep their places in between, which is what lets Restore put one back where it was. After items around it were moved, "its old place" is its old position among them.
- **Uploads are read whole into the Worker's memory** (at most 25 MB, plus a little form overhead; a larger declared body is refused before reading). Uploading a file costs one R2 write and one database write.
- **A file opened in the browser shows in its own viewer.** Chromium and Firefox show PDFs inline; a phone may download the PDF instead. Images show in the lesson page.
- **Published is all or nothing.** Publishing shows the whole subject to whoever it is assigned to; there are no drafts of single lessons.
- **Visibility is checked per request.** A learner removed from a group, or a subject unpublished, disappears at their next page; a file already downloaded stays on their device.
- **One language choice per person.** It is stored on the person, not per space; the choices offered are the languages of the person's latest membership. In a space that does not offer the chosen language, that space's first language applies. In this release every space has both Arabic and English.
- **The "access ended" page** shows the message in the space's first language and then its second, whatever language the person chose.
- **A custom kit keeps its kit name.** After renaming labels, the owner's pages still call the kit by the seed's name (for example Company); there is no "save as a new kit" or copy between spaces.
- **A replaced logo** shows at the next page load; browsers revalidate it (no-cache). The theme form writes the new logo under a new name, switches colour and logo in one database statement, then removes the old logo; if that removal fails, the old file is only left over (counted in storage).
- **Validation messages for labels** say which rule was broken, not which box; the owner's typing is kept in the form.
- **Password strength is a setting; production runs at 10,000 (option B, the owner's decision of 1 November 2026); the code's default stays 100,000** (see "Password strength"). The 10,000 figure comes from this build machine; whether it fits Cloudflare's 10 ms is checked live in Workers Logs at the go-live sitting. Even at 10,000, a password change and a one-time re-write (two hashes) measured about 9 ms here, close to the line. If a sign-in at 10,000 goes over the limit on the edge, the floor stops the strength going lower, and option A is the answer.
- **A move to a lower strength on the free plan needs each older password checked once at its old strength.** That check (about 45 ms at 100,000) could exceed the free plan's limit. B was applied before the first deploy (build task 8), so no such password exists in production. If production ever moves lower again, people whose sign-in fails that way get a reset link or a new password from their appointer, which writes at the new strength without checking the old one.
- **Until a person signs in again, their hash keeps its old strength.** While two strengths exist side by side, the time a sign-in takes could show that a username exists with an older hash; it ends at that person's next sign-in. A tampered or unreadable stored hash fails to verify and is not re-written.
- **Owner last resort** (both password and recovery code lost): a script and one Wrangler command for the Cloudflare account holder (see "First deploy"); there is no web route for it, by design.
- **Pages outside a space** (sign-in, setup, owner) follow the browser's language (Arabic if the browser prefers it, otherwise English), unless the signed-in person stored a language choice. Inside a space, pages use the person's choice when the space offers it, else the space's first language.
- **Dev tooling:** `npm audit` reports advisories in the `undici` copy bundled with Wrangler 4.149 (used only for local emulation and tests, never deployed). The fixed Wrangler releases were under two weeks old when this was pinned; update Wrangler in a later task.

## First deploy

The owner's steps and decisions (the Cloudflare account, the storage choice, the two repository secrets) are in [docs/07-FIRST-DEPLOY.md](docs/07-FIRST-DEPLOY.md). This section is the team's side. Nothing deploys by itself: the deploy workflow ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) runs only when someone starts it by hand, only from `main`, and CI checks those rules on every pull request.

**How the delegate starts a deploy** (with the owner present for the first one):

1. The owner has added the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (docs/07, step C). Nobody else sees them.
2. On GitHub: **Actions** → **deploy** → **Run workflow** → branch `main` → **Run workflow**. Any other branch is refused.
3. The run, in order: stops at once with a plain message if a secret is missing (it never prints them); checks out `main`; `npm ci`; type check; the production guard (the bundle that ships has no test hooks); creates the D1 database `lms-lego` and the R2 bucket `lms-lego-files` if they do not exist yet; applies the database migrations to the live database; deploys the Worker; prints the address and the version id (also on the run's summary page); runs the smoke check. Two runs never overlap, and a running deploy is never cancelled.
4. No account id or database id is stored in the repository: Wrangler finds the database and the bucket by name in the owner's account at each run.

**Why migrations run before the deploy.** Migrations are additive (new tables and nullable columns only; CI checks every migration file for `DROP`, `RENAME`, `DELETE FROM` and `UPDATE … SET`), so the version still serving keeps working on the new schema while the new version starts. A second apply is a no-op (CI proves it on a fresh local database).

**What the smoke check proves** (`scripts/smoke-check.mjs`, read-only): the address answers (a redirect to `/setup` or `/signin`), that page answers 200, a form post from another site (and, on https, from the same host over plain http) is refused with 403, and `/__test/clock` is 404, so a test build was not deployed. If it fails, roll back (below).

**A fresh workers.dev address can answer 404 for a few seconds** right after its first deploy, while the new route spreads (the first deploy, run 41357099847, saw this). The smoke check now waits through it: within its wait (`SMOKE_WAIT_SECONDS`, default 120 seconds) the first `GET /` is retried on a 404, as on a 5xx or a refused connection; after the wait a 404 still fails.

**The owner must complete `/setup` immediately.** Until the owner account exists, `/setup` is open to whoever opens the address first, who would become the owner. The first deploy is therefore started only with the owner at hand: as soon as the smoke check says "No owner yet", the owner opens the address, completes setup and writes the recovery code on paper. After that, `/setup` is closed for good.

**If Cloudflare asks for a workers.dev subdomain.** A brand-new account may have none yet; the deploy then stops with Cloudflare's message and a link. The owner opens **Workers & Pages** in the dashboard once (choosing the subdomain is the owner's call, since it appears in the address) and the delegate starts the deploy again. Migrations already applied are skipped on the re-run.

**Roll back.**

- **The code:** the deploy prints each version id. `npx wrangler rollback` (signed in as the account holder, from a checkout of this repository) returns to the previous version, or `npx wrangler rollback <version id>` to a chosen one; or, in the Cloudflare dashboard, the Worker `lms-lego` → **Deployments** → roll back. No data changes.
- **Data:** migrations are additive, so older code keeps working with a newer database. D1 keeps 30 days of point-in-time history (Time Travel) for recovery. Task 4 added `migrations/0003_people.sql` (`reset_link`, `attempt_limit`); code from before it ignores both tables. Task 5 added `migrations/0004_person_language.sql` (one nullable column, `user.lang`); older code ignores it. Build task 12 added `migrations/0006_content_removed.sql` (one nullable column, `removed_at`, on `chapter`, `lesson` and `material`): code from before it ignores the column, so **rolling the code back makes removed items show again** (nothing is lost; a renamed title or a replaced file stays as it was changed). To hide them again after such a rollback, roll forward, or unpublish the subject meanwhile. A kit switch or rename is data only: to undo one, the owner switches back or renames again (or the database's point-in-time history restores the kit row).
- **Abandoning Cloudflare entirely:** delete the Worker, the D1 database and the R2 bucket in the dashboard, then the API token and the two repository secrets.

**The owner's last-resort reset** (both the password and the recovery code are lost). Only the Cloudflare account holder can do this, and it never reopens `/setup`:

1. On the owner's own computer, in a copy of this repository (Node.js 18 or later): `node scripts/owner-last-resort.mjs`. It prints a fresh recovery code once (write it on paper) and one command. The code and its hash are made on this computer; only the hash is in the command, so the code never travels.
2. Run the printed command, which looks like `npx wrangler d1 execute lms-lego --remote --command "UPDATE user SET recovery_hash = '…' WHERE is_owner = 1; SELECT username FROM user WHERE is_owner = 1;"`. Wrangler asks the owner to sign in to Cloudflare first (or run `npx wrangler login`). It replaces the old recovery code with the new one and shows the owner's username. (Or paste the SQL between the quotes into the dashboard: D1 → `lms-lego` → Console.)
3. Open the address at `/recover`: username, the new code, a new password. Every old sign-in ends and a further new code is shown, to keep on paper. If `/recover` says to wait, five wrong attempts locked the username for 15 minutes.

CI walks this end to end against the local database (`test/deploy/last-resort.test.ts`): the new code works once on `/recover`, the old code is refused, old sign-ins end, the new password signs in, and `/setup` stays closed.

**Origin.** The brainstorm that led here compared Moodle, Open edX, Canvas, Frappe Learning, LearnHouse, Chamilo, BookStack and Google Classroom, and ended at two conclusions: the owner's real need is small (subject, chapter, lesson, material, with controlled access), and zero recurring cost is a hard requirement. Both conclusions shaped the product contract and the hosting decision.
