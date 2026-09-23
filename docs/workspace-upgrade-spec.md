# FolioAsk workspace upgrade — free pilot

## Problem Statement

The existing pilot supports projects, PDF uploads, source-backed answers and basic
activity reporting, but navigation, onboarding, conversation management and
processing feedback still feel unfinished. Users cannot give conversations stable
custom names or manage their history. Documents are embedded on the first question,
making an uploaded PDF appear ready before it is searchable.

The owner approved improving this experience before introducing paid plans. There
is no Stripe account. Paid billing, subscriptions, paid model routing and paid-only
multi-document comparison must not be activated as part of this release.

## Solution

Deliver a polished free-pilot workspace with resumable profile/industry onboarding,
a searchable project switcher, question-derived and editable conversation titles,
archive/delete controls, upload-time embedding, clear processing/retry states, real
dashboard metrics and coordinated settings and demo screens. Keep existing content
restrictions, owner isolation, evidence citations and cost safeguards intact.

## User Stories

1. As a new user, I want to set my display name after signing in, so that my account feels personal.
2. As a new user, I want to select Construction, Finance, Healthcare or Other, so that my workspace reflects my use case.
3. As a new user, I want to understand the free allowance and document restrictions, so that I know what is available.
4. As a new user, I want to create my first project after profile setup, so that I have somewhere to upload documents.
5. As a user, I want onboarding progress to survive a reload, so that interruption does not lose my setup.
6. As an existing user, I want to keep my projects and history without being locked out by new onboarding.
7. As a user, I want to search existing projects in a clear switcher, so that I can navigate quickly.
8. As a user, I want project creation in the main body, so that the sidebar remains navigation-only.
9. As a user, I want a prominent current-project state and clear section icons, so that I know where I am.
10. As a researcher, I want the current conversation title above the messages, so that I recognize the session.
11. As a researcher, I want a sensible title from my first question without an additional paid model call.
12. As a researcher, I want to rename a conversation and keep that name across reloads and devices.
13. As a researcher, I want searchable conversation history ordered by recent activity.
14. As a researcher, I want an accessible three-dot menu for conversation actions.
15. As a keyboard or touch user, I want those actions available without requiring mouse hover.
16. As a researcher, I want to archive and restore conversations without losing their messages.
17. As a researcher, I want confirmed conversation deletion without deleting source documents or resetting usage allowances.
18. As a researcher, I want a focused message area and bottom composer that work on a small screen.
19. As a researcher, I want selected-document context and citations to remain obvious during a conversation.
20. As a user, I want my draft preserved when capacity is exhausted or a request fails.
21. As a document owner, I want embeddings generated as part of processing my upload, so that Ready means searchable.
22. As a document owner, I want saved-but-not-searchable documents visibly distinguished from Ready documents.
23. As a document owner, I want to retry processing without re-uploading or using another upload allowance.
24. As a document owner, I want processing interruptions recoverable and duplicate retries bounded.
25. As a document owner, I want completed embeddings reused without silently mixing incompatible model versions.
26. As a user, I want existing PDFs to have an honest processing state and a path to indexing.
27. As a user, I want dashboard cards and charts based on my real project data, not fabricated business metrics.
28. As a user, I want seven-day and thirty-day activity views and a searchable recent-activity table.
29. As a user, I want quick links from activity to the relevant document or conversation.
30. As a user, I want processing status and actionable empty states on my dashboard.
31. As an account holder, I want account-level name and industry settings independent of my selected project.
32. As an account holder, I want to manage history and archived chats from settings.
33. As an account holder, I want existing Google-provider information and password restrictions preserved.
34. As a user, I want light, dark and system themes to remain consistent across every new screen.
35. As a visitor, I want the guided demo to match the application and clearly label simulated data.
36. As a mobile, tablet or small-laptop user, I want readable layouts with no page-level horizontal overflow.
37. As an account holder, I want all new actions isolated to my own account and project, including direct API requests.
38. As the operator, I want safe database rollout instructions and explicit live-verification gaps.
39. As the operator, I want a current paid-embedding cost estimate at handoff without activating paid services.

## Implementation Decisions

