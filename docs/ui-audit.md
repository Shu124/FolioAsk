# Workspace UI audit — September 2026

Tracked in [issue #42](https://github.com/Shu124/FolioAsk/issues/42). Review baseline: `0dcf6e03e075d0c692e7aea7cf37a8cfa7ae3fba`.

## Findings and changes

- Opening the project picker at 1280 × 600 moved navigation down **302.78 px**. The inline panel enlarged the scrollable sidebar; focusing search could hide the trigger. The picker now uses a bounded top-layer popover, with its own scrollable results, search, current-project indication, Escape/focus return and outside dismissal.
- Keyboard testing exposed premature dismissal between blur and focus. The picker now checks the next focus target rather than inspecting `activeElement` during that transition. Viewport changes reposition the panel; scrolling its trigger out of view dismisses it.
- Mobile navigation previously hid the current project when collapsed. The project control now remains available independently of the navigation links.
- Chat's separate new-conversation toolbar and loose header consumed the message area. New chat now sits beside the conversation title; source selection and submit share the lower composer row on wider screens. Message history retains readable height instead of shrinking below the answer. Small screens stack controls.
- Documents were pushed below a large allowance panel. The table now precedes that panel, with remaining uploads and the sample download grouped above the uploader. Safety notices, limit warnings, upload feedback, Trash and Restore remain intact.
- Dashboard, settings, sidebar and sign-up spacing have been tightened without shrinking inputs or button targets. Charts use narrower columns on small screens; table-to-card behavior remains.
- The guided demo's chat title now uses its sample question, matching the real conversation heading. The public landing page's existing section hierarchy and truthful pilot/paid-plan disclosures are retained.

## Verification boundaries

Browser tests exercise sign-in/onboarding, uploads, document tables, conversations, settings, source citations, project switching and the public demo. Visual coverage includes light/dark themes, enlarged text and the responsive suite's phone/tablet/laptop sizes. New picker checks cover 320 × 568, 768 × 1024, 844 × 390 and 1280 × 600, long names, search/no results, keyboard selection, dismissal, resizing and 200% text.

Tests use isolated local services and synthetic fixtures, not live customer files or billable AI calls. The original short-laptop regression was reproduced twice before the fix. Screenshot artifacts are generated under `test-results/` and are not committed.

Verification outcome: 36 API and 9 Cloudflare-runtime tests passed. The full browser run passed 71/73 cases; the multi-screen mobile visual flow exceeded its 30-second total timeout, and the narrow-phone PDF preview completed just after its five-second assertion window. The visual flow now has a 60-second total budget. A seven-case final rerun passed both failures, the desktop/mobile picker regressions and the composer keyboard-order checks. The narrow-phone test passed without changing its assertion timeout. Production build passed (the existing lazy-loaded PDF.js chunk still emits a bundle-size warning).

Independent Standards and Spec reviews found no blocking issues. The Standards review's optional keyboard-order improvement was implemented and rechecked: question entry now precedes source selection in both DOM and visual order.

## Release boundary

This UI slice adds **no database changes** and activates no paid service. The branch also contains the earlier conversation work (#38), which requires `supabase/migrations/008_conversations.sql` before deployment. Do not push/deploy the combined branch until that migration is confirmed. Upload-time embeddings (#39), additional dashboard functionality (#40), and broader settings/history work (#41) are separate pending scope; this audit does not claim those tickets complete.
