# The Lego model

**Date:** 31 October 2026. **Status:** founding design, supports the draft product contract. Changes go through the Product Manager; anything that changes an acceptance test is a new contract version.

## The idea in one paragraph

One product serves many organizations. Each organization is a **space**. A space is shaped by a **kit**: the language, the writing direction, the theme, and the names used for every concept. The product's code knows only eight canonical concepts. The kit decides what people see. A school's kit shows Teacher, Student, Class, Subject; a company's kit shows Trainer, Employee, Team, Course. Changing the kit changes every label on every page. No code changes, no developer.

## The eight canonical concepts

| Canonical name (in code) | What it is | School kit (en / ar) | Company kit (en / ar) | University kit (en / ar) |
|---|---|---|---|---|
| **Space** | One organization's whole learning area | School / مدرسة | Company / شركة | University / جامعة |
| **Admin** | Runs the space: appoints people, assigns subjects | Administrator / مدير | HR administrator / مسؤول التدريب | Registrar / مسجّل |
| **Publisher** | Creates and publishes content | Teacher / معلّم | Trainer / مدرّب | Lecturer / محاضر |
| **Learner** | Consumes assigned content | Student / طالب | Employee / موظّف | Student / طالب |
| **Group** | A set of learners assigned together | Class / فصل | Team / فريق | Section / شعبة |
| **Subject** | A body of content with one responsible publisher | Subject / مادّة | Course / دورة | Module / مقرّر |
| **Chapter** | An ordered part of a subject | Chapter / وحدة | Module / وحدة | Unit / وحدة |
| **Lesson** | An ordered part of a chapter, holding materials | Lesson / درس | Session / جلسة | Lecture / محاضرة |

A **Material** is the content inside a lesson: a PDF, an image, a video link, a web link or a text note. Its label rarely changes ("Material" / "مادة تعليمية"), but the kit may rename it too.

The three kits above ship with the product as starting points. The owner can copy one and edit any label in any language from a form. A custom kit is an ordinary kit.

### Concepts reserved for later releases

| Concept | School kit | Company kit | Comes with |
|---|---|---|---|
| **Guardian** (watches one or more learners, read-only) | Parent / ولي أمر | Supervisor / مشرف | [Later A](04-LATER.md) |
| **Exam** and its results (entered by the publisher, seen by the learner) | Exam / امتحان | Assessment / تقييم | [Later B](04-LATER.md) |
| **Vendor** (a contracted print shop that fulfils approved orders) | Print shop / مطبعة | Print shop / مطبعة | [Later C](04-LATER.md) |

Release 1 builds none of these, but keeps `membership.role` as free text and gives every material a stable id, so adding them is new tables, not changed ones.

## What a kit holds

```
kit
├── id, name
├── languages: ["ar", "en"]            default language and direction come from the first entry
├── labels
│   ├── ar: { space, admin, publisher, learner, group, subject, chapter, lesson, material }
│   └── en: { … the same keys … }
├── theme: { logoUrl, primaryColor, accentColor, fontFamily }
└── gamification: { enabled: false, pack: null }     reserved; see Later
```

The kit is stored as one row per space. Editing it is a form, never a file. Every page reads labels through one function (`label("publisher")`), so a label can never be hard-coded by accident; a test checks for that.

## The authority chain and validity

```
Owner
 └── appoints Admin of a Space            (sets valid_from / valid_until)
       ├── appoints Publishers             (sets validity)
       ├── appoints Learners               (sets validity)
       ├── forms Groups of learners
       └── assigns a Subject
             ├── to one Publisher          (who may publish it)
             └── to Groups or Learners     (who may read it)
```

Rules, each of which becomes a test:

1. **Nobody grants more than they hold.** An admin cannot create an admin; a publisher cannot create anyone.
2. **Nobody grants longer than they hold.** A membership's `valid_until` never exceeds the granter's own `valid_until` in that space.
3. **Expiry is immediate and explained.** When a membership passes `valid_until`, the person can still sign in but, in place of that space, sees "Your access to <space> ended on <date>. Contact the <admin label>." (for an expired admin: "Contact the owner."), and every direct link to its content is refused with the same message. Nothing is deleted; the admin can extend the date.
4. **The owner is above spaces.** The owner's authority is a product-level flag, not a membership; there is exactly one owner account in the first release.
5. **Whoever appointed a person can set them a new password, or send them a one-time reset link.** The owner for admins, the admin for publishers and learners. The link goes through the appointer's own WhatsApp to the person's registered mobile number and dies after 30 minutes or one use. Everyone can change their own password. The owner is recovered by a one-time recovery code shown at first setup, until the product can send messages itself (Later D2).
6. **Visibility follows assignment, not role.** A learner sees exactly the subjects assigned to them or to a group they belong to; a publisher sees exactly the subjects assigned to them. Admins see their whole space. The owner sees the kits and the admins of every space plus product-wide usage totals, and nothing inside a space unless they appoint themselves admin of it.

