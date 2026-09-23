# Approved Design B — responsive production implementation

The user selected **B — Workspace-first** across FolioAsk and explicitly requested small-phone, iPhone/Samsung-sized, tablet and folded/unfolded layouts. Primary design source: local branch `prototype/folioask-ux-options`, commit `6337f86` (original variants `6f89412`). The throwaway route, sample state and review switcher must not enter production.

## Acceptance

- Desktop: compact labelled navigation rail; current-project picker and project creation remain accessible; real chat history in a separate column; large conversation area with a bottom composer and source citations.
- Narrow/tablet widths: navigation and conversation history use labelled drawers with close buttons, native focus containment, Escape and focus return. Move existing elements without losing a question draft or remounting requests. Unfolding restores columns according to available width, not device brand.
- Support widths from 320 CSS px, portrait/landscape, short viewports and enlarged text. At ordinary phone sizes the composer remains reachable and touch controls are at least 44px. Inputs use 16px type; safe-area insets and dynamic viewport height are respected. Avoid full-page horizontal scrolling. At extreme short heights or enlarged text, prefer normal page scrolling over clipped controls.
- Split-story login/signup on desktop, single-column forms on phones. Preserve Google/email auth, password visibility, validation, confirmation and errors; no fake reset links.
- Guided-sidebar onboarding with existing saved preferences, industry, free plan restrictions and first-project creation. No new compliance or paid-plan claims.
- Dashboard, document tables/cards, settings, landing and guided demo share B's restrained hierarchy and consistent spacing. Keep real counters/quotas and all existing upload/citation/Trash flows.
- Account has no password form. Security is separate; the existing verified password-change flow is disclosed only on explicit expansion for email-enabled accounts. Google-only users do not see it. No unimplemented password-reset action.
- Settings → Chat history manages the selected project's real conversations: search, select, rename, archive/restore, confirmed deletion and confirmed clear-all. Clearly state project scope, irreversible deletion, documents retained, unchanged lifetime usage, and partial errors. Refresh chat after management changes. No dummy save-history/temporary-chat toggle.
- Preserve authorization, lifetime allowances, failed-request draft recovery, conversation deletion races and all sensitive-document exclusions. No new migration, provider or paid service.

## Verification and delivery

Use browser/public API boundaries with local synthetic providers. Inspect desktop/mobile light/dark screenshots; test folded→unfolded and portrait→landscape with a typed draft, open drawers, keyboard focus, and 200% text. Run existing regression suites and production build. Emulated viewports are not physical iPhone/Samsung/foldable or real virtual-keyboard verification; report this limitation. Independent Standards/Spec review baseline is `f37485b064947ec0266fab4f5eb6a75a15e4bf61`. Push reviewed production changes and close the implementation ticket; do not claim hosted rollout until verified.
