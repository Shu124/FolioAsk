# FolioAsk

Ask questions across your documents and verify answers against the source.

FolioAsk is a planned document research assistant for US construction, finance,
and healthcare users. Its first release will explain, summarize, and compare
supported document content with clickable citations.

## Project status

The guided demo, owned workspaces, and controlled text-PDF upload/preview are
implemented. Live AI answers, subscriptions, and regulatory compliance are not
available or verified.

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
5. From project settings, obtain the project URL and server-side legacy `service_role`
   API key. Copy `.env.example` to `.env` locally and fill `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`. Never use a `VITE_` prefix for secrets or commit them.
6. Restart `npm run dev`, visit `/app`, sign in, create a workspace, and reload.
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
