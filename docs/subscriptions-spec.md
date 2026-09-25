# FolioAsk subscriptions, affordable AI, and private-document release

Status: approved product direction; implementation and release verification pending.
Test seams and the proposed delivery breakdown are awaiting explicit confirmation.
This specification describes the next release, not the capabilities of the deployed
pilot. Until its release gates pass, the current pilot restrictions remain in force.
The original MVP specification remains the historical product context. Decisions
below supersede conflicting pilot limits only when their implementation is enabled.

## Problem Statement

The current pilot answers document questions accurately enough for the owner to
continue development, but shared Google free quotas interrupt indexing and chat.
FolioAsk needs predictable processing costs, useful subscription choices, trustworthy
usage accounting, and clear customer and owner dashboards. A paid customer must not
receive access merely because a browser reports checkout success, and concurrency
must not permit duplicate paid work or spending beyond admitted budgets.

Construction, finance, and healthcare users may handle confidential information.
Payment and warning dialogs do not establish security or regulatory compliance.
Private business documents require additional access, consent, history, and deletion
protections; patient records and other highly sensitive content remain excluded.

## Solution

Introduce four account-wide plans backed by verified Stripe subscription payments.
Use paid Gemini infrastructure for all enabled customer plans, with a cheaper,
quality-evaluated generation model for Free. Bound processing through atomic usage
and money reservations, durable operation claims, explicit token budgets, and
revenue-linked funding. Preserve source-backed answers and existing files.

Deliver this incrementally: first separate customer entitlements from provider
billing without changing pilot behaviour; then introduce monthly usage, spending
protections, paid processing, sandbox billing, subscription lifecycle management,
deletion, private files, comparison, dashboards, and release verification. Live
checkout and private uploads remain off until their security and operational gates
have evidence and the owner approves activation.

## User Stories

