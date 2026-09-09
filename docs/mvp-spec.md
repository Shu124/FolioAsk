# FolioAsk MVP: document questions with verifiable sources

## Problem Statement

US users in construction, finance, and healthcare need to find and compare
information spread across documents without repeatedly reading every page.
They need to verify answers against the original evidence, recognize missing or
conflicting information, and understand what the tool can safely handle.

The founder needs to validate this service with a polished free experience before
funding paid AI usage from subscription revenue. Unbounded free usage, expensive
processing, and premature promises about regulated data would undermine that goal.

FolioAsk currently has documentation only. No application, authentication,
document pipeline, billing integration, or automated test suite exists.

## Solution

Build a document research assistant that accepts supported PDF and image files,
answers questions across selected documents, and links document-based factual
claims to evidence in the original files. The first release explains, summarizes,
extracts, and compares content; it does not provide professional recommendations.

Visitors can explore clearly labelled guided samples for construction, finance,
and healthcare before signup. Signed-in users receive a one-time free allowance
for public, non-sensitive documents. One USD 29/month plan provides larger
allowances and paid-model processing of eligible private business documents once
the relevant safeguards have been verified.

The product scope was confirmed by the owner during the discovery interview.
Browser/public-API testing boundaries were separately confirmed during conversion
to this specification. Regulatory compliance and model accuracy remain work to
verify, not attributes established by these confirmations.

## User Stories

