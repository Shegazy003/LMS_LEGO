# Current progress

## Current state, 1 November 2026 (late night, UTC): RELEASE 1 ACCEPTED and live

**What is true now**

- **Release 1 is live** at **https://lms-lego.lmslego.workers.dev** on the owner's Cloudflare account (Workers Free plan, D1 `lms-lego`, R2 `lms-lego-files`).
- **The owner accepted release 1** on 1 November 2026 after the go-live sitting:
  - owner first setup was completed immediately after the first deploy, and the recovery code is on paper;
  - Mesk School was shaped and its admin appointed on the public address (AT-1 step 4);
  - one real WhatsApp reset link was sent from a phone and used (AT-2 step 6);
  - a PDF was uploaded by a publisher and opened by a learner in a real browser;
  - Cloudflare Metrics: 164 invocations, CPU time 3 ms, 0 errors (no error 1102), which confirms password option B (10,000 iterations) fits the free plan.
- **Deploy record:** first run 41357099847 deployed but its smoke check met a fresh-address 404. Build task 9 (#21) taught the check to wait through it. Rerun 41361374176 on `258bbdb` passed every step. Live version `3d84e561`.
- **Delivered through the line since the owner's delegation:** AT-1 (#4), AT-4 (#6), AT-3 (#8), AT-2 (#10), AT-5 (#13), deploy rails (#15, one HOLD then PASS), password strength setting (#17), option B applied (#19), smoke-check fix (#21). Every one went Builder → Lead → Independent Verifier PASS → merged with green CI on `main`. Track record in [decision 002](docs/06-DELEGATION-AND-ROLES.md).
- Contract 0.3 is closed as accepted.

**Active priority:** none in build. Release 1 is in use at Mesk School.

**Handover:** the owner is moving the work from Claude Code on the cloud to Claude Desktop. Everything needed to continue is in the repository; start with [docs/08-HANDOVER.md](docs/08-HANDOVER.md). The founding brainstorm and the source of the two visual pages are now in `docs/history/` and `docs/visual/`; brief templates are in `docs/templates/`.

**Next, by the roadmap ([docs/05-ROADMAP.md](docs/05-ROADMAP.md)):** R2 (guardians and exam results) starts when Mesk School has used R1 for one term, or earlier if the school asks for results. Its first step is a new contract from the Product Manager, one critic review, and one batch of owner questions, including the open privacy decision on whether a guardian may see that a lesson was opened.

**Welcome any time:** subject names from Hadeer and Shimaa; the owner's pass over the Arabic kit labels (the owner can now edit labels directly in the kit editor); feedback from the school's first weeks.

**Small follow-ups (not blocking, each a short task when the owner wants it):** switch on Workers Logs for troubleshooting; a test that drives a concurrent password change against the guarded re-hash; direct sweep cases for a null Origin, other port, scheme and subdomain; a custom domain before a second organization (about $10 a year, owner's purchase); move to password option A ($5 a month) when a second organization joins.

**Known limits of release 1:**
- the admin cannot rename, end early or remove people, groups or subjects;
- the editor cannot rename or delete;
- five wrong passwords lock a username for 15 minutes;
- uploads are buffered in memory up to 25 MB;
- usage counts are approximate;
- end dates are UTC days;
- there is one language choice per person;
- the Verifier ran on a different Anthropic model rather than a different vendor (exception in decision 002).

## Earlier: owner chose storage A and passwords B; task 8 (historical)

**What is true now**

- **All five acceptance tests of release 1 are delivered:** AT-1 (#4), AT-4 (#6), AT-3 (#8), AT-2 (#10) and AT-5 (#13). Each went Builder → Lead ACCEPTED → Verifier PASS → merged, with CI green on `main`.
- **First-deploy rails delivered** (#15, merge `196ada9`, PASS after one rework). **The deploy workflow has never run.**
- **Password strength as a setting delivered** (#17, merge `7fbe525`):
  - every stored password carries its own strength;
  - `PASSWORD_ITERATIONS` is read strictly: floor 10,000, ceiling 100,000, and a bad value refuses to serve;
  - a password is re-hashed at the next sign-in, in either direction;
  - today's 100,000 is unchanged and asserted by the production guard;
  - local measurement puts a sign-in at about 44 ms at 100,000 and about 4.4 ms at 10,000.
- Contract 0.3 stays frozen. Nothing is deployed. Release 1 is accepted only after the go-live sitting (AT-1 step 4, AT-2 step 6).

**Active priority:** none in build. The delivery line waits on the owner's RED bundle. No further build work is authorized by the plan until it is answered, apart from the small task that applies password option B, if chosen.

**Owner's answers (1 November 2026):** file storage **A** (keep R2, card on file); password strength **B** (free plan, 10,000 iterations, applied before the first deploy). Recorded in [docs/07-FIRST-DEPLOY.md](docs/07-FIRST-DEPLOY.md).

**Waiting on the human owner:**
1. The Cloudflare account, R2 payment method and one deploy key, stored as GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The owner asked for the steps: they are in the visual guide "LMS Lego Cloudflare Setup" and in docs/07 steps A to C. The token needs D1 Edit added to the "Edit Cloudflare Workers" template (which already carries R2 Edit), and Workers & Pages must be opened once first so the free subdomain exists.
2. The go-live sitting, after task 8 is merged and the owner says "secrets added".

Still welcome any time: subject names from Hadeer and Shimaa; the owner's pass over the Arabic kit labels.

**Live-sitting risks (documented):** a first-time workers.dev subdomain; the R2 payment method; the deploy key needs D1 Edit and R2 Edit; edge CPU differs from local measurement.

**Carried notes (not blocking):**
- no test drives a concurrent password change against the guarded re-hash;
- the cost table gives medians only;
- direct sweep cases are wanted for a null Origin, a different port or scheme, and a subdomain (partly added in task 6);
- Safari before 16.4 is refused on the reset form.

**Known limits of release 1:**
- The admin cannot rename, end early or remove people, groups or subjects.
- The editor cannot rename or delete.
- Five wrong passwords lock a username for 15 minutes.
- Uploads are buffered in memory up to 25 MB.
- Usage counts are approximate.
- End dates are UTC days.
- One language choice per person.
- The Verifier ran on a different Anthropic model rather than a different vendor (exception in decision 002).

## Earlier on 1 November 2026 (evening): deploy-ready, task 7 opened (historical)

**What is true now**

- **All five acceptance tests of release 1 are delivered** (AT-1 #4, AT-4 #6, AT-3 #8, AT-2 #10, AT-5 #13), each Builder → Lead ACCEPTED → Verifier PASS → merged, with CI green on `main`.
- **First-deploy rails delivered** (pull request #15, merge `196ada9`). This covers:
  - a deploy workflow that runs only when started by hand on `main`, with read-only permissions; secrets reach only the Cloudflare steps;
  - D1 and R2 created if missing, migrations applied before the new code, and a smoke check of the live address;
  - the owner's last-resort reset: the code is made locally, and one command installs it;
  - an ordered theme save, and near-origin sweep cases.
  The Verifier gave HOLD on one item (the smoke check accepted a 200 on `/`). The fix was red first, and the re-check gave PASS. **The deploy workflow has never run.**
- **A go-live risk found by task 6:** the Workers Free plan's 10 ms CPU limit against PBKDF2 at 100,000 iterations (about 45 to 65 ms locally). This is now decision 2 in the owner's bundle ([docs/07-FIRST-DEPLOY.md](docs/07-FIRST-DEPLOY.md)).
- Contract 0.3 stays frozen. Nothing is deployed. Release 1 is accepted only after the go-live sitting: AT-1 step 4 and AT-2 step 6.

**Active priority:** build task 7. It makes password strength a setting stored with each password, and upgrades a password at the next sign-in. **Today's strength stays the default,** so the owner's decision changes one setting, not code. This prepares either answer; it decides nothing.

**Waiting on the human owner (RED, one bundle):**
1. **File storage.** A (recommended): a card when Cloudflare asks, with 10 GB free. B: no card, Workers KV, 1 GB.
2. **Password strength.** A: Workers Paid at $5 a month. B (recommended for the pilot): stay free with lighter hashing, then A when a second organization joins.
3. **Account and secrets.** The Cloudflare account and one deploy key, stored as GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. **A go-live sitting.** The delegate starts the deploy. The owner completes `/setup` at once and keeps the recovery code on paper. Then AT-1 step 4 and AT-2 step 6, and a check of the PDF viewer in a real browser.

Still welcome any time: subject names from Hadeer and Shimaa; the owner's pass over the Arabic kit labels.

**Live-sitting risks (documented):**
- A first-time workers.dev subdomain: the owner opens Workers & Pages once.
- The R2 payment method.
- The deploy key needs D1 Edit and R2 Edit.
- The CPU limit above.

**Known limits of release 1:** unchanged from the previous state below.

## Earlier on 1 November 2026 (afternoon): release 1 code-complete, task 6 opened (historical)

**What is true now**

- **All five acceptance tests of release 1 are delivered and merged**, each Builder → Lead ACCEPTED → Verifier PASS → merged, with CI green on `main` (track record in [decision 002](docs/06-DELEGATION-AND-ROLES.md)):
  - AT-1 (#4, `c9a69e3`): the owner shapes a space and appoints its admin.
  - AT-4 (#6, `b47eca6`): a learner sees exactly what was assigned.
  - AT-3 (#8, `58f8ba6`): the publisher builds the subject.
  - AT-2 (#10, `d75f138`): the admin staffs the space, assigns a subject, sends WhatsApp reset links.
  - AT-5 (#13, `8133ded`): the owner's kit editor and per-person language; a kit switch changes every word with no code change; every form refuses a cross-origin post; usernames, display names and labels are bounded.
- **Release 1 is not yet accepted**: two owner-only steps remain, and both need the public address. AT-1 step 4 is the owner's acceptance on the public address; AT-2 step 6 is one real WhatsApp send from a phone. The PDF viewer and its sandbox are re-checked in a real browser at the same sitting.
- Contract 0.3 stays frozen. Nothing is deployed.

**Active priority:** build task 6, the first-deploy rails. It adds a deploy workflow that runs only on a manual start, the owner's last-resort reset (tested against local emulation), the README's first-deploy section, and a re-read of the official free-tier figures and WhatsApp rates. It deploys nothing by itself. Steps and decisions for the owner are in [docs/07-FIRST-DEPLOY.md](docs/07-FIRST-DEPLOY.md).

**Waiting on the human owner (RED, one bundle):**
1. **File storage:** A (recommended), add a payment card when Cloudflare asks before creating R2 storage, with 10 GB free; or B, no card, files moved to Workers KV with 1 GB free, which costs one more build task.
2. **The Cloudflare account and one deploy key**, pasted into GitHub's repository secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
3. **A go-live sitting:** the delegate starts the first deploy; the owner completes first setup immediately and keeps the recovery code on paper; then AT-1 step 4 and AT-2 step 6.

Still welcome any time: the subject names from Hadeer and Shimaa ("Mathematics" stands in); the owner's pass over the Arabic kit labels.

**Carried notes (none block release 1):** sweep cases for a null Origin, another port or scheme, and a subdomain; the theme save writes the logo before the colour; one stale test title; Safari before 16.4 is refused on the reset form (unchanged from Hono's rule).

**Known limits of release 1:**
- The admin cannot rename, end early or remove people, groups or subjects.
- The editor cannot rename or delete.
- Five wrong passwords lock a username for 15 minutes.
- Uploads are buffered in memory up to 25 MB.
- Usage counts are approximate, and end dates are UTC days.
- One language choice per person.
- The Verifier ran on a different Anthropic model rather than a different vendor (exception in decision 002).

## Earlier on 1 November 2026 (midday): AT-1, AT-4, AT-3 and AT-2 delivered, task 5 opened (historical)

**What is true now**

- **AT-1 delivered** (pull request #4, merge `c9a69e3`): owner setup and recovery code, spaces on kits, admins with end dates, the admin's themed view, the "access ended" refusal, the usage panel.
- **AT-4 delivered** (pull request #6, merge `b47eca6`): the learner sees exactly the assigned, published subjects; files behind access checks; change own password; role gating; cross-space isolation.
- **AT-3 delivered** (pull request #8, merge `58f8ba6`): the publisher's editors; content-sniffed uploads; links; notes; publish and unpublish; another publisher refused; the role-gate guard.
- **AT-2 delivered** (pull request #10, merge `d75f138`): the admin appoints publishers and learners with end dates and normalised mobiles, forms groups, creates subjects with a responsible publisher and readers, sets passwords directly, and sends one-time WhatsApp reset links (number confirmation, WhatsApp and Copy buttons, fixed message in the space language, username required, single use, 30 minutes). Also delivered: the owner's reset tools for admins; a rate limit on failed sign-ins, reset usernames and the recovery code; start dates honoured; the AT-1 midnight flaw fixed; the role guard's two-parameter gap closed; the runner image in the CI cache key. Red before green; Lead ACCEPTED; Verifier PASS on `11ae007`; CI green on `main`.
- Contract 0.3 stays frozen. Nothing is deployed.

**Active priority:** build task 5, acceptance test **AT-5** (the owner switches Mesk School's kit and renames a label; every page changes, content survives, another space is untouched, an account's language flips the layout, and no code changes). It is the last acceptance test of release 1.

**Carried into task 5:**
- a cross-origin sweep over the admin and reset forms, as AT-3 did for editing;
- cap username length before building the rate-limit key;
- bound the length of display names placed in the WhatsApp message;
- the Arabic expiry sentence reads correctly whatever the admin label is (today «تواصل مع مدير»);
- the mixed-script link hint renders cleanly right-to-left.

**Carried to the first-deploy task (before AT-1 step 4 and AT-2 step 6):** the owner's last-resort reset documented and tested; owner setup immediately after the first deploy; re-check PDF viewing and its sandbox in a real browser; one real WhatsApp send on a phone; re-read the Cloudflare free-tier figures and WhatsApp rates.

**Waiting on the human owner:** nothing for task 5. Still open: subject names from Hadeer and Shimaa ("Mathematics" stands in), the Cloudflare account (needed for the first deploy, which follows task 5).

**Known limits of this checkpoint:** the admin cannot yet rename, end early or remove people, groups or subjects; the editor cannot rename or delete; a username can be locked for 15 minutes by five wrong passwords; uploads are buffered in memory up to 25 MB; usage counts are approximate; end dates are UTC days; the Verifier runs on a different Anthropic model rather than a different vendor (exception in decision 002).

## Earlier on 1 November 2026 (morning): AT-1, AT-4 and AT-3 delivered, task 4 opened (historical)

**What is true now**

- **AT-1 delivered** (pull request #4, merge `c9a69e3`): owner setup and recovery code, spaces on kits, admins with end dates, the admin's themed view, the "access ended" refusal, the usage panel.
- **AT-4 delivered** (pull request #6, merge `b47eca6`): the learner sees exactly the assigned, published subjects; files behind access checks; change own password; role gating; cross-space isolation in queries, schema and live tests.
- **AT-3 delivered** (pull request #8, merge `58f8ba6`): the publisher's home, subject editor and lesson editor; content-sniffed PDF and image uploads up to 25 MB (SVG refused for lesson files); video and web links (http and https only); notes; move up and down; publish and unpublish, observed from the learner's side; another publisher refused on every editing action; a guard that every admin and publisher route is role-gated; CI browser install cached and retried. Red before green; Lead ACCEPTED; Verifier PASS on `5ce7c4d`; CI green on `main` after the merge.
- Contract 0.3 stays frozen. Nothing is deployed.

**Active priority:** build task 4, acceptance test **AT-2** (the admin appoints Hadeer, Shimaa and two learners with end dates and registered mobiles, forms the Science group, creates the subject and assigns it, and sends a one-time reset link through WhatsApp with the safeguards in contract section 8). Same route as before.

**Carried into task 4:**
- a sign-in rate limit (the reset link adds a second door);
- membership checks honour `valid_from` as well as `valid_until`;
- make the AT-1 test independent of the time of day (it fails if a run crosses midnight UTC; a test flaw, not a product flaw);
- the role guard also catches a two-parameter `app.all` handler;
- add the runner image version to the CI browser cache key.

**Carried to the first-deploy task (before AT-1 step 4):** the owner's last-resort reset documented and tested; owner setup immediately after the first deploy; re-check PDF viewing and its sandbox in a real browser during the owner's acceptance.

**Owner's Arabic label pass (collected):** «تواصل مع مدير» should read «المدير»; the link hint that mixes Arabic and Latin renders oddly in right-to-left.

**Waiting on the human owner:** nothing for task 4. Still open: subject names from Hadeer and Shimaa ("Mathematics" stands in), the Cloudflare account (before the first public address).

**Known limits of this checkpoint:** the editor cannot rename or delete yet; uploads are buffered in memory up to 25 MB; usage counts are approximate; end dates are UTC days; no sign-in rate limit until task 4; the Verifier runs on a different Anthropic model rather than a different vendor (exception in decision 002); free-tier figures and WhatsApp rates must be re-read before the first deploy.

## Earlier on 1 November 2026: AT-1 and AT-4 delivered, task 3 opened (historical)

**What is true now**

- **AT-1 delivered** (pull request #4, merge `c9a69e3`): owner setup and recovery code, spaces on kits, admins with end dates, the admin's themed view, the "access ended" refusal, the usage panel.
- **AT-4 delivered** (pull request #6, merge `b47eca6`): learner home with exactly the assigned and published subjects, subject and lesson pages, the five material kinds with files served through access checks, change own password, role gating (learners never reach admin or publisher pages), and cross-space isolation enforced in queries, in the database schema and in live tests. Red before green; Lead ACCEPTED; Verifier PASS on `cc20ec3`; CI green on `main` after the merge.
- Contract 0.3 stays frozen. Nothing is deployed.

**Active priority:** build task 3, acceptance test **AT-3** (the publisher builds the subject: chapter, lesson, PDF and image uploads, video link, web link, note, publish; a file that is not a PDF or image is refused with a plain message). Same route as before.

**Carried into the plan** (none blocked a delivered test):
- *Task 3 (AT-3):* make the CI browser install reliable (one attempt timed out before any test ran); a guard test that every non-learner route sits under the role-gated prefixes.
- *Task 4 (AT-2):* role gating for any new admin routes under the same guard; a sign-in rate limit (the reset link adds a second door); membership checks honour `valid_from` as well as `valid_until`.
- *First-deploy task (before AT-1 step 4):* the owner's last-resort reset documented and tested; owner setup immediately after the first deploy; re-check the PDF sandbox in a real browser during the owner's acceptance.
- *Owner's Arabic label pass:* the expiry line reads «تواصل مع مدير»; natural Arabic wants «المدير». Collected with the other first-draft kit labels for the owner.

**Waiting on the human owner:** nothing for task 3. Still open: subject names from Hadeer and Shimaa ("Mathematics" stands in), the Cloudflare account (before the first public address).

**Known limits of this checkpoint:** content can be created only through the test seeding route until tasks 3 and 4 land; usage counts are approximate; end dates are UTC days; no sign-in rate limit yet; the Verifier runs on a different Anthropic model rather than a different vendor (exception in decision 002); free-tier figures and WhatsApp rates must be re-read before the first deploy.

## Earlier on 31 October 2026 (late night): AT-1 delivered, task 2 opened (historical)

**What is true now**

- **AT-1 is delivered** (pull request #4, merge `c9a69e3`). Owner first setup with a one-time recovery code and regeneration; sign-in with server-side sessions and CSRF protection; spaces on the three seed kits with logo, colour and default country code; admins appointed with a normalised mobile and an end date; the admin's themed right-to-left view; the "access ended" message and 403 on every direct link after the end date; the owner's usage panel against the free lines. Red before green in CI; Lead ACCEPTED; Verifier PASS on `6362b97`. Track record in [decision 002](docs/06-DELEGATION-AND-ROLES.md).
- Contract 0.3 stays frozen. Hosting decision 001 stands. Nothing is deployed.

**Active priority:** build task 2, acceptance test **AT-4** (a learner sees exactly what was assigned, and nothing after the end date). Same route: Opus Builder in its own worktree on `build/at-4` → red then green in CI → Lead stamp → Sonnet Verifier → delegate merges on PASS.

**Carried into the plan from the Verifier's notes on task 1** (none blocked AT-1):
- *Task 2 (AT-4):* gate the space home and space pages by role, so a learner never gets the admin home; prove one space cannot read another's rows.
- *Task 4 (AT-2):* role gating for publisher pages; a sign-in rate limit (the reset link adds a second door).
- *First-deploy task (before AT-1 step 4, the owner's acceptance on the public address):* the owner's last-resort reset written into the README and tested; the owner does first setup immediately after the first deploy, because /setup is open to whoever arrives first until then.

**Waiting on the human owner:** nothing for task 2. Still open: subject names from Hadeer and Shimaa (before AT-2), the Cloudflare account (before the first public address).

**Known limits of this checkpoint:** usage counts are approximate and can only read low; end dates are UTC days; no sign-in rate limit yet; the Verifier runs on a different Anthropic model rather than a different vendor (exception in decision 002); free-tier figures and WhatsApp rates must be re-read before the first deploy; Arabic kit labels are first drafts.

## Earlier on 31 October 2026 (night): contract 0.3 frozen, build task 1 opened (historical)

**What is true now**

- Contract 0.3 was approved by merging pull request #2 (merge `b010037`). It is frozen; changes are a new version with stated impact.
- The owner delegated acceptance and merging to the founding Claude session and asked for every role to run as its own agent on a fitting model: [decision 002](docs/06-DELEGATION-AND-ROLES.md). Accounts, money, first public publication and data deletion stay with the human owner.
- Hosting decision 001 stands. Nothing is deployed; the owner's Cloudflare account is needed only for the first public address.

**Active priority:** build task 1, acceptance test AT-1 (owner first setup and recovery code, sign-in, create a space with a seed kit, appoint an admin with an end date, the admin's themed right-to-left view, the "access ended" message and refused links after expiry, the owner's usage panel). Builder: a fresh Opus agent in its own worktree on branch `build/at-1`. Route: failing tests committed first → implementation → pull request → CI with a named `AT-1` step → Lead stamp → Verifier (Sonnet, read-only) `PASS` → delegate merges.

**Waiting on the human owner:** nothing for this task. Still open for later tasks: subject names from Hadeer and Shimaa (before AT-2), the Cloudflare account (before the first public address).

**Next action, already defined:** on `PASS` of task 1, cut task 2 (AT-4: learner view and refusals), per the order in the contract.

**Known limits of this checkpoint:** the free-tier figures in the hosting decision and the WhatsApp rates in Later D were checked on 31 October 2026 and must be re-read before the first deploy; the Arabic labels in the kits are first drafts for the owner to correct; the Verifier runs on a different Anthropic model rather than a different vendor (exception recorded in decision 002).

## Earlier on 31 October 2026 (evening): contract 0.3 `CONTRACT READY` (historical)

**What is true now**

- The owner answered questions 1 to 7 and asked for more on 8. The answers are recorded in section 7 of [docs/01-PRODUCT-CONTRACT.md](docs/01-PRODUCT-CONTRACT.md): pilot Mesk School with teachers Hadeer and Shimaa and the Science class; username and password sign-in; videos as links; the owner creates the Cloudflare account; GitHub holds tasks and reviews; owner recovery by registered mobile as the goal (recovery code until the product can send messages); free address for the pilot.
- Contract version 0.3 adds one free step to AT-2: the admin sends a one-time reset link through their own WhatsApp to the registered number. The critic took one focused look at the 0.3 delta and returned seven findings (link security, CI observability, the child path, message text, no-WhatsApp dead end, number format, lost recovery code); all seven are resolved in the contract's section 8 without changing the promise.
- [docs/05-ROADMAP.md](docs/05-ROADMAP.md) now places every parked idea on one line of releases (R1 to R5) with the decision each needs and the event that starts it, and explains why release 1 is kept small.
- Hosting decision 001 stands. Nothing is deployed; the owner's Cloudflare account is needed only for the first public address.
- Pull request #1 carries all of this. **The owner's merge of that pull request approves contract 0.3 and freezes it.**

**Active priority:** owner approval of contract 0.3 (merge of pull request #1).

**Waiting on the owner:** the merge; and the subject names from Hadeer and Shimaa, which can arrive any time before AT-2 is built ("Mathematics" stands in).

**Next action, already defined:** after the merge, the Project Lead cuts the first build task, AT-1 (owner shapes a space, appoints an admin, expiry message, usage panel), with its failing tests written first.

**Known limits of this checkpoint:** the free-tier figures in the hosting decision and the WhatsApp rates in Later D were checked on 31 October 2026 against Cloudflare's changelog and third-party rate cards and must be re-read before the first deploy; the Arabic labels in the kits are first drafts for the owner to correct.

## Earlier on 31 October 2026: founding package, contract 0.2 (historical)

**What is true now**

- The repository holds the founding documents and the test rails. There is no product code yet.
- The product contract is version 0.2, `CONTRACT READY`. The product critic's one review (seven findings) is recorded in its section 8 and every finding is resolved. Nothing is frozen until the owner approves.
- Hosting decision 001 (Cloudflare free plan) is proposed; the owner's only action is creating the account, and it is not needed until the first public address.
- The operating rules inherit the platform's roles and decision classes ([AGENTS.md](AGENTS.md)). No Paperclip, Publisher watcher or laptop machinery is required to start.

**Active priority:** owner approval of the contract. One priority, nothing else in progress.

**Waiting on the owner (one bundle):** approve contract 0.2, and answer the seven questions in [docs/01-PRODUCT-CONTRACT.md](docs/01-PRODUCT-CONTRACT.md) section 7. Two of them are RED (the owner account's recovery code, and the hosting account), the rest have recommended answers that stand if the owner says nothing.

**Next action, already defined:** after owner approval, the Project Lead cuts the first build task: AT-1 (owner shapes a space, appoints an admin, validity refusal), with its failing tests written first.

**Owner ideas received 31 October 2026, after the founding package:** guardian (parent) accounts, exam results published per exam in one step, and print orders approved by a guardian and fulfilled by a contracted shop. Recorded as Later A, B and C with future promises, data-model notes and triggers; release 1 scope unchanged, so the contract stays at version 0.2 and needs no second critic review. Idea C is RED before any work (money, outside contract, file access). A fourth idea, password reset verified by the registered mobile number over WhatsApp, is Later D with three shapes; its free shape (a prepared message sent from the appointer's own WhatsApp) is offered to the owner as question 8, and would make the contract version 0.3 with one step added to AT-2.

**Known limits of this checkpoint:** the free-tier figures in the hosting decision were checked against Cloudflare's changelog and pricing summaries on 31 October 2026 and must be re-read before the first deploy; the Arabic labels in the kits are first drafts for the owner to correct.