1. As a visitor, I want consistent plan prices and limits across the landing page, onboarding, and settings, so that I can understand the offer before registering.
2. As a Free user, I want 40 successful questions each UTC calendar month, so that I can evaluate document research without subscribing.
3. As a Free user, I want my three lifetime uploads and 30 MB storage limit explained separately from monthly questions, so that I know what resets.
4. As a customer, I want one subscription covering all my projects, so that creating another project does not change my billing or allowances.
5. As a subscriber, I want $19 Starter, $29 Pro, and $39 Plus options, so that I can choose capacity appropriate to my work.
6. As a subscriber, I want allowances tied to my verified billing period, so that renewals are predictable.
7. As a customer, I want existing documents and saved conversations preserved during migration, so that an upgrade does not lose my work.
8. As a customer, I want smaller new file-size limits not to invalidate existing accepted documents, so that I can continue using them.
9. As a customer, I want successful not-found answers identified as consuming one question, so that accounting is transparent.
10. As a customer, I want provider failures to preserve my draft and question allowance, so that service errors do not penalize me.
11. As a customer, I want indexing progress saved across temporary pauses, so that retrying does not start processing again.
12. As an owner, I want concurrent retries to share a durable operation claim, so that duplicate requests do not duplicate paid provider work.
13. As an owner, I want atomic cost reservations before every provider call, so that concurrent users cannot spend the same remaining budget.
14. As an owner, I want actual provider usage reconciled separately from customer question usage, so that failed answers do not hide incurred costs.
15. As an owner, I want ambiguous timeouts to retain conservative cost reservations, so that uncertainty cannot silently reopen spending capacity.
16. As a Free user, I want a warning at 80% of the shared sponsored budget and a clear pause at its cap, so that I understand availability.
17. As a subscriber, I want my funded processing budget separated from the Free pool, so that Free users do not consume my cycle's funding.
18. As a customer, I want account limits, provider throttling, budget pauses, and an operator stop distinguished, so that I know whether and when to retry.
19. As an owner, I want paid funding allocated only from verified collected payments, so that uncollected invoices do not fund processing.
20. As an owner, I want a $7 monthly Free pool and 35% of collected subscription revenue allocated to paid-cycle AI, so that initial costs remain controlled.
21. As a customer, I want concise answers supported by relevant excerpts, so that lower token usage does not remove useful evidence.
22. As a customer, I want model changes evaluated against existing answers, so that a cheaper model does not quietly degrade quality.
23. As a subscriber, I want hosted Stripe checkout with my correct plan and billing details, so that payment information is handled by the payment provider.
24. As a subscriber, I want access activated only after verified payment, so that my account's state is reliable.
25. As a subscriber, I want to inspect invoices and update payment methods, so that I can manage billing without contacting support.
26. As a subscriber, I want plan changes to take effect at the next renewal without immediate proration, so that changes are predictable.
27. As a subscriber, I want cancellation to preserve access through the paid-through date, so that I retain what I purchased.
28. As a subscriber whose renewal fails, I want saved work preserved without receiving unfunded paid allowances, so that I can recover payment safely.
29. As a customer who downgrades above a storage limit, I want new uploads blocked without automatic document deletion, so that I can choose what to remove.
30. As an owner, I want duplicate or out-of-order webhooks and reconciliation retries to be idempotent, so that allowances and funding are not created twice.
31. As an owner, I want verified refunds and disputes reflected in funding while preserving already incurred costs, so that financial reporting remains honest.
32. As a customer, I want Trash distinguished from permanent deletion, so that I understand whether storage is still occupied.
33. As a customer, I want permanent deletion to deny access immediately and reliably clean originals, extracted text, vectors, and affected derived answers, so that removed content cannot return through chat.
34. As a paid customer, I want to submit confidential business files I am authorized to process after giving informed consent, so that I can research eligible work documents.
35. As a customer, I want patient records, government IDs, payment credentials, and other highly sensitive content explicitly excluded, so that I do not mistake the product for a regulated-data platform.
36. As a Free user, I want private-file processing blocked before storage or model calls, so that a warning is not mistaken for permission.
37. As a customer, I want prior conversation sources checked before every new answer, so that changing a plan or document selection cannot expose ineligible private content.
38. As a Pro customer, I want to compare two documents for one question credit, so that I can identify supported differences economically.
39. As a Plus customer, I want to compare up to five documents for one question credit, so that I can research related sources together.
40. As a customer comparing files, I want missing or conflicting evidence attributed to each source, so that incomplete retrieval is not presented as an exhaustive comparison.
41. As a customer, I want a new conversation when I change its selected document set, so that history does not silently change its research scope.
42. As a customer, I want current plan, renewal, remaining questions, uploads, storage, and processing progress on my dashboard, so that I can take useful next actions.
43. As a customer, I want real 7-day and 30-day charts and searchable activity, so that I can understand recent work without confusing deletable history with billing usage.
44. As an owner, I want aggregate revenue, refunds, subscriptions, estimated AI spend, reservations, and capacity warnings, so that I can operate the service without browsing customer content.
45. As an owner, I want audited emergency stops, funding top-ups, and reconciliation controls, so that operational interventions are accountable.
46. As a mobile or tablet user, I want readable light and dark interfaces with accessible controls, so that the new billing and dashboard flows work on small screens.
47. As an owner, I want ordered setup, migration, verification, and rollback instructions, so that I can configure external services without enabling unverified capabilities.

## Implementation Decisions

### Plans and accounting

All sizes below are decimal bytes. Subscriptions and allowances are account-wide.

| Plan | USD/month | Successful questions | Successful uploads | Stored bytes | File bytes | Documents per question |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| Free | 0 | 40/calendar month | 3 lifetime | 30,000,000 | 10,000,000 | 1 |
| Starter | 19 | 300/billing period | 30/billing period | 500,000,000 | 20,000,000 | 1 |
| Pro | 29 | 750/billing period | 75/billing period | 1,500,000,000 | 20,000,000 | 2 |
| Plus | 39 | 1,500/billing period | 150/billing period | 3,000,000,000 | 20,000,000 | 5 |

