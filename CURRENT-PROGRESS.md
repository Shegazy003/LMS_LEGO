# Current progress

## Current state, 31 October 2026 (evening): contract 0.3 `CONTRACT READY`, owner's answers recorded

**What is true now**

- The owner answered questions 1 to 7 and asked for more on 8. The answers are recorded in section 7 of [docs/01-PRODUCT-CONTRACT.md](docs/01-PRODUCT-CONTRACT.md): pilot Mesk School with teachers Hadeer and Shimaa and the Science class; username and password sign-in; videos as links; the owner creates the Cloudflare account; GitHub holds tasks and reviews; owner recovery by registered mobile as the goal (recovery code until the product can send messages); free address for the pilot.
- Contract version 0.3 adds one free step to AT-2: the admin sends a one-time reset link through their own WhatsApp to the registered number. The critic took one focused look at the 0.3 delta and returned seven findings (link security, CI observability, the child path, message text, no-WhatsApp dead end, number format, lost recovery code); all seven are resolved in the contract's section 8 without changing the promise.
- [docs/05-ROADMAP.md](docs/05-ROADMAP.md) now places every parked idea on one line of releases (R1 to R5) with the decision each needs and the event that starts it, and explains why release 1 is kept small.
- Hosting decision 001 stands. Nothing is deployed; the owner's Cloudflare account is needed only for the first public address.
- Pull request #1 carries all of this. **The owner's merge of that pull request approves contract 0.3 and freezes it.**

**Active priority:** owner approval of contract 0.3 (merge of pull request #1).

**Waiting on the owner:** the merge; and the subject names from Hadeer and Shimaa, which can arrive any time before AT-2 is built ("Mathematics" stands in).

**Next action, already defined:** after the merge, the Project Lead cuts the first build task, AT-1 (owner shapes a space, appoints an admin, expiry message, usage panel), with its failing tests written first.

**Known limits of this checkpoint:** the free-tier figures in the hosting decision and the WhatsApp rates in Later D were checked on 31 October 2026 against Cloudflare's changelog and third-party rate cards and must be re-read before the first deploy; the Arabic labels in the kits are first drafts for the owner to correct.

## Earlier on 31 October 2026: founding package, contract 0.2 (historical)

**What is true now**

- The repository holds the founding documents and the test rails. There is no product code yet.
- The product contract is version 0.2, `CONTRACT READY`. The product critic's one review (seven findings) is recorded in its section 8 and every finding is resolved. Nothing is frozen until the owner approves.
- Hosting decision 001 (Cloudflare free plan) is proposed; the owner's only action is creating the account, and it is not needed until the first public address.
- The operating rules inherit the platform's roles and decision classes ([AGENTS.md](AGENTS.md)). No Paperclip, Publisher watcher or laptop machinery is required to start.

**Active priority:** owner approval of the contract. One priority, nothing else in progress.

**Waiting on the owner (one bundle):** approve contract 0.2, and answer the seven questions in [docs/01-PRODUCT-CONTRACT.md](docs/01-PRODUCT-CONTRACT.md) section 7. Two of them are RED (the owner account's recovery code, and the hosting account), the rest have recommended answers that stand if the owner says nothing.

**Next action, already defined:** after owner approval, the Project Lead cuts the first build task: AT-1 (owner shapes a space, appoints an admin, validity refusal), with its failing tests written first.

**Owner ideas received 31 October 2026, after the founding package:** guardian (parent) accounts, exam results published per exam in one step, and print orders approved by a guardian and fulfilled by a contracted shop. Recorded as Later A, B and C with future promises, data-model notes and triggers; release 1 scope unchanged, so the contract stays at version 0.2 and needs no second critic review. Idea C is RED before any work (money, outside contract, file access). A fourth idea, password reset verified by the registered mobile number over WhatsApp, is Later D with three shapes; its free shape (a prepared message sent from the appointer's own WhatsApp) is offered to the owner as question 8, and would make the contract version 0.3 with one step added to AT-2.

**Known limits of this checkpoint:** the free-tier figures in the hosting decision were checked against Cloudflare's changelog and pricing summaries on 31 October 2026 and must be re-read before the first deploy; the Arabic labels in the kits are first drafts for the owner to correct.
