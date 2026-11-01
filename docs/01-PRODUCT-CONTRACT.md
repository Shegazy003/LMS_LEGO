# Product contract: LMS Lego, release 1

**Accepted:** release 1 was accepted by the owner on 1 November 2026 (UTC) on the public address `https://lms-lego.lmslego.workers.dev`, after AT-1 to AT-5 passed in CI and the owner-only steps (AT-1 step 4, AT-2 step 6) passed live. This contract is closed; release 2 gets its own contract.

**Version:** 0.3, 31 October 2026. **Status:** `CONTRACT READY`, with the owner's answers to questions 1 to 7 recorded in section 7 and one addition from question 8 (the free WhatsApp reset link, one step in AT-2). The product critic's review of version 0.2 is in section 8. **The owner approves this version by merging the pull request that carries it**; from that merge the contract is **frozen**, and later changes are a new version with an explained impact.

## 1. User and problem

The user is the **owner**: a non-technical person who wants to give organizations an organized learning space and run it as their own product. Today, giving a school or a company a place to share lessons means either a heavy LMS that needs a developer to set up and shape, or a borrowed tool (Google Classroom) that carries someone else's name, names and rules. The owner wants to shape a space in minutes, hand it to an administrator, and never be the help desk.

Behind the owner stand three people the space must also serve: an **admin** who appoints people and assigns subjects, a **publisher** (teacher, trainer, lecturer) who builds subjects out of chapters, lessons and materials, and a **learner** (student, employee, trainee) who must see exactly what was assigned to them and nothing else.

## 2. Release promise

> This release enables a non-technical owner to shape one organization's learning space (its name, language, theme and vocabulary), appoint its admin, and have that organization's publishers share chapters, lessons and materials with exactly the learners assigned to them, from beginning to end, at zero hosting cost.

## 3. Acceptance tests

Each test is binary and observed in the deployed product (or its exact emulation in CI) by the Verifier and then by the owner.

### AT-1 The owner shapes a space and appoints its admin

1. The owner signs in, creates a space named "Mesk School" (مدرسة مسك), picks the **School** kit with Arabic as first language and English as second, uploads a logo and picks a colour.
2. The owner appoints an admin with a username, a first password and an end date of today plus 30 days.
3. **Expected:** the admin signs in and sees "مدرسة مسك" with the logo and colour, right-to-left, with the labels معلّم / طالب / فصل / مادّة. When the clock is moved past the end date, the same admin signs in and sees, in place of the space, the plain message "Your access to مدرسة مسك ended on <date>. Contact the owner." and every direct link to the space is refused with the same message. The owner's home shows, for the whole product, files stored and today's page requests and database writes against the free-plan lines.
4. **Owner acceptance of this test runs once on the public address**, not only in CI emulation.

### AT-2 The admin staffs the space and assigns a subject

