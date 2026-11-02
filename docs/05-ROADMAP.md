# Roadmap: one line of releases

**Date:** 31 October 2026. **Owner of this page:** the Product Manager. One roadmap, one contract at a time: only release 1 has a contract; the others have a promise and a trigger, and each gets its own contract, critic review and five tests when its turn comes.

## Why ideas are parked, and what "parked" means

Parked does not mean rejected, and it does not mean "someday". Every idea the owner raised is written down with a one-sentence promise, the tables it will add, the decisions it needs, and the event that starts it. The reasons for the order are these, and they come from the owner's own Completion-First Manifesto:

1. **Each later idea stands on release 1.** Guardians need learners to watch. Exam results need subjects, groups and learners. Print orders need materials and guardians. Automatic WhatsApp codes need registered numbers on accounts. Release 1 is the floor; nothing above it can be built, or even tested, before the floor exists.
2. **Done must stay observable.** Release 1 has five tests. Adding four ideas would make it fifteen or more, and "finished" would stop being a yes-or-no question. A release the owner cannot check end to end in one sitting is a release that drifts.
3. **Each parked idea carries a decision only the owner can take.** Money and a Meta Business account (D2), a contract with an outside shop and file access (C), whether a parent may see that a child opened a lesson (A). Bundling them into release 1 would stop release 1 on decisions that have nothing to do with sharing lessons.
4. **The brainstorm already made this choice once.** Moodle, Open edX and the others were rejected because they carry every feature at once and need a developer to shape. Release 1 is deliberately the opposite: the smallest space that a real school can use next week.
5. **Small releases arrive.** A five-test release through the delivery line is weeks of work. The next release starts from a live product with real users, whose feedback is worth more than any plan.

The owner can change this order at any time. It is the owner's product; the Product Manager only asks that each move is written as a new contract version with its impact stated, so the team never builds against a moving target.

## The line

| Release | Promise (one sentence) | Unlocks | Owner decisions before it starts | Starts when |
|---|---|---|---|---|
| **R1 · The space** (contract 0.3) · **ACCEPTED 1 November 2026** | A non-technical owner shapes one organization's space, appoints its admin, and publishers share chapters, lessons and materials with exactly the assigned learners, at zero hosting cost | Everything below | Taken on 31 October 2026 (section 7 of the contract) | Done: live at `lms-lego.lmslego.workers.dev` |
| **R1.1 · Keep the space tidy** ([contract](09-CONTRACT-R1.1.md)) | An admin and a publisher correct everyday mistakes in people, groups, subjects and lessons from the screens, with every removal undoable | The pilot school running without a developer | None (removal is reversible by design) | Delivered in code 2 November 2026 (AT-6 #25, AT-7 #27, AT-8 #29); live after the owner's deploy press; then hardening task H-1 (Workers Logs safely), not started |
| **R2 · Guardians and results** (Later A + B) | A parent or supervisor sees their learners' subjects and exam results, and a teacher publishes a whole group's marks in one step | Monitoring, reporting, the approval step R4 needs | Whether a guardian may see that a lesson was opened (privacy) | Mesk School has used R1 for one term, or asks for results earlier |
| **R3 · Self-service reset** (Later D2) | Anyone, including the owner, proves who they are by a WhatsApp code to their registered number and sets a new password alone | Owner recovery by mobile (question 6); no help desk at all | The Meta Business account and about $0.0036 plus VAT per message in Egypt (RED) | An organization asks for self-service, or the owner wants mobile recovery of the owner account |
| **R4 · Print orders** (Later C) | A learner asks for a printout, a guardian approves the purchase, a contracted shop prints it, the learner collects | A paid service around the content | Prices, who collects payment, the shop contract, file access (RED) | R2 is live and one school has a shop willing to sign |
| **R5 · Gamification packs** | Points, badges and figures themed to each kit, switched on per space by the owner | Motivation; the kit's reserved slot | None beyond scope | An organization completes a subject end to end and asks for it |

Release 1.1 was inserted by the owner's delegate on 2 November 2026, after the pilot went live, because release 1's known limits (no corrections from the screens) meet the school in its first days. It does not move R2's trigger.

Subject editions (several publishers teaching versions of one subject), kit marketplace, sub-admins, usage dashboards and the brainstorm's heavier LMS features stay in [Later](04-LATER.md) with their own triggers and join this line when one fires.

## What the owner sees at each step

- **Before R1:** this roadmap, the contract, the explainer page.
- **During R1:** nothing until `PASS`. Then one demo on the public address and the merge button.
- **After R1:** Mesk School live. The Product Manager drafts the R2 contract from this page and the school's first month, the critic reviews it once, the owner gets one batch of questions.