- Free question periods use UTC calendar months. Paid periods use verified Stripe
  subscription periods. There is no rollover, annual plan, trial, coupon workflow,
  or automatic overage charge in this release.
- Storage does not reset. Trash counts. Storage is released only after confirmed
  permanent cleanup. Deletion does not refund successful processing allowances.
- A valid not-found answer consumes one question. Failed provider work does not,
  but its incurred monetary cost remains accounted for.
- Preserve legacy counters, documents, and history. Record new period-based usage
  without treating deletable answer counts as a financial ledger. Migration must
  not silently rewrite or erase historical usage.
- Account plan and AI-provider billing are separate domain concepts. Changing a
  provider's billing configuration never grants a customer paid entitlements.
- Existing accepted files remain usable; new limits apply to new admissions.
  Continue PDF, DOCX, XLSX, CSV, TXT, and Markdown support with the existing
  100-page/section and 200,000-extracted-character limits. Add a 50,000 indexing-token
  cap per file. Explain unsupported extraction, rather than claiming complete OCR.

### Provider processing and cost controls

- Use paid Gemini API infrastructure for all enabled plans, without unpaid
  fallback. Free's candidate is gemini-3.1-flash-lite, subject to quality evaluation.
  Paid plans retain gemini-3.5-flash-lite. Embeddings retain gemini-embedding-001
  with 768 dimensions. Model identifiers and versioned prices are server controlled.
- Target approximately 2,000 input tokens for simple questions. Bound the complete
  request, including instructions, evidence, history, and question, to 4,000 input
  tokens for Free and 6,000 for paid. Bound billable output including thinking to
  1,024 Free and 2,048 paid tokens using supported model configuration.
- Preserve citation validation and instructions treating documents as untrusted
  data. Remove duplicated instructions, select relevant passages, retain tables
  and headings, and include only necessary recent history. Do not add paid rewrite
  or summarization calls merely to reduce the visible prompt.
- Comparison shares a bounded evidence budget across selected sources. Explicitly
  identify unsupported or conflicting evidence and do not promise exhaustive
  comparison when only retrieved excerpts were considered.
- Every provider operation needs an atomic fixed-unit money reservation and a
  durable in-flight claim before outbound work. Answer allowance admission is also
  atomic. Replays reuse saved outcomes; parallel retries must not duplicate calls.
- Index checkpoints remain resumable. Claims cover individual indexing batches as
  well as answer requests. Failures and stale claims require conservative recovery;
  expiry alone must not assume an ambiguous paid operation never ran.
- Reconcile provider-reported usage against reservations. Retain conservative
  reservations when usage is unknown. Track provider burn separately from question
  allowance consumption. An account may have questions left while funding is paused.
- Sponsor Free with $7/month. Allocate 35% of each verified collected subscription
  payment, excluding tax and reflecting discounts/refunds, to that customer's
  billing-cycle AI budget. Normal full-price allocations are $6.65, $10.15, and $13.65.
- Warn at 80% and reject work that cannot be reserved within the cap. Separate
  account allowance, Free-pool budget, paid-cycle budget, provider rate quota, and
  operator emergency-stop states. Owner top-ups and stops are audited.
- Replace hardcoded Google free-tier quota assumptions only when the paid path is
  ready. Provider quotas remain separately enforced and deployment-specific.
  Provider billing alerts are a backup, not a guarantee of immediate cutoff.
- Do not automatically upgrade Cloudflare or Supabase billing. The $10 initial
  target is an operating target, not a promise that all external charges are capped.

### Billing and lifecycle

- Hosted Stripe Checkout is created from a server-approved catalog mapping stable
  plan identifiers to recurring USD Price identifiers. Reject client-supplied
  prices, amounts, and customer ownership assertions.
- Verify the owner's India account/export eligibility before live activation,
  including required customer name, billing address, and service description.