1. As a visitor, I want a clear explanation of FolioAsk's document research capabilities, so that I can decide whether it addresses my work.
2. As a construction professional, I want to inspect a construction sample, so that I can judge whether the service helps me locate document terms and specifications.
3. As a finance professional, I want to inspect a published-report sample, so that I can evaluate source-backed explanations and comparisons.
4. As a healthcare professional, I want to inspect a published-research sample, so that I can evaluate the product without submitting patient records.
5. As a visitor, I want to try a guided sample before signup, so that I can understand the experience with little effort.
6. As a visitor, I want prepared demonstrations to be labelled accurately, so that I do not mistake reviewed sample answers for live AI performance.
7. As a visitor, I want clear pricing, allowances, supported formats, and content restrictions, so that I understand the offer before registering.
8. As a prospective user, I want to find useful public product pages through web search, so that I can discover and evaluate FolioAsk.
9. As a user, I want to sign in before uploading files or asking live questions, so that my documents and allowances belong to my account.
10. As a free user, I want three successful uploads in total, so that I can evaluate FolioAsk on eligible public documents.
11. As a user, I want to upload PDFs with selectable text, so that I can ask questions about existing digital documents.
12. As a user, I want to upload clear printed PDF scans, so that I can work with documents that need text recognition.
13. As a user, I want to upload JPG and PNG images of printed text, so that I can ask questions about individual scanned pages.
14. As a user, I want unsupported, oversized, or overlength files rejected with an explanation, so that I know how to proceed.
15. As a user, I want actual processing progress, so that I know whether a document is uploading, being read, or ready.
16. As a user, I want an understandable warning when extraction is unreliable, so that I do not assume a poor scan was read correctly.
17. As a user, I want failed processing to preserve my upload allowance, so that service failures do not consume my trial or paid entitlement.
18. As a user, I want uploaded files organized in saved workspaces, so that I can return to related documents.
19. As a user, I want to select the documents a question concerns, so that unrelated files do not influence the answer.
20. As a user, I want to ask natural-language questions across selected documents, so that I can find information without searching each file manually.
21. As a user, I want explanations, summaries, extracted facts, and comparisons, so that I can understand the contents of my documents.
22. As a user, I want factual answers to cite supporting passages, so that I can check their evidence.
23. As a user, I want a citation to open the correct document and page with a highlight, so that verification takes little effort.
24. As an image-document user, I want a citation to open the relevant image and passage, so that image evidence is as inspectable as PDF evidence.
25. As a user, I want missing information identified explicitly, so that a plausible guess is not presented as a document fact.
26. As a user, I want conflicting statements attributed to their respective documents, so that I can assess the disagreement.
27. As a user comparing files, I want evidence considered from every relevant selected document, so that the comparison does not silently omit a source.
28. As a user, I want calculated results to be checked using arithmetic, so that numerical conclusions are not based solely on generated prose.
29. As a user, I want to read my document beside the conversation on desktop, so that I can compare answers with evidence.
30. As a mobile user, I want Document and Chat tabs, so that the workspace remains usable on a small screen.
31. As a user, I want readable text, a restrained visual design, and clear controls, so that I can focus on the information.
32. As a user, I want answers to stream as they are produced, so that I receive visible feedback while waiting.
33. As a user, I want Stop, Copy, and Retry controls, so that I can manage the conversation.
34. As a user, I want my draft question preserved through temporary failures, so that I do not have to retype it.
35. As a free user, I want 20 successful answers in total, so that I can evaluate the service within a clear trial allowance.
36. As a user, I want allowance status displayed, so that I can anticipate when processing will pause.
37. As a user, I want failed answers not to consume my allowance, so that service failures do not reduce my entitlement.
38. As a user, I want a clear explanation that a successful not-found answer counts, so that usage accounting is understandable.
39. As a free user, I want a clear capacity message when the free provider quota is exhausted, so that I understand why requests are paused.
40. As a user at a limit, I want continued access to saved documents and answers within the retention policy, so that I do not lose existing work.
41. As a prospective subscriber, I want one USD 29/month plan, so that the initial purchasing decision is straightforward.
42. As a subscriber, I want 500 newly processed pages and 500 successful answers per subscription month, so that I have predictable processing allowances.
43. As a subscriber, I want 1 GB of stored content and larger per-file limits, so that I can work with more material.
44. As a subscriber, I want no automatic overage charges, so that using the product does not create unexpected charges.
45. As a subscriber with eligible private files, I want their entire model-processing path to use paid services, so that private content never reaches unpaid processing.
46. As a subscriber, I want requests paused when paid processing is unavailable, so that private files are not rerouted to a free model.
47. As a user, I want my account and document permissions enforced on every access path, so that another account cannot retrieve my content.
48. As a user, I want document contents kept out of analytics, so that traffic measurement does not disclose my files or conversations.
49. As a customer, I want truthful eligibility and privacy information, so that I do not assume payment permits uploading any document.
50. As a healthcare customer, I want patient-record exclusions made clear before upload, so that I understand the first release's limits.
51. As a user, I want uploaded instructions treated as document content, so that a malicious file cannot change the application's access or processing rules.
52. As a user, I want to delete documents and associated derived content, so that I can control what FolioAsk retains.
53. As a user, I want to know that deletion frees storage but does not restore processing allowances, so that I understand the effect of deleting files.
54. As a free user, I want the 30-day inactivity expiry explained, so that I know how long my documents and chats remain available.
55. As an active subscriber, I want content retained until I delete it, so that I can revisit ongoing work.
56. As a customer whose paid subscription ends, I want 30 days of read/export access, so that I can retrieve my work before deletion.
57. As a user, I want backup-retention limits described accurately, so that deletion promises match actual behavior.
58. As the operator, I want account and service-wide usage controls, so that the free launch stays within its intended operating constraints.
59. As the operator, I want retries and concurrent requests accounted for consistently, so that duplicate processing cannot bypass limits or consume allowances twice.
60. As the operator, I want reviewed public samples that do not invoke a live model, so that anonymous demonstration traffic does not exhaust API capacity.
61. As the operator, I want subscription changes and provider events reflected reliably in entitlements, so that access matches the customer's subscription.
62. As the operator, I want real document evaluations and processing-cost measurements, so that launch claims and plan allowances are supported by evidence.
63. As the operator, I want sensitive-document features gated on verified requirements, so that commercial availability does not get mistaken for compliance.

## Implementation Decisions

### Confirmed commercial and data boundaries

