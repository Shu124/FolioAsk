# FolioAsk

## Workspace redesign setup

The landing page and guided demo now match the project's Dashboard, Documents,
Chat and Settings layout. The public demo is entirely simulated and makes no
upload or model requests. Its example Trash changes reset when the page reloads.

For a zero-cost local walkthrough with simulated identity and AI, use PowerShell:

```powershell
npm.cmd ci
$env:FOLIO_TEST_MODE='1'
npm.cmd run dev
```

Open the printed localhost URL, then `/app`. Sign in with a fresh `@example.test`
email (such as `walkthrough@example.test`) and the fixture password
`local-test-password`. Fixture sign-up is disabled; never use real credentials here.
Create a project, open Documents → Add document, and upload the linked synthetic
test PDF. Explore Chat, source citations, Trash/Restore, Dashboard and Settings.
To return to real Supabase identity, stop Vite, run
`Remove-Item Env:FOLIO_TEST_MODE`, then restart with `npm.cmd run dev`.
Fixture mode is local-only; never enable it in a public deployment.

For an existing Supabase deployment, apply the migrations below in order before
deploying this branch. Account creation alone does not configure document storage
or live AI; follow the Supabase, Cloudflare R2 and Gemini setup sections below.

### Required migrations: 004 then 005

Dashboard active-time tracking also requires `supabase/migrations/005_active_time.sql`
after migration 004. It creates private, service-role-only interval records. Counts
and charts use real saved project data; historical time is not estimated. Active time
is approximate, pauses while hidden/unfocused or after 60 seconds without interaction,
and is not used for billing. Each completed 15-second interval counts at most once
per account, including across tabs; its first reporting project receives the interval.
Retries retain the maximum duration, not the sum. Partial final intervals can be lost
when leaving a project. Verify deployed time recording after applying this SQL;
local tests do not certify production migration execution.