- A checkout return page polls authoritative billing status; it never grants
  access. Only verified payment creates funded entitlements and immutable periods.
- Browser mutations retain authentication and same-origin protection. The webhook
  has a narrowly scoped pre-authentication exception and verifies its signature
  against the unmodified raw body.
- Webhook storage and handling are idempotent and safe for duplicates, retries, and
  out-of-order events. Reconciliation checks authoritative provider state when needed.
- Plan changes are scheduled for the next renewal, with no immediate proration or
  allowance reset. The app manages changes and cancellation; the customer portal
  provides invoices and payment-method management without competing schedule controls.
- Cancellation retains access through the paid-through date. Failed renewal grants
  no new paid allowance. Preserve read/download/delete access and eligible Free use.
  Above-limit storage blocks new uploads rather than automatically deleting files.
- Verified refund/dispute handling adjusts funding and access without erasing costs
  already incurred or reissuing consumed allowances accidentally.
- Persist subscription state, immutable usage periods, verified payment allocations,
  monetary reservations, in-flight operations, webhook processing, and owner audit
  records. Preserve existing conversation archive/deletion safeguards in final
  answer commits, including compatibility wrappers in database procedures.
- A small scheduled maintenance Worker retries billing reconciliation and deletion
  jobs. Failure is observable and retryable without granting duplicate capacity.

### Private files, conversations, and deletion

- Free admits declared public, non-sensitive documents only. Paid confidential
  business files require authorization to process and versioned informed consent.
  Patient records, government identifiers, payment credentials, and other highly
  sensitive content remain excluded. Automated detection is not guaranteed.
- Live checkout and private upload admission default off until verification. Paid
  provider setup or a customer plan flag alone must not bypass these gates.
- Originals remain in private R2 with authenticated reads. Database operations
  enforce account isolation. Secrets stay server-side; private responses are not
  cached. Do not log document names, content, questions, answers, or citation quotes.
- Bind conversations to a document set. Changing that set starts a new conversation.
  Validate current source eligibility and previous-history provenance before each
  new answer, including when a subscription downgrades or a source is deleted.
- Permanent deletion immediately denies access and creates a durable cleanup job.
  Remove originals, extracted text, vectors, and affected derived answers. Tombstones
  prevent in-flight work from recreating deleted content. Release storage only after
  confirmed cleanup. Do not automatically delete documents on cancellation.
- Explain application and provider backup retention accurately. Do not claim HIPAA
  compliance, zero retention, professional advice, or regulated-data readiness.

### Customer and owner experiences

- Extend Design B rather than introduce a competing design system. Preserve light
  and dark modes, keyboard operation, visible focus, and narrow-screen layouts.
- Customer dashboard shows plan, renewal, scheduled changes, remaining questions,
  uploads, storage, indexing progress, and actionable pause reasons. Add actual
  7-day/30-day charts and searchable recent activity, without fabricated metrics.
- Billing settings expose checkout when enabled, invoices, payment methods,
  cancellation, and scheduled changes. All plan selectors share the server catalog.
- Owner access uses a server-configured immutable account-ID allowlist, never
  user-editable profile metadata. Display aggregate subscription counts, collected
  revenue, refunds, explicitly labelled MRR, estimated spend, reservations, funding,
  capacity warnings, errors, and queue backlogs. Never expose customer content.
- Owner controls for top-ups, emergency stops, and reconciliation require server
  authorization and audit records. Usage and spend labels distinguish estimates,
  reservations, incurred costs, and collected revenue.

## Testing Decisions

The following proposed test seams need owner confirmation before new test work:

- Prefer browser and public application interfaces: sign in, upload, ask, inspect
  citations, manage plans/history, inspect usage, and delete. Exercise implemented
  behaviour rather than internal helper shapes.