- Launch market: United States; intended sectors: construction, finance, healthcare.
- Core behavior: document explanations, summaries, fact extraction, and comparisons with verifiable source citations.
- Free content: public, non-sensitive documents only. Public availability does not by itself prove the absence of personal information.
- Paid content: eligible private business documents only after relevant safeguards and provider terms are verified.
- Patient records and other specially regulated sensitive documents remain excluded from both plans in the first release.
- Professional recommendations and approvals are excluded.
- Free users consume free model quota. Paid users fund paid processing through subscription revenue; API usage still has a cost.

| Allowance | Free trial | Paid plan |
| --- | --- | --- |
| Price | Free | USD 29/month |
| Successful uploads | Three total per account, without renewal | Limited by processed-page and storage allowances |
| Newly processed pages | At most 20 pages per uploaded file | 500 per subscription month |
| Successful answers | 20 total per account, without renewal | 500 per subscription month |
| Individual file | At most 20 pages and 10 MB | At most 100 pages and 25 MB |
| Stored content | Bounded by the three-upload allowance and file limits | 1 GB total |
| Model path | Free API quota | Paid API, including embeddings |

- Each JPG or PNG counts as one page.
- Failed uploads and failed answers do not consume their corresponding allowance.
- A successfully delivered not-found answer does consume an answer allowance.
- Deletion releases storage without restoring consumed processing allowances.
- At an allowance limit, pause the affected operation without automatic overage charges.
- Free provider exhaustion pauses free requests, preserves drafts, and explains availability.
- Paid private content must never fall back to unpaid services, including on retries, quota exhaustion, credit exhaustion, or subscription expiry.
- The paid allowances remain provisional pending measured costs and performance before launch.

### Document and conversation behavior

- Support selectable-text PDFs, clear printed PDF scans, and printed-text JPG/PNG files.
- Prefer direct extraction for selectable text and OCR for scanned pages.
- Preserve document identity, page references, passage locations, headings, and table structure for citations and retrieval.
- Chunk extracted text into meaningful sections. Exact chunk sizes and retrieval settings are implementation parameters to validate, not confirmed product promises.
- Retrieve evidence from every relevant selected file for cross-document comparisons.
- Return missing-information and conflicting-evidence responses explicitly.
- Use code to check arithmetic when answers contain calculated results.
- Display real processing state, actionable failure messages, streamed responses, and Stop/Copy/Retry controls.
- Enforce eligibility, ownership, plan allowances, and processing permissions at backend boundaries.
- Treat instructions within documents as untrusted data.
- Do not send document contents to analytics or expose service credentials in the browser.

### Interface and acquisition

- Desktop: document/workspace sidebar, original-document viewer, and conversation panel.
- Citation activation selects the source document and page/image and highlights supporting evidence.
- Mobile: Document and Chat tabs.
- Visual direction: light background, dark readable text, one blue accent, restrained animation.
- Show remaining allowances and explain processing limits.
- Provide a labelled guided demo for each sector before signup using reviewed sample answers.
- Actual uploads and live model questions require signup.
- The demo must not imply that prepared answers are generated live.
- Public marketing pages should communicate the use case, supported formats, plan limits, and scope accurately. Analytics measures use; it does not guarantee discovery or rankings.

### Content lifecycle

| Account state | Content policy |
| --- | --- |
| Free | Delete documents and chats after 30 days of inactivity |
| Active paid | Retain until the customer deletes content |
| Paid subscription ends | Allow 30 days of read/export access, then delete content |

- Customer-initiated deletion includes original files, extracted text, embeddings, and associated conversations.
- Publish the actual backup-retention policy separately. Do not claim immediate backup erasure unless verified.
- Existing private content remains unavailable to free-model processing after paid access ends.
- Content deletion and any separately required billing/security-record retention are different concerns.
- The precise activity definition, reactivation behavior, and notification schedule remain implementation clarifications; do not silently alter the agreed 30-day windows.

### Proposed technical ownership and contracts

