# Product contract: LMS Lego, release 1.1 "Keep the space tidy"

**Delivered in code:** AT-6 (#25), AT-7 (#27), AT-8 (#29), each Lead ACCEPTED and Verifier PASS, merged by 2 November 2026. **Live** since 2 November 2026 (deploy run 41437034787, version `9d8f2430`); accepted when the owner's live check passes (CURRENT-PROGRESS lists it).

**Version:** 0.2, 2 November 2026. **Status:** `CONTRACT READY`. The product critic's one review of 0.1 ("Revise first", seven findings) is resolved in section 8. **Approval:** the owner's delegate approves contracts (decision 002) by merging the pull request that carries this version; from that merge it is frozen. The owner may veto at any time.

**Why now:** release 1 is live at Mesk School. Its known limits (README) say the admin and the publisher can add and order but cannot correct anything. The pilot meets these in its first days: a misspelled name, a wrong mobile number, a learner who leaves, a wrong PDF. This release closes those gaps before release 2 (guardians and exam results), which keeps its roadmap trigger.

## 1. User and problem

The **admin** and the **publisher** of a live space, usually on a phone. Today a typo in a name, a wrong mobile number (which sends reset links to the wrong person), a wrong end date, a learner in the wrong group, or a wrong file stays on the screens for good, or needs a developer. The owner promised a space the school runs by itself, and a school's work must never be lost by a mistaken tap.

## 2. Release promise

> This release enables an admin and a publisher to correct the everyday mistakes in people, groups, subjects and lessons from the screens, from beginning to end, with nothing lost by accident: every removal can be undone.

## 3. Acceptance tests

Every test runs in a real browser at phone width, Arabic first, then the same check in English. Every new message (confirm steps, refusals, warnings) appears in the space's languages and uses the kit's words.

### AT-6 The admin corrects a person

1. The admin types part of a learner's name into the people list's search box and opens that learner.
2. The admin corrects the display name and the registered mobile number, and moves the end date later.
3. The admin opens another learner and presses **End access now**, confirming in a page step that names the person.
4. The admin changes a publisher's end date earlier (to today), then tries a date before today and a date later than the admin's own.
5. **Expected:**
   - The corrected name shows on every list and in the next WhatsApp reset message; the reset link goes to the corrected number; every reset link issued before the change stops working.
   - The extended learner keeps access.
   - With the test clock at midday UTC, the ended learner's next page shows "Your access to <space> ended on <today>. Contact the <admin label>." and every direct link is refused at once; their sessions and reset links stop working.
   - A publisher ended "today" by date keeps access until the end of that UTC day (the release 1 rule); "End access now" is the way to end at once.
   - A typed date before today, or later than the admin's own end date, is refused with a plain message.
   - Ended people move to a collapsed "Ended" section of the people list. **Restore access** with a new end date brings an ended learner back with the same groups and subjects. Nothing is deleted.

### AT-7 The admin tidies groups and subjects

1. The admin renames the group "Science" to "Science 5A" and the subject "Mathematics" to its real name.
2. The admin removes one learner from the group, and unassigns one group from a subject.
3. **Expected:** the new names show everywhere at once, in both languages' pages; the removed learner and the unassigned group lose the subject at their next page and on every direct link; the publisher's content is untouched; an empty or too-long name (over 100 characters, or more than one line) is refused with a plain message; re-adding the learner or the group restores access with nothing lost.

### AT-8 The publisher corrects content safely

1. The publisher renames a chapter, a lesson and a material title.
2. The publisher **replaces** the file of a PDF material with another PDF: the title and position stay the same.
3. The publisher **removes** a material, confirming in a page step that names it; then opens **Recently removed** and **restores** it; then removes it again.
4. The publisher tries to remove a lesson that still shows materials (refused, saying what to remove first), then removes an empty lesson and restores it.
5. **Expected:**
   - New titles and the replaced file show to learners at once; the replaced file's old address no longer serves the old bytes.
   - A removed material disappears from the lesson and its address answers "not found" for learners; a restored one returns in its old position with the same file.
   - **Cancel** on a confirm step changes nothing; visiting any address with a plain link (GET) never removes anything; a removal is one database change, so it cannot leave a half-removed item.
   - Removed files stay in storage and are counted on the owner's usage panel (a later release adds emptying the bin).
   - Another publisher, an admin and a learner cannot rename, replace, remove or restore anything of Hadeer's, by screen or forged request.

## 4. Now / Later

**Now:** search people by name; rename people; correct the registered mobile number (killing open reset links); change end dates; end access now; restore access; an "Ended" section; rename groups and subjects; remove group members and subject assignments; rename chapters, lessons and materials; replace a material's file in place; remove and restore materials, empty lessons and empty chapters ("Recently removed").

**Later (named so they are not forgotten):**
- correcting a username or a role (appointed as learner instead of teacher);
- merging duplicate groups or subjects;
- deleting a person's account and data entirely (a privacy decision for the owner, with an export first);
- emptying "Recently removed" to free storage;
- bulk actions; moving a lesson to another chapter;
- an audit history of who changed what.

**Hardening task H-1 (separate from this release, for the team, not part of its promise):** switch on Workers Logs safely. Decide whether per-request logs stay on; if they do, reset tokens must leave the logged URL first (or request logs stay off), state the sampling rate against the free plan's log allowance, and check one real reset in Cloudflare's logs. Add a guard that no product log line holds a password, a token, a full mobile number or a session id, and a test that drives the sign-in re-hash against a concurrent password change. The live switch is a deploy, pressed by the owner.

## 5. Non-goals

No permanent deletion of anything; no deletion of people or spaces; no new roles; no change to sign-in, kits, languages or hosting; nothing from release 2.

## 6. Constraints

- **Data:** every removal is reversible from the screens ("Recently removed", "Restore access"). People are ended, never deleted. A replaced file's old bytes stop being served; whether the old object is kept for restore is the Builder's AMBER choice, stated in the pull request. D1's 30-day point-in-time history stays as the last resort.
- **Privacy:** display names keep the release 1 bounds (1 to 100 characters, one line); mobile numbers stay masked to the last digits for everyone but the confirmation step of a reset.
- **Platform:** phone width first; Arabic right-to-left and English left-to-right; all new words through the label function and the dictionary.
- **Cost:** $0; removed files count toward the 10 GB, visibly.
- **Delivery:** the line in AGENTS.md; additive migrations only; every acceptance test a named CI step; the live deploy is pressed by the owner when the release is complete.

## 7. Open questions for the owner

None. Removal is reversible by design, so no permanent deletion needs the owner's decision in this release.

## 8. Critic review (one review of version 0.1, 2 November 2026): "Revise first"

| # | Finding | Product Manager's disposition |
|---|---|---|
| 1 | Removing a PDF was permanent; Cancel, GET and half-failed removals untested | Accepted. Every removal is now reversible ("Recently removed", restore); nothing is deleted from storage in this release; AT-8 tests Cancel, GET-never-removes and single-change removal |
| 2 | "End access today" contradicted the UTC-day rule; the message's date was undefined | Accepted. "End access now" ends at once and the message says "ended on <today>", tested at midday UTC; a typed date keeps the release 1 rule (access through that day); the "not before today" rule applies to typed dates only |
| 3 | The commonest mistakes (wrong mobile, username, role, duplicates) stayed unfixable; the list only grows | Accepted in part. Correcting the mobile number is now in Now, killing open reset links; username, role and duplicates are named in Later; the promise is narrowed to "everyday mistakes"; ended people collapse into an "Ended" section |
| 4 | Workers Logs record request URLs (reset tokens) and addresses; the guard could not see that; sampling was unstated | Accepted. Moved into hardening task H-1 with exactly these conditions |
| 5 | AT-9 was a second product inside a user promise, and "switched on live" was not CI-checkable | Accepted. AT-9 removed; H-1 is a separate team task; the live switch is a deploy |
| 6 | The teacher's real story is "wrong file", but remove-and-re-add moves it to the end | Accepted. "Replace file" keeps title and position (AT-8 step 2) |
| 7 | No platform or language constraint; new messages untested; finding a person in a long list | Accepted. The constraint is restored for every AT; every new message in both languages through the kit's words; AT-6 starts with a search |

No second review: the operating contract allows one review per contract version, and version 0.2 resolves the findings without widening beyond them.
