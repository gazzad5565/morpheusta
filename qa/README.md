# Morpheus QA suite

End-to-end and API tests for the Morpheus admin console + mobile rep app.

The full plan lives in [QA_PLAN.md](./QA_PLAN.md). This README is the runbook.

## One-time setup

```bash
cd /Users/gary/Claude/qa
npm install
npx playwright install            # downloads browser binaries
cp .env.example .env              # then fill in real values
```

You'll need a **separate Supabase project for QA** (never run against prod) plus two pre-seeded users:
- A manager (admin role)
- A rep (rep role)

Both have to exist in `auth.users` with matching `profiles` rows.

## Running

```bash
# Start the apps in two terminals first
cd ../morpheus-admin && npm run dev      # http://localhost:3000
cd ../morpheus-mobile && npm run dev -- -p 3001    # http://localhost:3001

# Then in this folder
npm run test:admin       # admin Playwright
npm run test:mobile      # mobile Playwright
npm run test:e2e         # cross-app journeys
npm run test:api         # Supabase integration (Vitest)
npm run test:all         # everything
npm run report           # open HTML report
```

## Folder layout

```
qa/
├─ QA_PLAN.md                     ← read this first
├─ playwright.config.ts
├─ playwright/
│  ├─ admin/                      ← desktop tests
│  ├─ mobile/                     ← iPhone-viewport tests
│  ├─ e2e/                        ← admin + mobile in one journey
│  ├─ fixtures/                   ← auth + seed
│  └─ helpers/                    ← supabase, geolocation, time
└─ api/                           ← Vitest, runs against Supabase directly
```

## Conventions

- Every row created by tests is named `qa_<timestamp>_*` so teardown can find it.
- Use the **service-role** client only for setup/teardown — RLS assertions need anon/user clients.
- Mock geolocation via `context.setGeolocation()`. Never wait for real GPS.
- One spec file = one feature area. Don't share state across spec files.
- DB-level assertion is always the strongest signal — UI text can be stylistic, row counts can't lie.