The repo has no existing modules, schemas, API contracts, test conventions, domain
glossary, or ADRs. The following responsibilities are proposed from the agreed
behavior; their names and physical organization are not established interfaces.

- Document workspace and conversation: own the user-facing upload, source selection, question, citation, and export interactions.
- Document processing: produce extracted content with stable source references and explicit processing/failure state.
- Answer orchestration: accept the authenticated user's selected documents and question, enforce access and allowed processing, retrieve evidence, and produce a streamed answer with citation references.
- Entitlements and metering: own plan access, allowance checks, successful usage accounting, subscription periods, and retry/concurrency behavior.
- Content lifecycle: own explicit deletion, inactivity expiry, and subscription-end retention.
- Provider adapters: encapsulate model, embedding, storage, authentication, and payment integrations without changing document eligibility or allowing fallback to unpaid processing.
- Guided demonstrations: provide reviewed sample content and answers without a live API request.

Expected persisted concepts are accounts, workspaces, documents, source passages,
conversations, messages/citations, successful usage records, subscription
entitlements, and lifecycle timestamps. Exact schemas and endpoint paths are
not prescribed by this specification.

### Stack candidates from discovery

| Responsibility | Candidate, subject to verification |
| --- | --- |
| Website/backend | Cloudflare Pages and Workers |
| Private original-file storage | Cloudflare R2 |
| Authentication, metadata, extracted text, vector search | Supabase and pgvector |
| PDF extraction/viewing | PDF.js |
| Printed-text OCR | Browser-based Tesseract.js initially |
| Document answers | Gemini 2.5 Flash; evaluate Flash-Lite before substituting |
| Text embeddings | Gemini Embedding 001 |
| Payments | Stripe, conditional on merchant approval and supported billing |
| Traffic measurement | Google Analytics |
| Search visibility monitoring | Google Search Console |

Recheck availability, quotas, prices, data terms, and integration suitability
when implementing. These candidates are not proof that the entire stack can
operate at zero cost or satisfy sector-specific requirements.

## Testing Decisions

### Confirmed boundaries and existing precedent

The owner approved browser/public-API testing for upload, question answering,
citation inspection, plan limits, account isolation, and deletion. Deterministic
tests should simulate external services. A separate evaluation should measure
real model accuracy.

There are no existing tests, application modules, or test frameworks to extend.
Use the application's public behavior as the primary integration boundary rather
than adding tests tied to internal helper functions or database layout.

A good test starts with a user-observable situation, performs a supported action,
and asserts visible output, access, or persisted behavior. Prefer real application
logic with controlled provider responses, time, and failure conditions. Do not
mock away ownership checks, metering, retention, or the behavior under test.

### Primary application integration coverage

- Document workspace and conversation: eligible upload through processing, document selection, a question, a cited response, and opening evidence.
- Extraction/source handling: text PDFs, clear scans, single-page images, unreadable scans, unsupported formats, and file/page boundaries.
- Answer behavior: direct facts, unsupported questions, missing information, conflicting sources, multi-document evidence, and arithmetic.
- Entitlements/metering: every allowance at and beyond its limit; not-found answers; failures; duplicate retries; concurrent requests; deletion without restoring usage; monthly paid renewal.
- Access and provider routing: account isolation across original files, extracted content, retrieval, citations, chats, and export; no unpaid processing of private data under any account or failure state.
- Lifecycle: explicit deletion, free inactivity expiry, active paid retention, subscription-end read/export access, and expiry of that access using controlled time.
- Billing adapter: subscription lifecycle and duplicate/out-of-order provider events in test mode, with entitlements checked through application behavior.
- Failure recovery: exhausted free capacity, unavailable paid processing, interrupted streams, preserved drafts, actionable messages, and correct allowance accounting.
- Guided demos: all three sector samples work anonymously, remain labelled as prepared demonstrations, and do not call a live model.

### Browser coverage