## Data model (first release)

Every row except `user` and `kit` carries `space_id`, so one deployment serves many spaces from the first line of code, and one space can never read another's rows.

| Table | Columns (keys only) | Notes |
|---|---|---|
| `user` | id, username, password_hash, display_name, mobile, is_owner, created_at | Usernames are unique across the product; passwords are set by whoever appoints the user and can be changed by the user. `mobile` is the registered number (a parent's number for a child) stored in international form after normalising with the space's default country code, used only for reset links |
| `reset_link` | id, user_id, token_hash, expires_at, used_at, created_by | One-time, 30 minutes from creation; the reset page also requires the username. The appointer sends it through their own WhatsApp (`wa.me` link with the product's fixed message pre-typed, in the space's first language) or copies it. Issuing a new link marks the previous one used |
| `space` | id, name, kit_id, default_country_code, created_by, created_at | One kit per space; the country code turns 010… into +2010… |
| `kit` | id, name, json | The structure above; three seed rows |
| `membership` | id, space_id, user_id, role (admin, publisher, learner), valid_from, valid_until, granted_by | One row per person per role per space |
| `group` | id, space_id, name | |
| `group_member` | group_id, user_id | |
| `subject` | id, space_id, title, publisher_user_id, is_published | Exactly one responsible publisher in this release |
| `subject_access` | subject_id, group_id or user_id | Who may read it |
| `chapter` | id, subject_id, title, position | |
| `lesson` | id, chapter_id, title, body_text, position | |
| `material` | id, lesson_id, kind (pdf, image, video_link, link, note), title, storage_key or url, position | Files live in object storage; the row keeps the key |
| `session` | id, user_id, expires_at | Server-side sessions, cookie-bound |

**Deliberately absent** in this release: subject editions, points, badges, email, comments, quizzes, per-space data export, audit log beyond `granted_by`. Each appears in [Later](04-LATER.md) with its trigger.

**Builder note (AMBER, recorded here so it is not raised again):** subject editions can be added later by inserting a `subject_edition` table between `subject` and `chapter` and migrating each subject's chapters to one default edition. That migration is one SQL statement, so no edition table is created now.

## The owner's journey (what AT-1 and AT-5 protect)

1. Owner signs in, presses "New space", types a name, picks a kit and a language, uploads a logo, picks two colours.
2. Owner presses "Appoint admin", types a name, a username, a first password and an end date.
3. Owner gives the admin the address and the username. The owner's work is finished.
4. Any time later the owner opens the space's kit, renames "Teacher" to "Coach", and every page in that space says Coach.

## The admin's journey (AT-2)

1. Admin signs in and sees the space with its labels and theme.
2. Admin appoints publishers and learners (name, username, first password, end date) and forms groups.
3. Admin creates a subject by title, assigns one publisher to it, and assigns groups or learners to it.

## The publisher's journey (AT-3)

1. Publisher signs in and sees only their subjects.
2. Inside a subject: add chapter, add lesson, add material (upload PDF or image, paste a video link or a web link, write a note), reorder, publish.

## The learner's journey (AT-4)

1. Learner signs in and sees only their subjects.
2. Opens a subject, a chapter, a lesson; reads the note, views the image, opens the PDF, plays the video link.
3. Nothing else exists for them: no other subject, no other space, no direct link that works.

## Screens (first release, at most eight)

Sign in · Owner home (spaces list, new space, kit editor, usage panel) · Admin home (people, groups, subjects) · Appoint person · Subject editor (chapters, lessons, materials) · Learner home (my subjects) · Lesson view · My account (change password, language).

Every screen is a server-rendered page that works at phone width, in Arabic right-to-left and English left-to-right, with the space's theme.