Before deploying document management (#29), open your Supabase project → SQL Editor
and run `supabase/migrations/004_document_trash.sql`, after migrations 001–003.
This adds the owner-scoped Trash/Restore RPC and updates answer commits to reject
sources moved to Trash during model generation. It does not delete stored files,
embeddings, saved answers or usage counters. Trashed sources cannot be used for
new questions; restore them from Documents → Trash before previewing or asking.

Local SQLite development creates the required structures automatically. Automated
tests exercise local persistence, not your live Supabase database. After applying
the SQL, verify upload → Trash → blocked question → Restore with a synthetic PDF
in your deployed preview, and confirm upload/answer allowances do not reset.
Do not deploy this feature before applying its SQL migration.

Ask questions across your documents and verify answers against the source.

FolioAsk is a planned document research assistant for US construction, finance,
and healthcare users. Its first release will explain, summarize, and compare
supported document content with clickable citations.

## Project status

The guided demo, owned workspaces, controlled text-PDF upload/preview, and
single-document Q&A with citations are implemented. Q&A is verified with simulated
providers only; the real Gemini check is pending credentials. Subscriptions,
scans/OCR, and the remaining release features are not implemented yet. Regulatory
compliance has not been verified.

- [MVP specification: user stories, implementation and testing decisions](docs/mvp-spec.md)
- [GitHub aggregate issue and 18 child tickets](https://github.com/Shu124/FolioAsk/issues/1)
- Working branch: `feature/folioask-mvp`

## Start locally

Install Node.js 24 or newer, then run:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. No API keys or paid accounts are required for
the guided demo. On Windows, use `npm.cmd` if PowerShell blocks the npm script.

```sh
npm run typecheck
npm test
npm run build
```

Browser tests use installed Google Chrome by default. Alternatively run
`npx playwright install chromium` and set `PLAYWRIGHT_CHANNEL=chromium` in your
shell before testing. The build output is `dist/`.

### Responsive layout checks

Run `npm run test:browser -- --project=responsive` for the dedicated viewport
matrix: 320–1366px wide phones, portrait/landscape tablets, short laptops and
landscape phones. Screenshots are written under ignored `test-results/`.
The checks cover the landing/demo/auth pages, populated workspace tabs, both
themes, compact navigation, table actions, and resizing with a chat draft.
The short-laptop check covers 200% text sizing, including internal navigation
overflow; the regular desktop/mobile suite also checks enlarged text.

Navigation becomes a compact top panel through 960px. Below 640px of available
content width, document and recent-activity tables become labelled rows with
visible actions. These are browser viewport checks, not physical iOS/Android
device or mobile-keyboard certification; include those in deployment QA.

## Deploy the current demo to Cloudflare Pages

1. Create a Cloudflare account and connect your GitHub account to Pages.
2. Create a Pages project from `Shu124/FolioAsk`, selecting `feature/folioask-mvp`.
3. Set build command to `npm run build`, output directory to `dist`, and build
   environment variable `NODE_VERSION` to `24`.
4. Deploy and open the provided `pages.dev` URL. Test all three sample citations
   on desktop and mobile before sharing it.

The guided demo needs no R2, Gemini, Stripe, domain purchase, or secrets. Sign-in
requires the Supabase setup below. Do not enable private uploads or charge
customers based on this preview.

Reference: [Cloudflare Pages Vite deployment](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/)
and [build environment configuration](https://developers.cloudflare.com/pages/configuration/build-image/).

## Set up Supabase sign-in and workspaces

1. Create a Supabase project for development. Keep its database password secure.
2. Open SQL Editor and run `supabase/migrations/001_workspaces.sql` once. It creates
   the workspace/session tables and denies direct browser access through RLS.
3. In Authentication → Providers, enable email/password and keep email confirmation
   enabled. Set Site URL and allowed redirects to your local/deployed app URLs.
4. For a controlled pilot, create and confirm test users via the dashboard. Before
   opening signup to customers, configure your own SMTP provider and test email
   delivery; do not depend on the development email service for public signup.
5. In Settings → API Keys, copy a server-side secret key (`sb_secret_...`). Existing
   legacy `service_role` keys also work. Copy `.env.example` to `.env` locally and
   fill `SUPABASE_URL` (the project's `https://PROJECT_REF.supabase.co` URL) and
   `SUPABASE_SERVICE_ROLE_KEY` (this variable accepts either key format). Never use
   a `VITE_` prefix for secrets or commit them.
6. Restart `npm run dev`, visit `/app`, and choose **Create account** to open the
   registration form, or open `/app?auth=signup` directly. Enter your email and a
   password of at least 12 characters, repeat the password, and submit. Confirm
   your email before signing in, then create a workspace and reload. Existing
   confirmed pilot users can use **Sign in** immediately.
7. In Cloudflare Pages settings → Variables and Secrets, configure the same values
   for the intended environment, marking the key secret. Redeploy. The repository's
   `functions/api/[[path]].ts` supplies the backend; this is not a static-only upload.
8. Verify two real Supabase accounts cannot list or open one another's workspaces,
   then sign out and check that the old session no longer works. Run these checks
   on the deployed URL before inviting pilot users.

Passwords are sent over same-origin HTTPS to the backend and verified by Supabase;
the app never stores them. A random HttpOnly/SameSite cookie identifies a server
session whose token is stored hashed. Sessions expire after 24 hours (sign in again),
and sign-out revokes that session immediately. Backend routes enforce ownership;
the service-role key bypasses database RLS and must remain server-only. This is
implementation detail, not a security or compliance certification.

### If local sign-in fails

- Keep `FOLIO_TEST_MODE` unset or `0` when using a real Supabase account. Synthetic
  mode accepts only the documented fixture credentials and does not send signup emails.
- Verify the email confirmation link and run `001_workspaces.sql` before signing
  in. The Supabase dashboard's own login does not create an app user.
- Public signup email delivery requires your Supabase SMTP configuration. If no
  email arrives, check spam and Authentication logs/provider settings. The app's
  confirmation message deliberately does not reveal whether an account exists.
- `npm run dev` uses Node's `--use-system-ca` flag. This includes trusted operating
  system certificates while keeping HTTPS verification enabled, fixing certificate
  chain errors on Windows networks with a trusted certificate proxy. Restart an
  older running server after updating. Never disable TLS verification.

Reference: [Node system certificates](https://nodejs.org/api/cli.html#--use-system-ca)
and [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

References: [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords),
[row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Pages secrets](https://developers.cloudflare.com/pages/functions/bindings/#secrets).

## Local synthetic pilot (no external accounts)

Set `FOLIO_TEST_MODE=1` in your ignored `.env` and restart the local dev server.
Sign in with any `@example.test` address and password `local-test-password`.
This simulates only the external identity provider, saves local data under
`.local/pilot.sqlite`, and is restricted to loopback connections. Never use real
documents or expose this mode to a network. It is absent from the deployed API.
Browser tests enable it automatically. Production never falls back to fixture auth.

Local API tests use temporary SQLite databases and controlled identity responses;
they do not verify your Supabase project settings or replace deployed isolation tests.

## Set up text-PDF originals in Cloudflare R2

1. Complete Supabase setup, then run `supabase/migrations/002_documents.sql` in SQL
   Editor. The SQL transaction serializes successful upload accounting across API
   instances; do not replace it with browser-side counters.
2. Enable R2 in your Cloudflare dashboard and create a private bucket, for example
   `folioask-originals-dev`. Review account billing requirements before activation.
   Keep public access and `r2.dev` access disabled. Do not add a public bucket domain.
3. In the Pages project settings → Bindings, add an R2 bucket binding named
   `ORIGINALS` pointing to that bucket. Use separate development and production
   buckets/projects. Redeploy after binding changes.
4. Run `npm run build` locally. The prebuild generates the synthetic test PDF and
   prints its SHA-256 digest. Set `APPROVED_PUBLIC_HASHES` in Pages to that digest.
   It accepts a comma-separated allowlist, but only add files whose exact bytes
   have been reviewed for admission. Leave it empty to deny all new uploads.
5. Redeploy, sign in, download the synthetic test PDF from the workspace, upload
   it, and inspect the rendered page and extracted text. Confirm a second account
   cannot download its original or extracted content, including by copied URL.
6. Test concurrent uploads/retries against the deployed SQL/R2 configuration before
   allowing a controlled pilot. Current automated tests use local SQLite storage;
   they do not attest to your R2 settings or execute the PostgreSQL migration.

Limits use decimal bytes: 10 MB = 10,000,000 bytes. Only successful uploads count
toward the three-upload lifetime allowance. Keep the same Idempotency-Key on
network retry; reusing a key for different file bytes/workspaces is rejected.
Page text retains PDF text-item positions (including heading sizes and table
alignment); complex reading order or merged table cells are not yet interpreted.

Originals are served only through the authenticated API, never by public R2 URL.
No deletion/expiry workflow or backup-erasure guarantee exists yet. If a database
response is lost after a write, the backend deliberately retains the candidate
blob to avoid deleting a successfully committed original. Before live release,
orphan reconciliation and the lifecycle tickets must be completed. Use synthetic
fixtures only. No general sensitive-data detector or compliance claim is made.

The no-account local pilot stores both metadata and originals in ignored SQLite.
Vite with real Supabase credentials supports sign-in/workspaces only; use the
Cloudflare preview deployment for the actual R2-backed upload integration.

References: [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/),
[Pages R2 bindings](https://developers.cloudflare.com/pages/functions/bindings/#r2-buckets),
[unpdf / PDF.js integration](https://github.com/unjs/unpdf).

## Set up Gemini for a controlled real-provider check

1. Open [Google AI Studio](https://aistudio.google.com/) and create an API key in a
   project eligible for free-tier Gemini usage. Verify the project's billing/quota
   status; a variable named “FREE” cannot prove that a Google project is unbilled.
   Do not enable paid billing for this initial test.
2. In ignored `.env`, set `GEMINI_FREE_API_KEY` and, after checking the project,
   `GEMINI_FREE_PROJECT_CONFIRMED=yes`. Never put the key in browser code, a
   `VITE_` variable, Git, screenshots, or chat.
3. Run `npm run test:live`. This submits only the generated synthetic construction
   fixture through the real application upload, extraction, retrieval, answer,
   and citation-validation API path. It uses local storage and simulated identity
   so this is not a Supabase/R2 deployment test. A missing key exits without making
   a provider call; a failed provider/answer check exits unsuccessfully.
4. Inspect the reported PASS/FAIL. One correct answer does **not** establish model
   accuracy, speed, cost, prompt-injection resistance, or regulatory compliance.
   The full evaluation and release-gate tickets must still be completed.
5. To try real Q&A in the local synthetic pilot, additionally set
   `FOLIO_TEST_MODE=1` and `FOLIO_LIVE_SMOKE=1`, then restart `npm run dev`.
   Without the live flag, local answers are explicitly labelled simulated.
   Automated browser tests force simulation even if your local live flag is set.
6. For a Cloudflare controlled preview, run `003_answers.sql` in Supabase, set the
   key as a Pages secret and the confirmation flag as a server variable, retain
   the exact reviewed-file allowlist, and redeploy. Removing the key/confirmation
   pauses new answers while saved content remains readable.

The current adapter pins `gemini-2.5-flash` and `gemini-embedding-001` (768
dimensions). It has no paid fallback. Availability/quota failures preserve the
question and successful-answer allowance. Verify those models and free terms in
your project before the check; provider offerings may change.

Embeddings are generated once per document/model version and persisted as private
JSON vectors. For the current three-file pilot, cosine retrieval runs over those
owned chunks in the backend; this is **not** a pgvector index. Future scale/cost
validation may justify moving retrieval into pgvector. Answers and exact citation
references are saved atomically with the 20-answer lifetime meter. Successful
“not found” responses count; provider errors and invalid citation references do not.
The server checks cited IDs and quote substrings, not semantic truth—users must
still verify the highlighted source. Documents never authorize tools or access.

References: [Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key),
[models](https://ai.google.dev/gemini-api/docs/models),
[embeddings](https://ai.google.dev/gemini-api/docs/embeddings),
[structured output](https://ai.google.dev/gemini-api/docs/structured-output),
[current pricing/free-tier terms](https://ai.google.dev/gemini-api/docs/pricing).

## Implementation progress and remaining work

- [#2](https://github.com/Shu124/FolioAsk/issues/2),
  [#3](https://github.com/Shu124/FolioAsk/issues/3), and
  [#4](https://github.com/Shu124/FolioAsk/issues/4): implemented, reviewed, fixed,
  tested locally, and pushed to the feature branch. Live infrastructure settings
  still need the deployment checks above.
- [#5](https://github.com/Shu124/FolioAsk/issues/5): Q&A implementation and
  deterministic tests exist; the required real-provider check is not yet run.
- Tickets [#6–#19](https://github.com/Shu124/FolioAsk/issues/1) remain. Do not treat
  this branch as the finished MVP or enable unrestricted uploads/private files.

No Stripe account or payment key is needed yet: checkout remains disabled. OCR,
cross-document comparisons, checked arithmetic, streaming controls, exports,
deletion/retention, paid entitlements, analytics, quality evaluation, and verified
free/paid releases are later tickets. Their setup instructions will accompany their
implementation rather than implying those integrations already work.

# Project experience and settings

After signing in, name your first project. Returning users open an existing
project automatically. Use the project selector to switch, and the sidebar to
open Dashboard, Documents, Chat, or Settings.

- **Documents:** upload an approved synthetic PDF and inspect its original pages.
- **Chat:** select a document, ask a question, or start a New chat. A conversation
  is saved with its first successful answer. Dashboard reopens saved conversations.
  Follow-ups use at most four previous turns (up to 1,000 question and 2,000 answer
  characters each); only the selected document can support citations. Older saved
  answers appear as individual conversations and can be continued.
- **Settings:** save your display name, rename the current project, inspect actual
  usage, and choose Light, Dark or System. Appearance is remembered on this browser,
  not synced between devices; original PDF pages retain their colors.
- **Password:** email accounts can change their password after entering the current
  password. FolioAsk verifies the current password and revokes sessions before the
  provider update. If the provider then fails, sessions stay signed out and the app
  explains how to sign in again. Google-only accounts
  manage their password with Google. A self-service forgotten-password email flow
  is not included in this release.

These features reuse the existing Supabase tables and JSON answer records: no new
SQL migration is required beyond the existing setup migrations. Profile names are
stored in Supabase Auth user metadata; never use that metadata for authorization.
The local `FOLIO_TEST_MODE=1` identity service is a simulation, including Google;
fixture profile/password changes reset when that development server restarts.

Restart with `npm run dev` after changing environment variables. For a production
Cloudflare deployment, rebuild/redeploy after pushing; a Git push alone does not
prove that the live site is updated. Live document uploads require the R2 binding
and approved-file configuration described below. If local Supabase-only development
has no document service configured, settings report usage unavailable rather than
inventing quota numbers. No paid subscription or regulatory-compliance certification
is introduced by this UI upgrade.

# Google sign-in setup

Google sign-in uses Supabase with PKCE; FolioAsk exchanges the authorization code
on the server and issues its own HttpOnly session. No Google secret belongs in
browser code or a `VITE_` environment variable.

1. In Google Cloud Console, choose/create a project. Configure the Google Auth
   Platform consent screen (branding, audience and contact details). If the app
   is in testing, add the Google accounts that will test it.
2. Create an OAuth client of type **Web application**. In authorized redirect
   URIs, enter `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` (copy the
   exact callback from your Supabase Google provider screen).
3. In Supabase **Authentication > Sign In / Providers > Google**, enable Google
   and save the client ID and client secret there, not in this repository.
4. In **Authentication > URL Configuration**, set the Site URL to your deployed
   FolioAsk origin. Add allowed redirect URLs
   `http://127.0.0.1:5173/app?oauth=google&state=*` for local development and
   `https://YOUR_FOLIOASK_DOMAIN/app?oauth=google&state=*` for production. Keep
   the domain and path exact; only the random state value needs a wildcard.
5. Run the app, choose **Continue with Google**, complete consent, and confirm
   that you return to FolioAsk and can create or reopen your own project.
   Check cancellation, sign-out, and signing back in as well.

If Google is disabled or unreachable, FolioAsk keeps email login available and
shows a configuration message. Automated tests simulate identity responses;
they do not prove that your Google consent screen and credentials are live.
See [Supabase's Google guide](https://supabase.com/docs/guides/auth/social-login/auth-google)
and [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow).
