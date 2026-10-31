# LMS Lego

A learning space that a non-technical owner can shape like Lego bricks and hand to any organization: a school, a university, a company, a training centre. The owner changes the language, the theme, the names of things (teacher or trainer, student or employee, subject or course) and who is in charge. Nothing is rebuilt and no developer is needed.

**Start here**

1. [CURRENT-PROGRESS.md](CURRENT-PROGRESS.md): what is true now, what is next, what is waiting on the owner.
2. [docs/01-PRODUCT-CONTRACT.md](docs/01-PRODUCT-CONTRACT.md): who it is for, the one release promise, the five acceptance tests, what is in and what is postponed.
3. [docs/02-LEGO-MODEL.md](docs/02-LEGO-MODEL.md): the bricks. Kits, canonical concepts, the authority chain and the data model.
4. [docs/03-HOSTING-DECISION.md](docs/03-HOSTING-DECISION.md): the zero-cost hosting choice and when to revisit it.
5. [docs/05-ROADMAP.md](docs/05-ROADMAP.md): the line of releases, why release 1 is small, and when each parked idea comes forward.
6. [docs/04-LATER.md](docs/04-LATER.md): every good idea that is not in this release, with its trigger.

**How the team works** is in [AGENTS.md](AGENTS.md), [docs/00-OPERATING-CONTRACT.md](docs/00-OPERATING-CONTRACT.md) and [docs/06-DELEGATION-AND-ROLES.md](docs/06-DELEGATION-AND-ROLES.md). They are the short working form of the owner's Completion-First Manifesto and the operating model adopted in the `ai-engineering-platform` repository on 15 October 2026. This repository follows the same roles and rules; it does not copy that platform's machinery.

**Rails already in place**

- `npm test` runs every `test/*.test.js` file with Node's built-in test runner. No dependencies are needed to start.
- `.github/workflows/ci.yml` runs the tests on every push to `main` and every pull request, on a fresh GitHub runner. This is the trusted test location: the Builder cannot change its results.

**Origin.** The brainstorm that led here compared Moodle, Open edX, Canvas, Frappe Learning, LearnHouse, Chamilo, BookStack and Google Classroom, and ended at two conclusions: the owner's real need is small (subject, chapter, lesson, material, with controlled access), and zero recurring cost is a hard requirement. Both conclusions shaped the product contract and the hosting decision.
