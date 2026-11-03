# Later

Ideas recorded so they are not lost and not competing with the current release. Nothing here is scheduled until the current promise is accepted. Each line names the trigger that would bring it forward.

## From the owner's launching ideas

| Idea | Why it waits | Trigger to bring it forward |
|---|---|---|
| **Gamification packs** (points, badges, figures and themes fitted to the environment: a school mascot, a company's values, a university crest) | Needs a working learning space first; the kit format already reserves the slot | An organization completes one subject end to end and asks for motivation features |
| **Subject editions** (the same subject taught by different publishers in different versions) | Multiplies screens and permissions; one publisher per subject covers the first organization | Two publishers need to teach the same subject to different groups in one organization |
| **Owner marketplace of kits** (the owner publishes ready-made kits that organizations pick from) | The first kits are hand-made by the owner inside the product | More than three organizations are live |
| **Admin delegation tiers** (admins who appoint sub-admins) | One admin per organization is enough for the first release | An organization asks for departments with their own admins |
| **Per-space data export** (an admin downloads their space's people and content as a file) | The first release relies on the database's built-in 30-day history; an export needs its own privacy decision on who may hold it | An organization asks for its own copy, or the pilot runs longer than 30 days |
| **Usage dashboards** for the owner and admins (who opened what, when) | Not part of the release promise; raises privacy questions that deserve their own decision | The owner asks what organizations actually use |

## Owner ideas added 31 October 2026, after the founding package

Recorded here, not in release 1, under "completion before expansion". Each is written as a future release promise so it can become a contract of its own without reopening release 1. The data-model notes say what release 1 must *not* do, so these stay cheap later.

### A. Guardian accounts (father, mother, or a supervisor at work)

**Future promise:** a guardian signs in and sees, read-only, what each of their learners has been assigned and how they are doing, from beginning to end.

- **In Lego terms** this is a ninth canonical concept, **Guardian**, linked to one or more learners (a learner may have two). The School kit labels it Parent / ولي أمر; the Company kit labels the same concept Supervisor / مشرف, a line manager watching their team's training. One concept, two meanings, no new code per kit.
- **Who appoints:** the admin, with validity dates, exactly like publishers and learners. The space verifies the family relationship; the product never guesses it.
- **What "monitor" means** must be decided before building: the assigned subjects (free), exam results (needs idea B), and whether a lesson was opened (needs a view log, which is a privacy decision for the owner, RED).
- **Release 1 keeps it cheap:** `membership.role` is text, so `guardian` is one more value; a `guardian_link (guardian_user_id, learner_user_id, space_id)` table is added when the release starts. Nothing in release 1 assumes a person holds only one role.
- **Trigger:** the pilot school asks for parents to see results, or idea B is approved.
- **Status (3 November 2026):** in release 2 ("Guardians and results", contract `product-contract-r2` on PIL-120): the guardian role and links are built in task R2-a; results views in R2-c; the lesson-opened date (owner decision: yes, switched off by default) in R2-d.

### B. Exam results published through the space

**Future promise:** a publisher records the results of one exam for a whole group in one step, and each learner (and their guardian) sees only their own results, from beginning to end.

- **Shape:** each subject has a set of exams (title, date, maximum mark). For each exam the publisher opens one page that lists the assigned learners with an empty mark box each, fills it in, and presses Publish once. That is the "one step". A spreadsheet upload can be added, but names in a file must be matched to accounts, and a mismatch in Arabic spelling would publish a mark to the wrong child; the pre-filled page avoids that risk.
- **Views:** learner sees own marks; guardian sees their learners' marks; admin sees the whole space; publisher sees their subjects.
- **Non-negotiables:** a published mark can be corrected, and the correction keeps the previous value and who changed it (data integrity); a learner must never see another learner's row (privacy, tested like AT-4).
- **Release 1 keeps it cheap:** `exam (subject_id, title, date, max_mark)` and `exam_result (exam_id, user_id, mark, note, published_at, changed_by)` are two new tables; nothing in release 1 needs to change. The Later list's "Quizzes and grading" means tests taken inside the product; this idea is results entered by the teacher, which is far smaller, and comes first.
- **Trigger:** the pilot school finishes its first term on the space.
- **Status (3 November 2026):** in release 2 (the owner chose to start it without waiting for the trigger): exams, the one-page marks entry with draft and atomic Publish, and My results are task R2-b (migration `0008_exams.sql`); corrections with history and the other views are R2-c.

### C. Printing orders through a contracted shop

**Future promise:** a learner asks for a material to be printed, their guardian approves the purchase, the order reaches the contracted print shop, and the learner collects it, from beginning to end.

- **Why it is RED before any work starts:** it involves money, a contract with an outside business, and giving that business access to lesson files. Each needs the owner's decision: who sets prices, who collects payment, who is liable if a file leaks.
- **Simplest safe shape:** a new role **Vendor** per space (the shop's account), a price list per page count, and an order with five states: requested by learner → approved by guardian → sent to shop → ready → collected. The shop sees only the files of approved orders, through time-limited links, with the space's name watermarked on each page. Payment stays outside the product in its first version (the guardian pays the shop at collection), so no card processing, no refunds, no financial records to protect.
- **Needs first:** idea A (guardians), because the approval step is the guardian's.
- **Release 1 keeps it cheap:** materials already have a stable id and a storage key, which is all an order needs to reference.
- **Trigger:** guardians exist, and one school has a print shop willing to sign the contract.

### D. Password set and reset verified by the registered mobile number (WhatsApp)

**Future promise:** a person who forgot their password proves it is them through the mobile number registered on their account, by WhatsApp, and sets a new password without anyone's help, from beginning to end.

- **Why it matters:** the critic's first finding was that admins become the help desk for forgotten passwords. Release 1 answers it with "whoever appointed you can set you a new password". This idea removes even that step.
- **Whose number:** an adult's own; for a child, the guardian's number (idea A). The number is personal data of a parent or employee and is stored only for this purpose, never shown to other users and never used for marketing.
- **Three shapes, from free to paid.** Checked 31 October 2026 against Meta's published rates for Egypt and current third-party rate cards; the Builder re-reads the official page before any work.

| Shape | How it works | Recurring cost | Needs an account? |
|---|---|---|---|
| **D1. Prepared message, sent by a person** | The appointer (admin, or the guardian for a child) presses "Send reset link by WhatsApp"; the product opens WhatsApp on their phone with the registered number and a one-time link already typed; they press Send | $0 | No. Uses the person's own WhatsApp; the product never talks to Meta |
| **D2. Code sent by the product** | The user presses "Forgot password", the product sends a 6-digit code to the registered number through Meta's WhatsApp Cloud API, the user types it and sets a new password | About $0.0036 per message plus 14% VAT in Egypt (a 300-person school with a few resets each per year: under $5 a year). Egypt also has a higher "authentication-international" rate if the sending business is registered outside Egypt | Yes: a Meta Business account, business verification, a dedicated phone number and a card on file. RED: an account and a paid service |
| **D3. Code sent by SMS** | Same as D2 over SMS | Several times the WhatsApp rate per message | Yes: an SMS provider account. RED |

- **Status:** D1 joined release 1 as contract version 0.3 (AT-2 step 3) on the owner's answers of 31 October 2026. D2 waits for the first organization that asks for self-service and accepts the few dollars a year, and for the owner's RED decision on the Meta account. D3 only if WhatsApp is unavailable to a user.
- **Non-negotiables for D2 and D3:** a code expires in 10 minutes, five wrong attempts lock the code, no more than three codes per number per hour, and a code is never written to any log.
- **Release 1 keeps it cheap:** an optional `user.mobile` column (E.164 format, verified flag) is added when D starts; one-time links already exist in spirit as session tokens, so D1 is a short page and a `wa.me` link.
- **Trigger for D2:** an organization asks for self-service reset, or the owner wants mobile-based recovery of the owner account (question 6), and the owner takes the RED decision on the Meta Business account.

## From release 1.1 (2 November 2026)

| Idea | Why it waits | Trigger |
|---|---|---|
| **Arabic-aware search** (fold أ/إ/آ to ا, ى to ي, ة to ه, ignore diacritics) | Needs a stored normalised name column and a migration; release 1.1 search matches letter for letter | An admin reports not finding a name typed another way |
| **Correcting a username or a role** | Usernames are global and sign-in keys; a role change touches assignments | An appointment mistake that ending and re-appointing cannot fix |
| **Merging duplicate groups or subjects** | Moves assignments and content between rows | A school creates duplicates |
| **Emptying "Recently removed"** to free storage | Release 1.1 deletes nothing permanently by design | Storage passes half of the free 10 GB |
| **Audit history** of who changed what | Beyond `granted_by`; needs its own privacy decision | The owner or a school asks who changed something |

## From release 2 (3 November 2026)

From the Later list of the frozen contract `product-contract-r2` (PIL-120, section 7). Each waits for its own decision.

| Idea | Why it waits |
|---|---|
| Hide or restore an exam; withdraw a published result | Release 2 corrects a wrong mark with a reason instead (R2-c); an unpublish needs its own privacy rule |
| Spreadsheet upload of marks | Names in a file must be matched to accounts; the pre-filled page avoids publishing to the wrong child |
| Averages, grades, rankings, term reports | Not part of the release 2 promise; each changes what a learner and a guardian see |
| Notifications of a mark or an open | Paid services and a privacy decision (RED) |
| A guardian across several organizations; delegated teachers | One space per person in release 2 |
| Guardian approving print orders | Release 4 (idea C) |
| Token out of the reset address | PIL-109 Later item 1; parked unless the owner revisits it (the retry feedback, item 2, is in R2-b) |
| Lesson activity for publishers or admins; time of day, duration or count of an open; per-person opt-out; a deletion screen; keeping activity when switched off; any automatic retention limit | Release 2 records the least it can (AT-15); each widens it |

## From the brainstorm comparison

| Idea | Why it waits |
|---|---|
| Quizzes, grading, certificates, attendance, homework, SCORM, forums, messaging, calendars, AI tutors | Exactly the features that made the big LMS platforms too heavy for the owner's need; each is a separate release promise |
| Video uploads (rather than links) | Free storage is 10 GB; uploads would exhaust it with a handful of lessons. Links to YouTube unlisted, Vimeo or Drive cost nothing |
| Email invitations and password resets by email | Free hosting sends no email. Admin-set passwords cover the first release |
| Parent accounts, student information system, payments, CRM | Belong to the "LMS plus business platform" direction (Frappe), which the owner did not choose |
| Single sign-on with Google or Microsoft accounts | Useful for schools on Google Workspace; adds account and credential decisions (RED) |
| Mobile app | The web pages must work on a phone first; a native app is a separate product |

## Technical ideas parked by the hosting decision

| Idea | Why it waits |
|---|---|
| Paid Workers plan ($5 per month) | Only when the free limits in [03-HOSTING-DECISION.md](03-HOSTING-DECISION.md) are actually hit |
| Self-hosted VPS or Oracle free ARM machine | Only if Cloudflare's model proves unfit; it adds server upkeep the owner cannot do |
| Switching to Frappe Learning | Only if the owner decides the business-platform features above matter more than the Lego shaping |