- Project remains the user-facing name for the existing Workspace domain object.
- Industry is a user preference, not a regulatory certification or authorization to upload sensitive files.
- Display name is editable profile text, not a new login identifier or globally unique username.
- New users receive a resumable profile/industry/free-allowance flow before first-project creation. Existing project owners can complete preferences in Settings without losing access.
- There is only one selectable plan in this release: Free. No nonfunctional checkout or paid entitlement is presented as active.
- Project selection is searchable and keyboard/touch accessible; project creation stays in the main content area.
- Conversations gain durable owner/project-scoped metadata for title and archive state. Older saved answers remain accessible and receive stable conversation identity without discarding citations.
- Initial titles are derived from the first question without a separate LLM request. Renaming is explicit and persistent.
- Archive is reversible. Conversation deletion requires confirmation, removes the owned conversation's saved messages, and does not remove source documents or refund successful-answer usage. In-flight answer completion must not resurrect a deleted conversation.
- Chat actions are available on hover, keyboard focus and touch. The header, history list and settings reflect the same conversation state.
- Upload and embedding are separate durable states: a stored document is not described as searchable until its compatible index is complete. A processing failure retains the original and exposes a safe retry without a second upload charge.
- Processing is initiated from the upload workflow, persists enough state to recover interrupted attempts, and prevents concurrent duplicate work. Provider calls continue to reserve shared capacity before execution; no unbounded automatic retries or paid fallback are permitted.
- Queries embed only the question once an index exists. Documents awaiting indexing are excluded from new answers, with an actionable explanation. Existing documents with a compatible persisted index remain usable.
- Retain the tested free embedding model for the initial implementation. Evaluate newer free models separately against approved documents and actual project access before substitution. Model/dimension changes require versioned reindexing, not mixing vector spaces.
- Dashboard date filters use explicit calendar-day semantics. Counts, processing totals and recent activity use persisted owned data; approximate active time remains labelled and no historical time is invented.
- Existing three-upload, thirty-megabyte and twenty-successful-answer lifetime limits remain. Archive, delete and processing retries do not reset them.
- Saved content remains accessible when AI capacity is paused. This work does not silently enable an operator-paused model policy.
- Use additive database migrations and keep deployed compatibility explicit. Apply required migrations before pushing a dependent build to the auto-deploy branch; do not modify live databases without approval.
- Use existing application modules and code-native icons. Typography, spacing, focus, empty/error/loading states and responsive behavior form one coordinated interface.

## Testing Decisions

Approved boundaries (2026-09-23): browser and public
API for user-visible behavior, plus migration/RPC tests for database access and
atomic state changes. Preserve the established real local persistence and simulate
only external identity/model services and clocks in deterministic tests.

- Follow existing account, project, conversation, document, activity, quota and responsive browser/API tests.
- Exercise profile persistence, interrupted onboarding, legacy-account access, project search and keyboard selection.
- Exercise generated/custom titles, archive/restore/delete, cross-account/project isolation and an answer finishing concurrently with deletion.
- Exercise upload-to-index-to-question, unavailable capacity, interrupted processing, repeated retries, saved originals, unchanged allowances and model-version compatibility.
- Exercise dashboard date windows, honest zero/empty/error states and activity links.
- Verify settings, Google/password regressions, light/dark/system themes, narrow mobile, tablet and small-laptop layouts with screenshots.
- Run focused tests during each vertical slice, typecheck regularly, and run the complete automated suite at the end.
- Independent Standards and Spec reviews compare each implementation with its preceding commit. Fix findings before pushing.
- Automated tests do not establish hosted migration execution, live provider accuracy, regulatory compliance or genuinely concurrent multi-connection PostgreSQL behavior. Record outstanding external checks rather than claiming them complete.

## Out of Scope

- Stripe setup, subscriptions, live checkout, Pro entitlements and paid AI activation.
- Multi-document questions and comparisons, which remain reserved for a future paid release.
- Private/confidential documents, patient records, regulated-data approval and compliance certification.
- OCR, new file formats, teams, organizations, roles or an admin analytics product.
- An unverified claim that any free embedding model matches or exceeds Gemini/OpenAI retrieval quality.
- Changing billing, removing global safeguards, or silently enabling currently paused live AI.

## Further Notes

The approved five-ticket sequence is onboarding/project switcher; chat management;
upload-time embeddings; dashboard (depends on chat and processing); settings/demo/
responsive handoff (depends on the preceding four). The first three have no
functional dependency on one another but will be implemented sequentially.

The user approved the breakdown and testing boundaries. GitHub remains the ticket source; this document is the product spec,
not a replacement set of local tickets. Earlier aggregate/release issues remain
untouched. Close only tickets whose acceptance checks have actually passed.
