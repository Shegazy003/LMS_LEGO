# Visual pages procedure (generic, for any project)

A project run for a **non-technical owner** keeps one or more **visual pages**: clear, designed explanations of the project that the owner reads instead of the repository. This procedure keeps those pages true. It does not depend on any particular product; copy it as is into a new project and fill in the project's own page list (see "Adopting this in a project").

## Principles

1. **The record leads, the page follows.** The project's progress record (for example `CURRENT-PROGRESS.md`) is the truth. A page shows only what the record says, never more and never sooner.
2. **The repository holds the source.** Each page's source file lives in the project repository (for example `docs/visual/<page>.html`). The published page is a copy of that file.
3. **One link per page, for its whole life.** The owner bookmarks a page. Updates are published to the **same link**; a new link is made only for a new page.
4. **One writer.** The Lead of the active delivery line (or the owner's delegate) updates the pages. Builders and Verifiers never edit them.
5. **Milestones only.** Pages change when something the owner cares about changes, not on every commit.

## Kinds of page

| Kind | What it shows | When it changes |
|---|---|---|
| **Explainer** (one per project) | What the product is, the roles, the current release promise and its acceptance tests, how work travels, the roadmap, what waits on the owner, and the current status at the top | At every trigger below |
| **Guide** (as many as needed) | Step-by-step instructions for something only the owner can do: create an account, add a key, make a purchase, run a check | Only when those steps change |

## Triggers: update the explainer when

1. A contract is approved or changes version.
2. A task or acceptance test is delivered (merged).
3. A release goes live.
4. The owner accepts a release.
5. The owner answers a decision, or a new decision is put to the owner.
6. The roadmap or the list of postponed ideas changes.

Make a **new guide** when the owner must do something new by hand. Update an existing guide when its steps change, for example after a provider renames a screen.

The update goes in the **same record pull request** as the progress record, so the page and the record never disagree on `main`.

## What to change on the explainer

- **Status line at the top:** a short pill (for example `RELEASE 2 IN BUILD`) and one dated sentence.
- **Where things stand:** each acceptance test or task, with its pull request number and its state (in build, delivered, live, accepted).
- **Roadmap:** which release is current, which is next, and the trigger that starts it.
- **Waiting on the owner:** open decisions, each with a recommended answer. Answered ones are removed.
- **Postponed ideas:** add new ones, and remove ones that moved into a release.
- **A new release:** add its promise and its acceptance tests as a section, in the same visual style as the earlier ones.

Write for the owner: plain words, short sentences, the owner's own names for things. No internal codes unless the owner uses them too.

## Design rules (every page)

- **Colours:** define them once as tokens, with a light and a dark version, and give the page an explicit background.
- **Phone width:** the page reads on a phone with no sideways scrolling.
- **Writing direction:** text in right-to-left languages keeps its direction, and mixed-script text is isolated so it reads cleanly.
- **Title:** a stable name of two to four words, which never changes once the owner knows it.
- **Real content only:** real names, dates and numbers from the record. No placeholders.
- **Design guidance:** a Claude session with the Artifact tool loads the tool's design guidance when it first uses the tool (or through its `artifact-design` skill). Follow it.

## How to publish (Claude on claude.ai, with the Artifact tool)

1. **Edit the source file** in the repository, on the record branch.
2. **In a new session, read before you write.** Use the Artifact tool's `read` action with the page's link. The tool refuses to publish over a page the session has not read. If the page you read differs from the repository copy, because it was edited elsewhere, merge the differences into the source file first.
3. **Publish to the same link.** Use the Artifact tool's publish action with `url` set to the page's link and `file_path` set to the source file.
   - **Never publish an existing page without `url`.** That creates a second page with a new link, and the owner's bookmark goes stale.
   - A session that published the page earlier in the same conversation may republish by the same `file_path`.
4. **Commit the source** in the record pull request, and say in its body which page changed and to what state.
5. **Report to the owner** with the page's link, in the milestone message.

**New page:**
- Publish once without `url`, with a short generic `icon` word.
- Add its link and source file to the project's page list.
- Commit the source.

**Sharing:** pages start private to the owner's account. Only the owner shares a page, from its **Share** menu.

**A session without the Artifact tool:** edit and commit the source anyway, and write "publish pending" in the record pull request. The next session that has the tool publishes the page to the same link and removes the note.

## Adopting this in a project

1. **Copy this file** into the project's `docs/templates/`.
2. **Create `docs/visual/README.md`** with the project's page list: name, link, source file, and kind. Point it to this procedure.
3. **Make the first explainer** from the project's contract, and publish it. Record its link in the page list.
4. **Add one line to the project's Lead checklist** at its record step: "update the visual pages per the visual pages procedure".
5. **Mention the page list in the project's handover notes,** so a new session finds it.
