# Visual pages: what they are and how they are kept current

The owner is non-technical. Besides this repository, the owner follows the project through **visual pages** published on claude.ai. Each page is a clear, designed explanation of where the project stands. The pages are only useful if they match the record, so this file is the procedure for keeping them current. The Lead follows it at every milestone.

## The pages

| Page | Published at (keep this link) | Source in this folder | What it shows |
|---|---|---|---|
| LMS Lego Contract (the explainer) | https://claude.ai/artifact/P5MEzPbKbFdoHeXPcemSLV | `lms-lego-explainer.html` | The kit idea, the roles, the acceptance tests, the delivery line, hosting, the roadmap, what waits on the owner, and the current status at the top |
| LMS Lego Cloudflare Setup | https://claude.ai/artifact/3BCY9K46yUjnjru5DekRfv | `cloudflare-setup.html` | The owner's steps for the Cloudflare account, file storage, the deploy key and the GitHub secrets |

**The file in this folder is the page's source of truth.** The published page is a copy of it. Each file is a page fragment: claude.ai wraps it in a document skeleton when it publishes. To look at one locally, open it in a browser.

## When to update (the triggers)

Update the explainer in the **same record pull request** as `CURRENT-PROGRESS.md`, whenever one of these happens:

1. A contract is approved or changes version.
2. A task or acceptance test is merged (delivered).
3. A release goes live (deploy).
4. A release is accepted by the owner.
5. The owner answers a decision, or a new decision is put to the owner.
6. The roadmap or the Later list changes.

Update the setup guide only when the owner's steps for accounts, keys or deploys change.

Add a **new page** when the owner needs a new step-by-step guide, for example a new account to create. Add its row to the table above and keep its source here.

## Who

The **Lead** of the active delivery line (or the owner's delegate) updates the pages, as part of the record step ([Lead checklist](../templates/LEAD-CHECKLIST.md), step 6). There is one writer at a time. Builders and Verifiers never edit these pages.

## What to change on the explainer

The page must say only what `CURRENT-PROGRESS.md` says. Never claim something the record does not.

- **The status line at the top:** the pill (for example `RELEASE 1.1 ACCEPTED · LIVE`) and one sentence with the date.
- **The "where things stand" section:** each acceptance test or task, with its pull request number and its state (in build, delivered, live, accepted).
- **The roadmap section:** which release is current, which is next, and its trigger.
- **"Waiting on you":** the owner's open decisions, each with a recommended answer. Remove the ones that have been answered.
- **"Later":** add new parked ideas, and remove the ones that have moved into a release.
- **New sections** for a new release's contract, in the same visual style as the existing ones.

## How (step by step)

1. **Edit the source** `docs/visual/lms-lego-explainer.html` on the record branch.
2. **Keep the design rules.**
   - Colours are defined once as tokens, for light and dark themes.
   - The page must read at phone width.
   - Arabic text keeps its right-to-left direction.
   - The page title stays "LMS Lego Contract".
   - In a Claude session, the Artifact tool's design guidance loads when the tool is first used (or through its `artifact-design` skill). Follow it.
3. **Publish to the same link,** using the Artifact tool:
   - In a **new** session, first **read** the page by its link (Artifact `read` with `url`). The tool refuses to publish over a page this session has not read.
   - Then **publish** with `url` set to the page's link and `file_path` set to the edited source file.
   - **Never publish without `url`.** That creates a new page with a new link, and the owner's bookmark would go stale.
   - If the page that was read differs from the repository copy (edited somewhere else), merge the differences into the source file first, then publish.
4. **Commit the source** in the record pull request. Note in its body that the explainer was updated, and to which state.
5. **Tell the owner** in the milestone report that the page shows the new state, with its link.

**Sharing:** the pages are private to the owner's claude.ai account. The owner shares one from the page's **Share** menu; Claude cannot change who can see it.

## If a session has no Artifact tool

Edit and commit the source anyway, and write in the record pull request: "explainer source updated; publish pending". The next session that has the Artifact tool publishes it to the same link and removes that note.