- Use deterministic external adapters for Stripe, Gemini, time, and storage, while
  keeping real application logic and a PostgreSQL-compatible database behind public
  requests. Test migrations, row-level security, and database procedures directly
  where the browser cannot prove their guarantees.
- Add true multi-connection PostgreSQL race tests for financial admission, operation
  claims, webhook handling, and deletion. A single-connection compatibility database
  is not sufficient evidence of production concurrency safety.
- Cover forged identifiers, tenant isolation, CSRF, raw-body signatures, duplicate
  and stale webhooks, concurrent allowances/spending, index retries, paid periods,
  failed renewals, refunds, downgrades, private-history provenance, and deletion while
  work is in flight. Preserve existing archive and deleted-thread protections.
- Check balanced multi-document citations, missing/conflicting evidence, malicious
  document instructions, token caps, and not-found accounting. Failed operations
  must preserve drafts and avoid consuming question allowance.
- Run type checking, focused tests per change, full regression suites, production
  build, and Cloudflare-runtime checks. Exercise 320-pixel phones, tablets, and
  laptops in both themes, including accessible checkout dialogs and dashboards.
- Separately verify Stripe sandbox purchase/lifecycle events and at least 40 public
  or synthetic real-model cases. Compare original and optimized requests for answer
  correctness, citation validity, isolation, measured tokens/cost, and latency. Do
  not activate the cheaper Free model without acceptable baseline quality and cost
  evidence. Real calls require an explicitly configured bounded evaluation budget.
- Hosted CPU/memory, database capacity, actual provider quotas, payment availability,
  private-bucket access, and production policies are release evidence, not facts
  established by passing local tests. Do not claim support for 200 concurrent users
  without an appropriate measured load test.
- Review each implementation against its pre-change commit and originating approved
  scope with independent Standards and Spec reviews. Fix findings before pushing.
  Final release review starts at d0e183d00cdb971eccecdd95dda3945b19783825.

## Out of Scope

- Live activation before owner approval and verification; automatic external billing
  upgrades; unlimited usage or guaranteed $10 all-in operation.
- OCR, images, scanned-document processing, PowerPoint, additional formats, and
  unsupported legacy/macro-enabled Office content.
- Patient records or highly sensitive documents, regulatory certification, clinical
  practice, professional recommendations, and automated privacy guarantees.
- Annual billing, trials, coupon-management UI, rollover, usage overage charges,
  immediate prorated plan changes, and automatic deletion on cancellation.
- Automatic migration to a new vector database or embedding model without a separate
  demonstrated need and compatibility plan.
- Promises of revenue, margins, conversion, availability, or 200-user concurrency
  based on proposed prices or local tests alone.

## Further Notes

- The owner reports an approved India Stripe account. Verify sandbox configuration
  and live export eligibility without requesting credentials in conversation.
- GitHub authentication currently returns HTTP 401. The product specification can
  be prepared locally, but no issue publication, remote push, or issue closure is
  claimed. Keep tickets in the configured GitHub tracker; do not create local copies.
- Ticket publication and new test work await confirmation of the proposed breakdown
  and test seams. The product choices above were approved during planning.
- Provide setup instructions for ordered migrations, Stripe products/prices/webhooks
  and portal, paid Gemini configuration, owner access, the maintenance Worker,
  Cloudflare/Supabase capacity checks, rollback, and explicit release gates.
- Leave the release-verification issue open whenever external evidence is missing,
  even if code implementation is complete.

Primary references checked during planning (verify again for integration details):

- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing),
  [billing](https://ai.google.dev/gemini-api/docs/billing),
  [model lifecycle](https://ai.google.dev/gemini-api/docs/deprecations), and
  [terms](https://ai.google.dev/gemini-api/terms).
- [Stripe webhooks](https://docs.stripe.com/webhooks),
  [subscription lifecycle](https://docs.stripe.com/billing/subscriptions/overview),
  [customer management](https://docs.stripe.com/customer-management), and
  [India international payments](https://docs.stripe.com/india-accept-international-payments).
