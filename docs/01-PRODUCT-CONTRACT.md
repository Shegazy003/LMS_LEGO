# Product contract: LMS Lego, release 1

**Version:** 0.2, 31 October 2026. **Status:** `CONTRACT READY`. The product critic's one review is recorded in section 8 and every finding is resolved below. The owner approves it, or answers the one batch of questions in section 7. Once the owner approves, this contract is **frozen**; later changes are a new version with an explained impact.

## 1. User and problem

The user is the **owner**: a non-technical person who wants to give organizations an organized learning space and run it as their own product. Today, giving a school or a company a place to share lessons means either a heavy LMS that needs a developer to set up and shape, or a borrowed tool (Google Classroom) that carries someone else's name, names and rules. The owner wants to shape a space in minutes, hand it to an administrator, and never be the help desk.

Behind the owner stand three people the space must also serve: an **admin** who appoints people and assigns subjects, a **publisher** (teacher, trainer, lecturer) who builds subjects out of chapters, lessons and materials, and a **learner** (student, employee, trainee) who must see exactly what was assigned to them and nothing else.

## 2. Release promise

> This release enables a non-technical owner to shape one organization's learning space (its name, language, theme and vocabulary), appoint its admin, and have that organization's publishers share chapters, lessons and materials with exactly the learners assigned to them, from beginning to end, at zero hosting cost.

## 3. Acceptance tests

Each test is binary and observed in the deployed product (or its exact emulation in CI) by the Verifier and then by the owner.

### AT-1 The owner shapes a space and appoints its admin

1. The owner signs in, creates a space named "Al Nour School", picks the **School** kit with Arabic as first language and English as second, uploads a logo and picks a colour.
2. The owner appoints an admin with a username, a first password and an end date of today plus 30 days.
3. **Expected:** the admin signs in and sees "مدرسة النور" with the logo and colour, right-to-left, with the labels معلّم / طالب / فصل / مادّة. When the clock is moved past the end date, the same admin signs in and sees, in place of the space, the plain message "Your access to مدرسة النور ended on <date>. Contact the owner." and every direct link to the space is refused with the same message. The owner's home shows, for the whole product, files stored and today's page requests and database writes against the free-plan lines.
4. **Owner acceptance of this test runs once on the public address**, not only in CI emulation.

### AT-2 The admin staffs the space and assigns a subject

1. The admin appoints one publisher and two learners, each with an end date, and forms a group "Grade 5A" containing only the first learner.
2. The admin creates the subject "Mathematics", assigns the publisher to it, and assigns the group to it.
3. The publisher reports a forgotten password; the admin sets them a new one from the publisher's page.
4. **Expected:** the publisher's home lists Mathematics; the first learner's home lists Mathematics; the second learner's home lists nothing. The publisher signs in with the new password and the old one is refused. The admin cannot appoint another admin, and cannot set an end date later than their own.

### AT-3 The publisher builds the subject

1. The publisher opens Mathematics, adds chapter "Fractions", adds lesson "Adding fractions", attaches one PDF upload, one image upload, one video link, one web link and one text note, then publishes.
2. **Expected:** the lesson shows the five materials in order; the PDF and image open from our storage; the video plays from its link; the web link opens in a new tab. A file that is not a PDF or an image is refused with a plain message.

### AT-4 The learner sees exactly what was assigned

1. The first learner signs in, changes their own password, signs in again with it, opens Mathematics, Fractions, Adding fractions, and opens all five materials.
2. The second learner signs in and tries the direct address of the lesson and of the PDF.
3. The clock is moved past the first learner's end date and the first learner signs in again.
4. **Expected:** the first learner reaches everything in step 1; the second learner is refused on both addresses; neither learner can see any edit control; after step 3 the first learner sees "Your access to مدرسة النور ended on <date>. Contact the مدير." and the lesson and PDF addresses are refused with the same message.

### AT-5 The kit changes every word, and no code changes

1. The owner creates a second space "Delta Logistics" on the **Company** kit, then opens the kit of "Al Nour School", switches it to the **Company** kit, and renames "Trainer" to "Coach" in English and to "مرشد" in Arabic there.
2. **Expected:** every page the Al Nour admin, publisher and learner open now says Coach / مرشد, Employee, Team, Course; the first learner still opens Mathematics, Fractions, Adding fractions and its materials unchanged; Delta Logistics still says Trainer; switching an account's language to English flips the layout to left-to-right; the deployed code is byte-identical before and after (same commit).

## 4. Now / Later

**Now (this release):** owner sign-in; spaces; the three seed kits (School, Company, University) with editable labels, logo and colours; Arabic and English; admins, publishers, learners and groups with validity dates, and a plain "access ended" message after the date; whoever appointed a person can set them a new password; one publisher per subject; chapters, lessons and materials (PDF, image, video link, web link, note); learner access by assignment; change own password; the owner's usage panel against the free-plan lines.

**Later:** everything in [04-LATER.md](04-LATER.md), led by gamification packs and subject editions.

## 5. Non-goals

This release does not grade, test, certify, message, schedule, take attendance, host video, send email, bill anyone, or let anyone but the one owner create spaces.

## 6. Constraints

- **Cost:** $0 recurring, per [03-HOSTING-DECISION.md](03-HOSTING-DECISION.md). The only paid step is a $5 per month plan, and only on the owner's RED decision.
- **Data and privacy:** names, usernames and lesson files of real students and employees. Every record is scoped to its space; files are served only through access checks; the owner sees kits, admins and usage totals, never the people or content inside a space; sessions expire after 30 days of no use (checked by unit tests, not an acceptance test); no analytics beyond the usage panel. Recovery relies on the database's built-in 30-day point-in-time history; a per-space export for admins is in Later.
- **Platform:** phone-width web pages first, in Arabic and English, right-to-left correct.
- **Delivery:** the roles and rules in [AGENTS.md](../AGENTS.md); tests first; every acceptance test is a named CI step; the owner's merge is acceptance.
- **Deadline:** none set by the owner. The Project Lead proposes the order: AT-1, AT-4, AT-3, AT-2, AT-5 (sign-in and refusal first, because they protect every other test).

## 7. Open questions for the owner (one batch, each with a recommended answer)

1. **Which real organization is the pilot?** Recommended: one school you already know, with one admin, two teachers and one class, so AT-1 to AT-5 run on real names.
2. **Sign-in by username and password set by the appointing person, with no email?** Recommended: yes. It costs nothing and matches how schools hand out accounts. Email can come later.
3. **Videos as links only in this release?** Recommended: yes. Unlisted YouTube or Drive links are free and need no storage.
4. **May the team create a free Cloudflare account under your email for hosting?** Recommended: you create it yourself (it is a credential) and never share the password; the team never needs it until the first public address.
5. **Where do tasks and reviews live for this product: Paperclip, or GitHub pull requests only?** Recommended: GitHub only until the Paperclip team is resumed, since all six agents are paused there. The roles stay the same either way.
6. **How is the single owner account recovered if its password is lost?** (RED: it is the product's root credential.) Recommended: at first setup the product shows a one-time recovery code; you write it down and keep it off the computer; nobody else can reset the owner.
7. **Public address: the free `lms-lego.workers.dev` address for the pilot, or your own domain?** Recommended: the free address for the pilot school; buy one domain (about $10 a year, your purchase) before handing a space to a second organization, so the product carries your name, not Cloudflare's.

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

Version 0.2 resolves all seven. No second review round: the operating contract allows one review per contract version, and none of the changes adds scope beyond what the owner's original ideas named.