Use a small end-to-end suite for behavior the public API alone cannot demonstrate:
desktop and mobile layout, upload feedback, streamed rendering, Stop/Copy/Retry,
keyboard-operable controls, citation navigation/highlighting, and draft recovery.
Assert that an actual document passage is shown rather than checking only that a
citation button exists.

### Provider and model verification

- Use provider test facilities or narrowly scoped contract checks for actual integration behavior where simulation cannot establish correctness.
- Keep routine tests independent of live model variability and paid usage.
- Build a reviewed set of 30-50 representative questions using suitable public or synthetic material.
- Include direct facts, tables, absent facts, contradictory files, poor scans, cross-document comparisons, and calculated results.
- Measure answer correctness, citation support, missing-information handling, and response time. Set release thresholds before making accuracy or speed claims.
- Evaluate scan processing on typical customer devices, particularly the paid maximum page length.
- Measure complete usage costs, including extraction where applicable, embeddings, retries, retrieved context, answer generation, and storage, before finalizing paid allowances.
- Verify that documents cannot alter application instructions or access boundaries and that document contents are excluded from analytics.

## Out of Scope

- Patient records and other specially regulated sensitive documents in either plan.
- Diagnoses, treatment recommendations, personalized investment advice, and engineering safety approvals.
- Word/Excel imports, handwriting support, and engineering-drawing interpretation.
- Dedicated quotation-comparison products or report-generation workflows beyond the core cited conversation.
- Additional pricing tiers and automatic overage charges.
- Unlimited free uploads, unlimited free questions, or restoration of trial allowances by deleting files.
- Anonymous live AI processing; anonymous access is to the labelled guided demo.
- Claims of universal document support, guaranteed accuracy, guaranteed response times, or verified sector-wide compliance.
- Unverified promises of unrestricted private-document uploads merely because a customer pays.

## Further Notes

### Budget and launch sequencing

Start with free model processing for eligible trial documents. Enable the paid
processing path for subscribed customers after billing and the necessary
private-document safeguards are ready. Subscription income funds ongoing API
costs; activation may still require initial provider credit or billing setup.

The founder explored INR 500-1,000 monthly operating budgets before choosing
free-model validation. Treat minimized upfront spending as a constraint, not a
promise that a public service or regulated-data infrastructure will be free.

### Requirements still to verify

These are launch dependencies, not additional product interviews:

- Define exact eligible and excluded data categories and applicable US requirements for the selected workflows.
- Verify provider contracts, data use, retention, access controls, logging, backups, and the full document-processing path.
- Establish a defensible free-upload eligibility process; a checkbox or automated detector alone does not prove public/non-personal status.
- Validate account isolation, deletion behavior, and the absence of unpaid processing paths for private content.
- Publish accurate privacy, scope, deletion, and incident-handling information before making the corresponding service available.
- Confirm payment-provider eligibility and working subscription lifecycle behavior before accepting payments.
- Define period boundaries, storage measurement, interrupted-answer accounting, qualifying activity, and reactivation behavior consistently with the agreed allowances and retention.
- Verify backup behavior and distinguish content retention from independently required billing/security records.
- Establish accuracy and performance release criteria using the reviewed evaluation set.

### Sources recorded during discovery

- [Gemini API terms](https://ai.google.dev/gemini-api/terms): unpaid-service restrictions and paid-service data-use terms.
- [Google API terms](https://developers.google.com/terms): restrictions concerning protected health information.
- [HHS cloud computing guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html): applicable healthcare responsibilities and agreements.
- [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits): shared project limits and variable capacity.
- [Stripe India availability](https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india): merchant onboarding restrictions checked during discovery.

Revalidate these sources for implementation and launch. The discovery discussion
does not establish FolioAsk's compliance, provider approval, or production readiness.

### Issue publication

Published tracker: [FolioAsk MVP aggregate issue](https://github.com/Shu124/FolioAsk/issues/1), with 18 child issues.
Child-ticket triage label: ready-for-agent.

The requested triage label indicates implementation intake, not permission to
skip release gates. Publication status is tracked separately from product scope.
