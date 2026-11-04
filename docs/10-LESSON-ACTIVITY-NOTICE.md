# Lesson activity: the notice for the school

Release 2, task R2-d. Source: contract `product-contract-r2` (PIL-120, version 6, frozen), section 6 ("Privacy-notice line for the school"), rules 2, 7 and 10 to 13. Copied verbatim.

**Who sends it:** nobody on the team. The owner decides whether and when to send this text to the school; the owner has said consent is not required (owner's answer, 3 November 2026; not a legal opinion). The in-product tick on the admin's switch page records that someone confirmed people were told. Real use on real children is a separate decision and is not part of the build.

## School kit, Arabic

«عند تفعيل «نشاط الدروس» يمكن لولي الأمر أن يرى أي الدروس فتحها المتعلم وتاريخ آخر فتح لكل درس، ابتداءً من تاريخ التفعيل ومن تاريخ ربطه بالمتعلم. لا يُسجَّل وقت الفتح ولا مدة المشاهدة ولا أي محتوى، ولا يراها غير ولي الأمر المرتبط بالمتعلم. تُحفظ السجلات ما دامت الخاصية مفعَّلة، وتُحذف عند إيقاف الخاصية أو عند الطلب، وقد تبقى نسخة في النسخ الاحتياطية حتى ٣٠ يومًا إضافية. يُعلَم المتعلم بذلك في صفحته وفي كل درس يفتحه، ولا تُفعَّل الخاصية إلا بعد أن يؤكد المسؤول إبلاغ أولياء الأمور والمتعلمين.»

## School kit, English

"When 'Lesson activity' is switched on, a parent can see which lessons their child opened and the date each was last opened, starting from the day it was switched on and the day the parent was linked. The time of day, how long a lesson was viewed and any content are not recorded, and only a parent linked to that child can see it. Records are kept while the setting is on, and deleted when it is switched off or on request; a copy can remain in database backups for up to 30 more days. The child is told on their own page and on each lesson they open, and the admin can switch the feature on only after confirming that parents and learners were told."

## Company kit, English

"When 'Lesson activity' is switched on, a supervisor can see which lessons an employee opened and the date each was last opened, starting from the day it was switched on and the day the supervisor was linked. The time of day, how long a lesson was viewed and any content are not recorded, and only the linked supervisor can see it. Records are kept while the setting is on, and deleted when it is switched off or on request; a copy can remain in database backups for up to 30 more days. The employee is told on their own page and on each lesson they open."

The contract asks for an Arabic Company-kit text produced from the same labels; this is the Builder's draft, for the owner to read before any Company use:

«عند تفعيل «نشاط الدروس» يمكن للمشرف أن يرى أي الدروس فتحها الموظّف وتاريخ آخر فتح لكل درس، ابتداءً من تاريخ التفعيل ومن تاريخ ربطه بالموظّف. لا يُسجَّل وقت الفتح ولا مدة المشاهدة ولا أي محتوى، ولا يراها غير المشرف المرتبط بالموظّف. تُحفظ السجلات ما دامت الخاصية مفعَّلة، وتُحذف عند إيقاف الخاصية أو عند الطلب، وقد تبقى نسخة في النسخ الاحتياطية حتى ٣٠ يومًا إضافية. يُعلَم الموظّف بذلك في صفحته وفي كل درس يفتحه.»

## What the product does (how the text maps to it)

| The text says | In the product |
|---|---|
| Switched on by the admin, after confirming people were told | Admin home → Lesson activity; **Switch on** needs the required tick (AT-15b) |
| Which lessons, and the date each was last opened | One row per learner and lesson: the date of the latest open, no time (AT-15c, 15e) |
| From the switch-on day and the link day | "Recording since" is the later of the two; nothing earlier is shown (AT-15c-2) |
| Only a linked parent sees it | The guardian's lesson-activity page, for actively linked, active learners only (AT-15c, 15h) |
| Kept while on; deleted when switched off or on request | No automatic disposal (AT-15g); switching off deletes every row of the space (AT-15b); deletion on request is a manual database action by the owner (RED) |
| A copy can remain in backups for up to 30 more days | D1's 30-day history (contract section 6, rule 11) |
| The child is told on their page and on each lesson | The notice line on the learner home and each lesson page (AT-15f) |