1. The admin appoints two publishers, Hadeer and Shimaa, and two learners, each with an end date and a registered mobile number (for a learner, the parent's number). Numbers are typed the local way (010…) with the space's default country code and stored in international form; a number that cannot be normalised is refused with a plain message.
2. The admin creates the subject "Mathematics" (the teachers will name the real subjects), assigns Hadeer to it, and assigns the group to it. The admin forms a group "Science" containing only the first learner.
3. Hadeer reports a forgotten password. The admin opens Hadeer's page and presses "Send reset link by WhatsApp". The product shows the number's last digits and asks for one confirming tap, then offers two things side by side: a WhatsApp button and a Copy button for the same link. The admin uses WhatsApp (or copies the link and sends it another way). Hadeer opens the link, types her username, and sets a new password.
4. The admin does the same for the first learner: the link goes to the parent's number.
5. **Expected (checked in CI):** Hadeer's home lists Mathematics; Shimaa's home lists nothing yet; the first learner's home lists Mathematics; the second learner's home lists nothing. The WhatsApp button carries the registered number in international form and the product's fixed message in the space's first language (it names مدرسة مسك, the admin, the product address, "valid 30 minutes", and puts the link alone on the last line). The link accepts the correct username once; it is refused with the wrong username, on a second use, and after the clock moves 30 minutes from its creation. Issuing a fresh link kills the previous one. The admin cannot appoint another admin, and cannot set an end date later than their own.
6. **Owner acceptance only:** the admin actually sends one link through WhatsApp on a phone, and Hadeer sets her password from it.

### AT-3 The publisher builds the subject

1. The publisher opens Mathematics, adds chapter "Fractions", adds lesson "Adding fractions", attaches one PDF upload, one image upload, one video link, one web link and one text note, then publishes.
2. **Expected:** the lesson shows the five materials in order; the PDF and image open from our storage; the video plays from its link; the web link opens in a new tab. A file that is not a PDF or an image is refused with a plain message.

### AT-4 The learner sees exactly what was assigned

1. The first learner signs in, changes their own password, signs in again with it, opens Mathematics, Fractions, Adding fractions, and opens all five materials.
2. The second learner signs in and tries the direct address of the lesson and of the PDF.
3. The clock is moved past the first learner's end date and the first learner signs in again.
4. **Expected:** the first learner reaches everything in step 1; the second learner is refused on both addresses; neither learner can see any edit control; after step 3 the first learner sees "Your access to مدرسة مسك ended on <date>. Contact the مدير." and the lesson and PDF addresses are refused with the same message.

### AT-5 The kit changes every word, and no code changes

1. The owner creates a second space "Delta Logistics" on the **Company** kit, then opens the kit of "Mesk School", switches it to the **Company** kit, and renames "Trainer" to "Coach" in English and to "مرشد" in Arabic there.
2. **Expected:** every page the Mesk School admin, publishers and learners open now says Coach / مرشد, Employee, Team, Course; the first learner still opens Mathematics, Fractions, Adding fractions and its materials unchanged; Delta Logistics still says Trainer; switching an account's language to English flips the layout to left-to-right; the deployed code is byte-identical before and after (same commit).

## 4. Now / Later

**Now (this release):** owner sign-in; spaces; the three seed kits (School, Company, University) with editable labels, logo and colours; Arabic and English; admins, publishers, learners and groups with validity dates, and a plain "access ended" message after the date; whoever appointed a person can set them a new password, or send them a one-time reset link through the appointer's own WhatsApp to the person's registered mobile number (a parent's number for a learner); the owner's recovery code shown once at first setup; one publisher per subject; chapters, lessons and materials (PDF, image, video link, web link, note); learner access by assignment; change own password; the owner's usage panel against the free-plan lines.

**Later:** everything in [04-LATER.md](04-LATER.md), led by gamification packs and subject editions.

## 5. Non-goals

This release does not grade, test, certify, message, schedule, take attendance, host video, send email, bill anyone, or let anyone but the one owner create spaces.

## 6. Constraints

- **Cost:** $0 recurring, per [03-HOSTING-DECISION.md](03-HOSTING-DECISION.md). The only paid step is a $5 per month plan, and only on the owner's RED decision.
- **Data and privacy:** names, usernames, registered mobile numbers (parents' numbers for children) and lesson files of real students and employees. A mobile number is used only to send a reset link and is never shown to other users inside the product. Two facts the school must know: a reset sent through WhatsApp reveals the sender's own number to the recipient, and puts the recipient's number into the sender's phone; the school decides whether admins use a school phone or a personal one, and tells parents, when it collects their numbers, what they are used for. The Copy button exists so a school can choose another channel. Every record is scoped to its space; files are served only through access checks; the owner sees kits, admins and usage totals, never the people or content inside a space; sessions expire after 30 days of no use (checked by unit tests, not an acceptance test); no analytics beyond the usage panel. Recovery relies on the database's built-in 30-day point-in-time history; a per-space export for admins is in Later.
- **Platform:** phone-width web pages first, in Arabic and English, right-to-left correct.
- **Delivery:** the roles and rules in [AGENTS.md](../AGENTS.md); tests first; every acceptance test is a named CI step; the owner's merge is acceptance.
- **Deadline:** none set by the owner. The Project Lead proposes the order: AT-1, AT-4, AT-3, AT-2, AT-5 (sign-in and refusal first, because they protect every other test).

## 7. Owner's answers, 31 October 2026

| # | Question | Owner's answer | Recorded as |
|---|---|---|---|
| 1 | Which real organization is the pilot? | **Mesk School.** Teachers Hadeer and Shimaa. Class: Science. | AT-1, AT-2, AT-4 and AT-5 now use these names. Subject names will come from the teachers; "Mathematics" stands in until then |
| 2 | Sign-in by username and password set by the appointing person, no email? | **Yes** | Now list; AT-2 |
| 3 | Videos as links only? | **Yes** | Now list; AT-3 |
| 4 | Who creates the Cloudflare account? | **The owner** | Hosting decision; nobody else holds the credential |
| 5 | Tasks and reviews in Paperclip or GitHub? | **GitHub** | AGENTS.md: pull requests are the record; the roles are unchanged |
| 6 | How is the owner account recovered? | **Use the registered mobile number (the WhatsApp idea)** | See the note below: a recovery code now, the registered number as soon as the product can send a message itself |
| 7 | Free address for the pilot, own domain later? | **Agreed** | Hosting decision |
| 8 | Free WhatsApp reset link in release 1? | **"Explain more"**; explained in Later D and in the explainer page | Included in this version (AT-2 step 3) because it is free and removes the help desk; the owner's merge confirms it, or says "remove" and it goes back to Later D |

**Note on question 6.** The owner's answer is adopted as the goal, with one practical step in between. The free WhatsApp shape in release 1 works because *somebody above you* presses Send: the admin for a teacher, the owner for an admin. Nobody is above the owner, so an owner reset by mobile needs the product to send the message itself, which is the paid shape (Later D2: a Meta Business account and about half a cent per message). Until D2 is built, release 1 shows the owner a one-time recovery code at first setup, which the owner keeps off the computer, and registers the owner's mobile number so D2 can take over without any further decision. While signed in, the owner can generate a new code at any time (the old one dies). If both the password and the code are lost, the last resort is the Cloudflare account holder, which is the owner, running one documented command in the Cloudflare dashboard; the README carries that step, and nobody else can do it.

## 8. Critic review (31 October 2026, one review of version 0.1): "Revise first"

| # | Finding (critic) | Product Manager's disposition |
|---|---|---|
| 1 | No path for a forgotten password; the owner becomes the help desk | Accepted. "Appointer sets a new password" added to Now and AT-2; owner recovery is open question 6 (RED) |
| 2 | Weekly export contradicts "the owner sees nothing inside a space" and is unspecified | Accepted. Export moved to Later as a per-space admin download; recovery stated as the database's built-in 30-day history; owner's view limited in section 6 |
| 3 | Free-tier exhaustion is invisible until a school goes dark | Accepted. Owner usage panel added to Now and to AT-1's expectation |
| 4 | AT-5 ambiguous: a rename must not touch other spaces, and content must survive a kit switch | Accepted. Both expectations added to AT-5 with a second space |
| 5 | Now promised more than the tests observe (change-password, web link, export, expiries) | Accepted. Web link in AT-3; change-password and expired learner in AT-4; sessions moved to constraints; export to Later |
| 6 | "Silent" expiry reads as a broken product | Accepted. The plain "access ended" message is now an expectation in AT-1 and AT-4 |
| 7 | `workers.dev` carries Cloudflare's name; owner could approve without seeing a live address | Accepted. Domain is open question 7; AT-1 owner acceptance runs once on the public address |

Version 0.2 resolved all seven.

### Second look at the 0.3 delta (31 October 2026, evening): "Revise first", resolved in place

| # | Finding (critic) | Disposition |
|---|---|---|
| 1 | The link alone sets the password; a mis-sent message hands over the account | Accepted. The reset page asks for the username; the admin sees the number's last digits and confirms before WhatsApp opens |
| 2 | "WhatsApp opens, admin presses Send, Hadeer opens the link" cannot be observed in CI | Accepted. Expected rewritten to what CI checks (the button's number and message, one-time use, wrong username, reuse, 30-minute expiry, fresh link kills old); the real send is owner-only acceptance, like AT-1 step 4 |
| 3 | The child path was promised but untested; parents' numbers and the admin's number leave the product | Accepted. Learner reset added as step 4; section 6 states both disclosures and the school's choice of phone; consent note for parents' numbers |
| 4 | An unknown number sending "set your password here" is phishing-shaped; message text unspecified | Accepted. A fixed product message in the space's first language, naming the space, the admin and the product address, link alone on the last line, tested in CI |
| 5 | An admin without WhatsApp on the device hits a dead end with a ticking link | Accepted. Copy button beside the WhatsApp button; timer runs from creation; a fresh link can be issued |
| 6 | Egyptian numbers typed as 010… break the link unless normalised | Accepted. Default country code per space, stored in international form, refused otherwise (step 1) |
| 7 | A lost recovery code leaves no path above the owner | Accepted. Code regenerable while signed in; last resort named: the owner, as Cloudflare account holder, runs one documented command |

No third round: the two security findings are resolved by adding checks, not by changing the promise.
