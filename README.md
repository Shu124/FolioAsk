# FolioAsk

Ask questions across your documents and verify answers against the source.

FolioAsk is a planned document research assistant for US construction, finance,
and healthcare users. Its first release will explain, summarize, and compare
supported document content with clickable citations.

## Project status

The guided public demo is implemented. Live document processing, subscriptions,
and regulatory compliance are not yet available or verified.

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

The static demo needs no R2, Supabase, Gemini, Stripe, domain purchase, or secrets.
Integration setup will be added alongside the ticket that implements it. Do not
enable private uploads or charge customers based on this preview.
