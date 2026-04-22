# SBC Consulting — Sourcing Tool

Shared outbound-sourcing tool for SBC Consulting. Consultants upload CSVs of (first name, last name, company), the server enriches emails via Apollo Bulk People Enrichment with smart pattern learning, and consultants pull 300-row Google Sheets ready for mail merge. Delete-on-pull + dedup archive guarantees no person is ever emailed by the club twice.

## Quick start (local)

```bash
# 1. Prereqs: Node 18+, pnpm 10+, Supabase CLI. Docker NOT required.
pnpm install

# 2. Set environment variables
cp .env.example .env.local
# Fill in the values: Supabase URL/keys, Apollo, OpenRouter, Google OAuth, CRON_SECRET
# (see docs/runbook.md "Initial deploy checklist")

# 3. Push migrations (once, requires `supabase login` + `supabase link --project-ref <ref>`)
supabase db push

# 4. Run dev server on :3010
pnpm dev

# 5. Run tests
pnpm test          # unit + integration (≈67 tests)
pnpm typecheck
pnpm test:e2e      # Playwright smoke (requires dev server)
```

## Architecture

Next.js (App Router) on Vercel + Supabase (Postgres + Auth + Vault) + Apollo Bulk People Enrichment + Google Sheets/Drive + OpenRouter for small LLM tasks. See `docs/superpowers/specs/2026-04-21-sbc-consulting-sourcing-tool-design.md` for the full design doc (architecture, data model, Apollo state machine, edge cases, TL;DR).

## Where to find what

```
app/                                  # Next.js routes
  page.tsx                            # Home dispatcher (redirects by role)
  sign-in/, pending/                  # Auth gates
  auth/callback/                      # Supabase Auth OAuth return
  (consultant)/
    dashboard/                        # Upload + Get sheet
    uploads/, sheets/                 # History pages
  admin/
    page.tsx                          # Overview (KPIs + per-consultant table)
    consultants/, templates/, pool/, settings/
  api/
    uploads/, sheets/                 # Consultant-facing POSTs
    cron/enrich/, cron/cleanup/       # Vercel-Cron-triggered
    admin/consultants/[id]/*          # approve/signout/deactivate/delete/promote
    admin/templates/[id]/refresh      # Force-refresh a company's template
    admin/pool/contacts/[id]          # Manual pool-row delete
    admin/pool/archive/[key]          # Release archive entry

lib/
  apollo/
    client.ts                         # bulk_match wrapper + typed errors
    patterns.ts                       # 9-pattern detectPattern + renderTemplate
  csv/
    parse.ts, normalize.ts, map-columns.ts
  enrichment/
    process-job.ts                    # Per-company bulk_match + template lock
    tally.ts                          # Sample tally + confidence evaluator
  google/
    oauth.ts, sheets.ts               # OAuth client + createSheet/deleteSheet
  llm/
    openrouter.ts                     # Fallback chain + cache + budget
    tasks/                            # column-mapping, name-parsing, company-canon, domain-guess
  supabase/
    server.ts, service.ts, client.ts, types.ts
  auth/
    current.ts, resolve.ts            # currentConsultant, requireApprovedConsultant, requireAdmin
  uploads/
    validate-row.ts, ingest.ts        # Upload pipeline (3-stage dedup)
  companies/canon.ts                  # find-or-create with LLM canonicalization
  admin/queries.ts                    # Overview KPIs + per-consultant aggregations
  env.ts                              # Zod-validated env

supabase/migrations/                  # 14 SQL migrations (schema + RLS + RPCs)
components/                           # React components (shadcn/ui)
components/ui/                        # shadcn primitives
tests/
  unit/                               # Vitest (pure libs)
  integration/                        # Vitest (auth resolve, etc.)
  e2e/                                # Playwright
docs/
  runbook.md                          # Ops procedures (deploy, recovery, etc.)
  superpowers/specs/                  # Design doc
  superpowers/plans/                  # Implementation plan
```

## Testing strategy

- **Unit** (Vitest, `tests/unit/`): pure logic — pattern detection, normalization, CSV parsing, alias column mapping, sample tally/confidence, OpenRouter cache + fallback, Apollo client, Google sheets wrapper. ~60 tests.
- **Integration** (Vitest, `tests/integration/`): `resolveConsultantForSession` + other ~pure logic that touches Supabase via mock. ~3 tests.
- **E2E** (Playwright, `tests/e2e/`): upload → confirmation smoke test with a seeded test consultant.

Run `pnpm test` for unit+integration, `pnpm test:e2e` for E2E.

## Deployment

Follow **`docs/runbook.md`** → "Initial deploy checklist". Short version:

1. `vercel link` + `vercel env add ...` for each variable in `.env.example`
2. `vercel deploy --prod`
3. Run `pnpm exec tsx scripts/setup-admin-oauth.ts` locally once (authorizes the admin Google account to create sheets and stores the refresh token in Supabase Vault)
4. Supabase dashboard → Auth → Google provider: enable and paste client ID/secret
5. Google Cloud Console → OAuth consent screen: add consultant emails as Test users (while app stays in Testing mode)

## Scripts

- `pnpm dev` — dev server on port 3010
- `pnpm build` — production build (requires all env vars present)
- `pnpm start` — production server
- `pnpm typecheck` — tsc --noEmit
- `pnpm test` / `pnpm test:watch` — Vitest
- `pnpm test:e2e` — Playwright
- `pnpm lint` — ESLint (Next config)
- `pnpm exec tsx scripts/setup-admin-oauth.ts` — one-time admin OAuth setup

## License

Private, internal tool for SBC Consulting (UC Berkeley). Not open-sourced.
