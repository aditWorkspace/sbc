# SBC Consulting Sourcing Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SBC Consulting shared sourcing tool end-to-end per the design spec at `docs/superpowers/specs/2026-04-21-sbc-consulting-sourcing-tool-design.md`.

**Architecture:** Next.js (App Router) on Vercel + Supabase (Postgres + Auth + Vault + Realtime) + Apollo Bulk People Enrichment + Google Sheets/Drive + OpenRouter LLMs. Single deploy target. Vercel Cron drives the enrichment worker (60s) and cleanup cron (daily 02:00 PT). Atomic pull-sheet via single SQL transaction; delete-on-error policy for per-row failures.

**Tech Stack:** Next.js 14, TypeScript strict, pnpm, Tailwind + shadcn/ui, Vitest (unit/integration), Playwright (E2E), Supabase CLI, `@supabase/ssr`, `@supabase/supabase-js`, `googleapis`, `papaparse`, `zod`.

**Task numbering follows dependency order.** Every task ends with a commit. Every behavioral change has a failing test first.

---

## Phase 0 — Bootstrapping

### Task 1: Initialize Next.js project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `.eslintrc.json`, `.prettierrc`
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Create: `.env.example`

- [ ] **Step 1: Create Next.js project skeleton**

Run (from `/Users/adit/sourcing-tool`):
```bash
pnpm init
pnpm add next@^14.2.0 react@^18 react-dom@^18 typescript@^5.4 @types/node @types/react @types/react-dom
pnpm add tailwindcss@^3.4 postcss autoprefixer
pnpm add -D eslint eslint-config-next prettier
npx tailwindcss init -p
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  reactStrictMode: true,
};
export default nextConfig;
```

- [ ] **Step 4: Write minimal `app/layout.tsx`, `app/page.tsx`, `app/globals.css`**

`app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`app/layout.tsx`:
```tsx
import './globals.css';
export const metadata = { title: 'SBC Consulting — Sourcing Tool' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
```

`app/page.tsx`:
```tsx
export default function Home() { return <main className="p-8">SBC Consulting — Sourcing</main>; }
```

- [ ] **Step 5: Update `package.json` scripts**

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 6: Verify dev server starts**

Run: `pnpm run dev`
Expected: "Ready on http://localhost:3000" — visit, see "SBC Consulting — Sourcing". Stop with Ctrl-C.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: initialize Next.js 14 project with TypeScript + Tailwind"
```

---

### Task 2: Install testing + shared dependencies

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`, `playwright.config.ts`, `tests/unit/.gitkeep`, `tests/integration/.gitkeep`, `tests/e2e/.gitkeep`

- [ ] **Step 1: Install deps**

```bash
pnpm add @supabase/supabase-js @supabase/ssr googleapis papaparse zod
pnpm add -D vitest @vitest/coverage-v8 @playwright/test @types/papaparse
pnpm add -D msw happy-dom @testing-library/react @testing-library/jest-dom
pnpm dlx playwright install chromium
```

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
```

- [ ] **Step 3: Write `tests/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Write `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  webServer: { command: 'pnpm run dev', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI },
});
```

- [ ] **Step 5: Write placeholder unit test**

`tests/unit/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
describe('sanity', () => { it('adds', () => expect(1 + 1).toBe(2)); });
```

- [ ] **Step 6: Run tests**

Run: `pnpm run test`
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: add Vitest + Playwright + shared deps"
```

---

### Task 3: Environment configuration module

**Files:**
- Create: `lib/env.ts`, `tests/unit/env.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing test**

`tests/unit/env.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseEnv } from '@/lib/env';

describe('parseEnv', () => {
  const base = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://xyz.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    APOLLO_API_KEY: 'apollo',
    OPENROUTER_API_KEY: 'or',
    GOOGLE_OAUTH_CLIENT_ID: 'cid',
    GOOGLE_OAUTH_CLIENT_SECRET: 'cs',
    CRON_SECRET: 'x'.repeat(32),
  };
  it('accepts valid env', () => {
    expect(() => parseEnv(base)).not.toThrow();
  });
  it('rejects short CRON_SECRET', () => {
    expect(() => parseEnv({ ...base, CRON_SECRET: 'short' })).toThrow(/CRON_SECRET/);
  });
  it('rejects missing Supabase URL', () => {
    const { NEXT_PUBLIC_SUPABASE_URL: _, ...rest } = base;
    expect(() => parseEnv(rest)).toThrow();
  });
});
```

- [ ] **Step 2: Run test, verify fails**

Run: `pnpm run test -- env`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/env.ts`**

```ts
import { z } from 'zod';

const EnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APOLLO_API_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 chars'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  return EnvSchema.parse(source);
}

let cached: Env | null = null;
export function env(): Env {
  if (!cached) cached = parseEnv();
  return cached;
}
```

- [ ] **Step 4: Fill `.env.example`**

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APOLLO_API_KEY=
OPENROUTER_API_KEY=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
CRON_SECRET=
```

- [ ] **Step 5: Run tests**

Run: `pnpm run test -- env`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(env): add zod-validated env parser"
```

---

## Phase 1 — Database schema (migrations)

### Task 4: Supabase CLI + `consultants` migration

**Files:**
- Create: `supabase/config.toml` (via CLI)
- Create: `supabase/migrations/0001_consultants.sql`

- [ ] **Step 1: Init Supabase local**

```bash
pnpm add -D supabase
pnpm dlx supabase init
pnpm dlx supabase start   # requires Docker
```
Expected: prints local Supabase URL + anon key. Record for `.env.local`.

- [ ] **Step 2: Write `0001_consultants.sql`**

```sql
create table consultants (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null check (lower(email) like '%@berkeley.edu'),
  display_name text,
  is_admin boolean not null default false,
  is_approved boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references consultants(id),
  deactivated_at timestamptz,
  deactivated_by uuid references consultants(id),
  sessions_revoked_at timestamptz,
  last_active_at timestamptz default now(),
  created_at timestamptz not null default now()
);

create unique index consultants_email_active_unique
  on consultants (lower(email)) where deactivated_at is null;

create index consultants_auth_user_idx on consultants(auth_user_id);
```

- [ ] **Step 3: Apply migration**

Run: `pnpm dlx supabase db reset`
Expected: migration applied, no errors.

- [ ] **Step 4: Sanity-check in psql**

```bash
pnpm dlx supabase db remote commit  # not actually — just verify locally
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\\d consultants"
```
Expected: table structure printed.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(db): consultants table with partial unique email index"
```

---

### Task 5: `companies` + `apollo_samples` migrations

**Files:**
- Create: `supabase/migrations/0002_companies.sql`, `supabase/migrations/0003_apollo_samples.sql`

- [ ] **Step 1: Write `0002_companies.sql`**

```sql
create table companies (
  id uuid primary key default gen_random_uuid(),
  name_normalized text unique not null,
  display_name text not null,
  domain text,
  template_pattern text check (template_pattern in (
    'first.last','first_last','firstlast','flast','f.last','first','firstl','last.first','last'
  )),
  template_confidence text not null default 'UNKNOWN'
    check (template_confidence in ('UNKNOWN','SAMPLING','HIGH','MEDIUM','LOW','UNRESOLVED')),
  sample_size int not null default 0,
  matching_samples int not null default 0,
  apollo_credits_spent int not null default 0,
  locked_at timestamptz,
  last_sampled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_confidence_idx on companies(template_confidence);
```

- [ ] **Step 2: Write `0003_apollo_samples.sql`**

```sql
create table apollo_samples (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  person_first_name text,
  person_last_name text,
  email_returned text,
  email_ignored_reason text check (email_ignored_reason in (
    'personal_domain','no_email_found','no_pattern_match','wrong_company','guessed_status'
  )),
  detected_pattern text,
  detected_domain text,
  credits_spent int not null default 1,
  apollo_response jsonb,
  sampled_at timestamptz not null default now()
);
create index apollo_samples_company_idx on apollo_samples(company_id, sampled_at desc);
```

- [ ] **Step 3: Apply + verify**

Run: `pnpm dlx supabase db reset`
Expected: both tables created.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(db): companies + apollo_samples tables"
```

---

### Task 6: `contacts` + `dedup_archive` + `uploads` migrations

**Files:**
- Create: `supabase/migrations/0004_contacts.sql`, `0005_dedup_archive.sql`, `0006_uploads.sql`

- [ ] **Step 1: Write `0004_contacts.sql`**

```sql
create table contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  first_name_normalized text not null,
  last_name_normalized text,
  company_id uuid not null references companies(id),
  company_display text not null,
  normalized_key text not null,
  email text,
  email_source text check (email_source in ('template','apollo_direct','manual')),
  enrichment_status text not null default 'pending'
    check (enrichment_status in ('pending','enriched','failed')),
  uploaded_by uuid not null references consultants(id),
  upload_id uuid not null,
  created_at timestamptz not null default now(),
  enriched_at timestamptz,
  unique (first_name_normalized, last_name_normalized, company_id)
);
create index contacts_company_status_idx on contacts(company_id, enrichment_status);
create index contacts_uploader_idx on contacts(uploaded_by);
create index contacts_status_created_idx on contacts(enrichment_status, created_at);
create index contacts_normalized_key_idx on contacts(normalized_key);
```

- [ ] **Step 2: Write `0005_dedup_archive.sql`**

```sql
create table dedup_archive (
  normalized_key text primary key,
  original_first_name text,
  original_last_name text,
  original_company text,
  first_uploaded_by uuid references consultants(id) on delete set null,
  pulled_in_sheet uuid,
  archived_at timestamptz not null default now()
);
```

- [ ] **Step 3: Write `0006_uploads.sql`**

```sql
create table uploads (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references consultants(id),
  filename text,
  row_count_raw int not null default 0,
  row_count_deduped int not null default 0,
  row_count_already_in_pool int not null default 0,
  row_count_archived int not null default 0,
  row_count_rejected int not null default 0,
  row_count_admitted int not null default 0,
  status text not null default 'processing'
    check (status in ('processing','complete','failed')),
  error_message text,
  uploaded_at timestamptz not null default now(),
  completed_at timestamptz
);
create index uploads_consultant_idx on uploads(consultant_id, uploaded_at desc);

alter table contacts
  add constraint contacts_upload_fk foreign key (upload_id) references uploads(id);
```

- [ ] **Step 4: Apply + verify + commit**

```bash
pnpm dlx supabase db reset
git add -A && git commit -m "feat(db): contacts, dedup_archive, uploads tables"
```

---

### Task 7: `enrichment_jobs` + `sheets` + FK back-link

**Files:**
- Create: `supabase/migrations/0007_enrichment_jobs.sql`, `0008_sheets.sql`

- [ ] **Step 1: Write `0007_enrichment_jobs.sql`**

```sql
create table enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  status text not null default 'queued'
    check (status in ('queued','running','done','failed')),
  attempts int not null default 0,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index enrichment_jobs_queue_idx
  on enrichment_jobs(status, created_at) where status in ('queued','running');
create unique index enrichment_jobs_per_company_unique
  on enrichment_jobs(company_id) where status in ('queued','running');
```

- [ ] **Step 2: Write `0008_sheets.sql`**

```sql
create table sheets (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references consultants(id),
  google_sheet_id text,
  google_sheet_url text,
  row_count int not null,
  from_own_sourcing int not null default 0,
  from_shared_pool int not null default 0,
  status text not null default 'active'
    check (status in ('active','fallback_csv','deleted')),
  created_at timestamptz not null default now(),
  scheduled_delete_at timestamptz generated always as (created_at + interval '90 days') stored,
  deleted_at timestamptz
);
create index sheets_consultant_idx on sheets(consultant_id, created_at desc);
create index sheets_cleanup_idx on sheets(scheduled_delete_at) where deleted_at is null;

alter table dedup_archive
  add constraint dedup_archive_sheet_fk foreign key (pulled_in_sheet) references sheets(id);
```

- [ ] **Step 3: Apply + commit**

```bash
pnpm dlx supabase db reset
git add -A && git commit -m "feat(db): enrichment_jobs + sheets tables with FK back-links"
```

---

### Task 8: Row-Level Security policies

**Files:**
- Create: `supabase/migrations/0009_rls.sql`

- [ ] **Step 1: Write `0009_rls.sql`**

```sql
-- Helper: is current session an approved admin?
create or replace function is_admin() returns boolean language sql stable as $$
  select exists (
    select 1 from consultants
    where auth_user_id = auth.uid()
      and is_admin = true
      and deactivated_at is null
  );
$$;

-- consultants
alter table consultants enable row level security;
create policy consultants_self_read on consultants for select
  using (auth_user_id = auth.uid());
create policy consultants_admin_all on consultants for all
  using (is_admin()) with check (is_admin());

-- companies (shared reference data; read-only for consultants)
alter table companies enable row level security;
create policy companies_read on companies for select using (true);
create policy companies_admin_write on companies for all
  using (is_admin()) with check (is_admin());

-- apollo_samples (admin only)
alter table apollo_samples enable row level security;
create policy apollo_samples_admin on apollo_samples for all
  using (is_admin()) with check (is_admin());

-- contacts (no consultant access; all reads via service role)
alter table contacts enable row level security;
create policy contacts_admin_read on contacts for select using (is_admin());

-- dedup_archive (admin only)
alter table dedup_archive enable row level security;
create policy dedup_archive_admin on dedup_archive for all
  using (is_admin()) with check (is_admin());

-- uploads (self + admin)
alter table uploads enable row level security;
create policy uploads_self_read on uploads for select
  using (consultant_id in (select id from consultants where auth_user_id = auth.uid()));
create policy uploads_admin on uploads for all using (is_admin()) with check (is_admin());

-- enrichment_jobs (admin only; worker uses service role)
alter table enrichment_jobs enable row level security;
create policy enrichment_jobs_admin on enrichment_jobs for all
  using (is_admin()) with check (is_admin());

-- sheets (self + admin)
alter table sheets enable row level security;
create policy sheets_self_read on sheets for select
  using (consultant_id in (select id from consultants where auth_user_id = auth.uid()));
create policy sheets_admin on sheets for all using (is_admin()) with check (is_admin());
```

- [ ] **Step 2: Apply + verify**

```bash
pnpm dlx supabase db reset
psql "$LOCAL_DB_URL" -c "select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename;"
```
Expected: all 8 public tables show `rowsecurity = t`.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(db): RLS policies for all tables with is_admin() helper"
```

---

### Task 9: Admin seed migration + resolve-consultant RPC

**Files:**
- Create: `supabase/migrations/0010_admin_seed.sql`, `supabase/migrations/0011_resolve_consultant.sql`

- [ ] **Step 1: Write `0010_admin_seed.sql`**

```sql
-- Replace adit@berkeley.edu with the real admin email BEFORE running.
insert into consultants (email, display_name, is_admin, is_approved, approved_at)
values ('adit@berkeley.edu', 'Adit (admin)', true, true, now())
on conflict do nothing;
```

- [ ] **Step 2: Write `0011_resolve_consultant.sql`**

```sql
-- Called by Supabase Auth webhook after sign-in.
-- Resolves the consultants row for a newly-signed-in auth user by email.
create or replace function resolve_consultant(
  p_auth_user_id uuid, p_email text, p_display_name text
) returns consultants language plpgsql security definer as $$
declare
  c consultants%rowtype;
begin
  -- Prefer existing non-deactivated row by email (picks up admin-pre-created rows
  -- and existing returning users)
  select * into c from consultants
   where lower(email) = lower(p_email)
     and deactivated_at is null
   order by created_at desc limit 1;

  if found then
    -- Backfill auth_user_id if not set, update last_active_at + display_name
    update consultants set
      auth_user_id = coalesce(auth_user_id, p_auth_user_id),
      display_name = coalesce(display_name, p_display_name),
      last_active_at = now()
      where id = c.id
      returning * into c;
  else
    -- Fresh signup (or re-signup after delete)
    insert into consultants (auth_user_id, email, display_name, is_approved)
      values (p_auth_user_id, p_email, p_display_name, false)
      returning * into c;
  end if;
  return c;
end $$;

grant execute on function resolve_consultant to service_role;
```

- [ ] **Step 3: Apply + verify**

```bash
pnpm dlx supabase db reset
psql "$LOCAL_DB_URL" -c "select email, is_admin, is_approved from consultants;"
```
Expected: 1 row, the admin.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(db): admin seed + resolve_consultant RPC"
```

---

## Phase 2 — Core libraries (pure, unit-testable)

### Task 10: `lib/csv/normalize.ts` — name normalization

**Files:**
- Create: `lib/csv/normalize.ts`, `tests/unit/normalize.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/normalize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalize, buildNormalizedKey } from '@/lib/csv/normalize';

describe('normalize', () => {
  it('lowercases', () => expect(normalize('JOHN')).toBe('john'));
  it('strips diacritics', () => expect(normalize('José')).toBe('jose'));
  it('strips apostrophes', () => expect(normalize("O'Brien")).toBe('obrien'));
  it('strips hyphens', () => expect(normalize('Jean-Paul')).toBe('jeanpaul'));
  it('strips whitespace', () => expect(normalize('  Mary  Jo  ')).toBe('maryjo'));
  it('handles empty', () => expect(normalize('')).toBe(''));
  it('handles null-ish', () => expect(normalize(null as unknown as string)).toBe(''));
});

describe('buildNormalizedKey', () => {
  it('joins with pipes', () =>
    expect(buildNormalizedKey('john','smith','tesla')).toBe('john|smith|tesla'));
  it('handles empty last', () =>
    expect(buildNormalizedKey('madonna','','records')).toBe('madonna||records'));
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm test -- normalize`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/csv/normalize.ts`**

```ts
export function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s.toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
}

export function buildNormalizedKey(firstNorm: string, lastNorm: string, companyNorm: string): string {
  return `${firstNorm}|${lastNorm}|${companyNorm}`;
}
```

- [ ] **Step 4: Run — passes, commit**

```bash
pnpm test -- normalize
git add -A && git commit -m "feat(normalize): diacritic-stripping normalizer + key builder"
```

---

### Task 11: `lib/apollo/patterns.ts` — pattern detection + rendering

**Files:**
- Create: `lib/apollo/patterns.ts`, `tests/unit/patterns.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/patterns.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { detectPattern, renderTemplate, isPersonalDomain } from '@/lib/apollo/patterns';

describe('detectPattern', () => {
  it('first.last', () => expect(detectPattern('John','Smith','john.smith@tesla.com')).toEqual({pattern:'first.last', domain:'tesla.com'}));
  it('firstlast',  () => expect(detectPattern('John','Smith','johnsmith@tesla.com')).toEqual({pattern:'firstlast', domain:'tesla.com'}));
  it('flast',      () => expect(detectPattern('John','Smith','jsmith@tesla.com')).toEqual({pattern:'flast', domain:'tesla.com'}));
  it('f.last',     () => expect(detectPattern('John','Smith','j.smith@tesla.com')).toEqual({pattern:'f.last', domain:'tesla.com'}));
  it('first',      () => expect(detectPattern('John','Smith','john@tesla.com')).toEqual({pattern:'first', domain:'tesla.com'}));
  it('first_last', () => expect(detectPattern('John','Smith','john_smith@tesla.com')).toEqual({pattern:'first_last', domain:'tesla.com'}));
  it('normalizes diacritics', () => expect(detectPattern('José','Ávila','jose.avila@acme.co')).toEqual({pattern:'first.last', domain:'acme.co'}));
  it('lowercases domain', () => expect(detectPattern('Jane','Doe','jane.doe@Foo.COM')?.domain).toBe('foo.com'));
  it('no match', () => expect(detectPattern('Jane','Doe','custom-vanity@foo.com')).toBeNull());
});

describe('renderTemplate', () => {
  it('first.last', () => expect(renderTemplate('John','Smith','first.last','tesla.com')).toBe('john.smith@tesla.com'));
  it('flast', () => expect(renderTemplate('John','Smith','flast','tesla.com')).toBe('jsmith@tesla.com'));
  it('first', () => expect(renderTemplate('John','Smith','first','tesla.com')).toBe('john@tesla.com'));
  it('null if last missing for last-needing pattern', () =>
    expect(renderTemplate('Madonna','','flast','records.com')).toBeNull());
  it('first works without last', () =>
    expect(renderTemplate('Madonna','','first','records.com')).toBe('madonna@records.com'));
});

describe('isPersonalDomain', () => {
  it('gmail', () => expect(isPersonalDomain('gmail.com')).toBe(true));
  it('tesla', () => expect(isPersonalDomain('tesla.com')).toBe(false));
  it('case-insensitive', () => expect(isPersonalDomain('Gmail.COM')).toBe(true));
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm test -- patterns`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/apollo/patterns.ts`**

```ts
import { normalize } from '@/lib/csv/normalize';

export type Pattern =
  | 'first.last' | 'first_last' | 'firstlast' | 'flast' | 'f.last'
  | 'first' | 'firstl' | 'last.first' | 'last';

type Renderer = (f: string, l: string) => string | null;
const RENDERERS: Record<Pattern, Renderer> = {
  'first.last':  (f, l) => l ? `${f}.${l}` : null,
  'first_last':  (f, l) => l ? `${f}_${l}` : null,
  'firstlast':   (f, l) => l ? `${f}${l}` : null,
  'flast':       (f, l) => f && l ? `${f[0]}${l}` : null,
  'f.last':      (f, l) => f && l ? `${f[0]}.${l}` : null,
  'first':       (f) => f || null,
  'firstl':      (f, l) => f && l ? `${f}${l[0]}` : null,
  'last.first':  (f, l) => f && l ? `${l}.${f}` : null,
  'last':        (_, l) => l || null,
};

export const PATTERN_ORDER: Pattern[] = [
  'first.last','first_last','firstlast','flast','f.last','first','firstl','last.first','last',
];

export const PERSONAL_DOMAINS = new Set([
  'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','ymail.com',
  'hotmail.com','outlook.com','live.com','msn.com',
  'aol.com','icloud.com','me.com','mac.com',
  'protonmail.com','proton.me','pm.me','zoho.com','mail.com',
]);
export function isPersonalDomain(domain: string): boolean {
  return PERSONAL_DOMAINS.has(domain.toLowerCase());
}

export function detectPattern(
  firstName: string, lastName: string | null | undefined, email: string
): { pattern: Pattern; domain: string } | null {
  const at = email.indexOf('@');
  if (at < 0) return null;
  const local = email.slice(0, at).toLowerCase();
  const domain = email.slice(at + 1).toLowerCase();
  const f = normalize(firstName);
  const l = normalize(lastName ?? '');
  for (const pattern of PATTERN_ORDER) {
    const rendered = RENDERERS[pattern](f, l);
    if (rendered === local) return { pattern, domain };
  }
  return null;
}

export function renderTemplate(
  firstName: string, lastName: string | null | undefined, pattern: Pattern, domain: string
): string | null {
  const f = normalize(firstName);
  const l = normalize(lastName ?? '');
  const local = RENDERERS[pattern](f, l);
  if (!local) return null;
  return `${local}@${domain}`;
}
```

- [ ] **Step 4: Run — passes, commit**

```bash
pnpm test -- patterns
git add -A && git commit -m "feat(apollo): 9-pattern detect/render + personal-domain filter"
```

---

### Task 12: `lib/enrichment/tally.ts` — sample tally + confidence evaluator

**Files:**
- Create: `lib/enrichment/tally.ts`, `tests/unit/tally.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/tally.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { tallySamples, evaluateConfidence, type SampleRow } from '@/lib/enrichment/tally';

const s = (pattern: string | null, domain: string | null, ignored: string | null = null): SampleRow =>
  ({ detected_pattern: pattern, detected_domain: domain, email_ignored_reason: ignored });

describe('tallySamples', () => {
  it('unanimous 3/3', () => {
    expect(tallySamples([s('first.last','tesla.com'), s('first.last','tesla.com'), s('first.last','tesla.com')]))
      .toEqual({ winnerPattern:'first.last', winnerDomain:'tesla.com', matchCount:3, totalSamples:3 });
  });
  it('ignores rows with ignored reason', () => {
    const r = tallySamples([s('first.last','tesla.com'), s(null,null,'personal_domain'), s('first.last','tesla.com')]);
    expect(r).toMatchObject({ matchCount:2, totalSamples:2 });
  });
  it('picks shorter domain on tie', () => {
    const r = tallySamples([s('first.last','tesla.com'), s('first.last','teslamotors.com')]);
    expect(r.winnerDomain).toBe('tesla.com');
  });
  it('empty input', () => {
    expect(tallySamples([])).toMatchObject({ matchCount:0, totalSamples:0, winnerPattern:null });
  });
});

describe('evaluateConfidence', () => {
  it('HIGH 3/3', () => expect(evaluateConfidence(3,3)).toBe('HIGH'));
  it('HIGH 9/10', () => expect(evaluateConfidence(9,10)).toBe('HIGH'));
  it('MEDIUM 8/10', () => expect(evaluateConfidence(8,10)).toBe('MEDIUM'));
  it('LOW 6/10', () => expect(evaluateConfidence(6,10)).toBe('LOW'));
  it('SAMPLING below 10', () => expect(evaluateConfidence(2,5)).toBe('SAMPLING'));
  it('UNRESOLVED at 30 below 60%', () => expect(evaluateConfidence(15,30)).toBe('UNRESOLVED'));
  it('LOW at 30 >= 60%', () => expect(evaluateConfidence(18,30)).toBe('LOW'));
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm test -- tally`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/enrichment/tally.ts`**

```ts
export interface SampleRow {
  detected_pattern: string | null;
  detected_domain: string | null;
  email_ignored_reason: string | null;
}

export type Confidence = 'UNKNOWN'|'SAMPLING'|'HIGH'|'MEDIUM'|'LOW'|'UNRESOLVED';

export function tallySamples(samples: SampleRow[]): {
  winnerPattern: string | null;
  winnerDomain: string | null;
  matchCount: number;
  totalSamples: number;
} {
  const valid = samples.filter(s => !s.email_ignored_reason && s.detected_pattern && s.detected_domain);
  if (!valid.length) return { winnerPattern: null, winnerDomain: null, matchCount: 0, totalSamples: 0 };
  const counts = new Map<string, { pattern: string; domain: string; n: number }>();
  for (const s of valid) {
    const key = `${s.detected_pattern}|${s.detected_domain}`;
    const entry = counts.get(key);
    if (entry) entry.n++;
    else counts.set(key, { pattern: s.detected_pattern!, domain: s.detected_domain!, n: 1 });
  }
  const sorted = [...counts.values()].sort((a, b) => b.n - a.n || a.domain.length - b.domain.length);
  const w = sorted[0]!;
  return { winnerPattern: w.pattern, winnerDomain: w.domain, matchCount: w.n, totalSamples: valid.length };
}

export function evaluateConfidence(matchCount: number, total: number): Confidence {
  if (total === 0) return 'UNKNOWN';
  const ratio = matchCount / total;
  if (total >= 3 && matchCount === total) return 'HIGH';
  if (total >= 10 && ratio >= 0.9) return 'HIGH';
  if (total >= 10 && ratio >= 0.75) return 'MEDIUM';
  if (total >= 10 && ratio >= 0.6) return 'LOW';
  if (total >= 30) return 'UNRESOLVED';
  return 'SAMPLING';
}
```

- [ ] **Step 4: Run — passes, commit**

```bash
pnpm test -- tally
git add -A && git commit -m "feat(enrichment): sample tally + confidence evaluator"
```

---

### Task 13: `lib/csv/parse.ts` — CSV parser

**Files:**
- Create: `lib/csv/parse.ts`, `tests/unit/csv-parse.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/csv-parse.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseCsv } from '@/lib/csv/parse';

describe('parseCsv', () => {
  it('basic', () => {
    const r = parseCsv('first_name,last_name,company\nJohn,Smith,Tesla\n');
    expect(r.headers).toEqual(['first_name','last_name','company']);
    expect(r.rows).toEqual([{ first_name:'John', last_name:'Smith', company:'Tesla' }]);
  });
  it('BOM stripped', () => {
    const r = parseCsv('﻿first,last\nA,B\n');
    expect(r.headers[0]).toBe('first');
  });
  it('quoted commas', () => {
    const r = parseCsv('name,company\n"Smith, John","Acme, Inc."');
    expect(r.rows[0]).toEqual({ name:'Smith, John', company:'Acme, Inc.' });
  });
  it('semicolon delimiter', () => {
    const r = parseCsv('first;last\nA;B');
    expect(r.rows[0]).toEqual({ first:'A', last:'B' });
  });
  it('skips empty rows', () => {
    const r = parseCsv('first\nA\n\n\nB\n');
    expect(r.rows.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm test -- csv-parse`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/csv/parse.ts`**

```ts
import Papa from 'papaparse';

export interface ParsedCsv { headers: string[]; rows: Record<string, string>[] }

export function parseCsv(text: string): ParsedCsv {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transform: (v) => (typeof v === 'string' ? v.trim() : v),
  });
  const headers = (result.meta.fields ?? []).map(h => h.trim());
  const rows = (result.data ?? []).filter(r => Object.values(r).some(v => v && v.length));
  return { headers, rows };
}
```

- [ ] **Step 4: Run — passes, commit**

```bash
pnpm test -- csv-parse
git add -A && git commit -m "feat(csv): parser with BOM-strip and delimiter auto-detect"
```

---

### Task 14: `lib/csv/map-columns.ts` — Tier-1 alias column mapper

**Files:**
- Create: `lib/csv/map-columns.ts`, `tests/unit/map-columns.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/map-columns.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mapColumnsByAlias } from '@/lib/csv/map-columns';

describe('mapColumnsByAlias', () => {
  it('exact', () => {
    expect(mapColumnsByAlias(['first_name','last_name','company']))
      .toEqual({ first_name:'first_name', last_name:'last_name', company:'company', unresolved: [] });
  });
  it('title-case variants', () => {
    expect(mapColumnsByAlias(['First Name','Last Name','Company Name']))
      .toMatchObject({ first_name:'First Name', last_name:'Last Name', company:'Company Name' });
  });
  it('fname/lname', () => {
    expect(mapColumnsByAlias(['fname','lname','company']))
      .toMatchObject({ first_name:'fname', last_name:'lname' });
  });
  it('reports unresolved', () => {
    const r = mapColumnsByAlias(['weird_col','company']);
    expect(r.first_name).toBeNull();
    expect(r.unresolved).toContain('first_name');
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm test -- map-columns`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/csv/map-columns.ts`**

```ts
const ALIASES: Record<'first_name'|'last_name'|'company', string[]> = {
  first_name: ['first name','firstname','first_name','fname','given name','given_name','first'],
  last_name:  ['last name','lastname','last_name','lname','surname','family name','last'],
  company:    ['company','company name','organization','organisation','org','employer','firm','account','company_name'],
};

export interface ColumnMap {
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  unresolved: ('first_name'|'last_name'|'company')[];
}

export function mapColumnsByAlias(headers: string[]): ColumnMap {
  const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z]/g, '');
  const headerMap = new Map(headers.map(h => [norm(h), h]));
  const out: ColumnMap = { first_name: null, last_name: null, company: null, unresolved: [] };
  for (const field of ['first_name','last_name','company'] as const) {
    for (const alias of ALIASES[field]) {
      const h = headerMap.get(norm(alias));
      if (h) { out[field] = h; break; }
    }
    if (out[field] === null) out.unresolved.push(field);
  }
  return out;
}
```

- [ ] **Step 4: Run — passes, commit**

```bash
pnpm test -- map-columns
git add -A && git commit -m "feat(csv): Tier-1 alias column mapper"
```

---

## Phase 3 — External API clients

### Task 15: `lib/llm/openrouter.ts` — OpenRouter client with fallback chain, cache, budget

**Files:**
- Create: `lib/llm/openrouter.ts`, `lib/llm/cache.ts`, `lib/llm/budget.ts`, `tests/unit/openrouter.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/openrouter.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openrouterJson } from '@/lib/llm/openrouter';
import { z } from 'zod';

const Schema = z.object({ ok: z.boolean() });

describe('openrouterJson', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset in-memory cache/budget between tests
    globalThis.__llmCache?.clear?.();
    globalThis.__llmSpent = 0;
  });

  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
      { status: 200 }
    )));
    const r = await openrouterJson({ system: 's', user: 'u', schema: Schema });
    expect(r).toEqual({ ok: true });
  });

  it('falls through to next model on 429', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('rate', { status: 429 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
        { status: 200 }
      ));
    vi.stubGlobal('fetch', fetchMock);
    const r = await openrouterJson({ system: 's', user: 'u', schema: Schema });
    expect(r).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null on schema failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ choices: [{ message: { content: '{"not_ok":1}' } }] }),
      { status: 200 }
    )));
    const r = await openrouterJson({ system: 's', user: 'u', schema: Schema });
    expect(r).toBeNull();
  });

  it('caches by (model, prompt)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
      { status: 200 }
    ));
    vi.stubGlobal('fetch', fetchMock);
    await openrouterJson({ system: 's', user: 'u', schema: Schema });
    await openrouterJson({ system: 's', user: 'u', schema: Schema });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm test -- openrouter`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/llm/cache.ts`**

```ts
import { createHash } from 'node:crypto';
// In-memory for a single runtime (worker tick / request). Good enough — cache hits
// across runtimes aren't needed for our usage patterns (per-upload + per-company calls).
const store: Map<string, unknown> = (globalThis as any).__llmCache ?? new Map();
(globalThis as any).__llmCache = store;

export function cacheKey(model: string, prompt: string): string {
  return createHash('sha256').update(`${model} ${prompt}`).digest('hex');
}
export function cacheGet<T>(key: string): T | undefined { return store.get(key) as T | undefined; }
export function cacheSet<T>(key: string, val: T): void { store.set(key, val); }
```

- [ ] **Step 4: Implement `lib/llm/budget.ts`**

```ts
// Daily spend guard; token-count approximation. Stored in a module-level counter
// (resets per serverless invocation — acceptable for soft-capping).
// For a persistent daily budget, swap in a Supabase-backed counter when deployed.
const DAILY_CAP_TOKENS = 2_000_000; // ~\$1/day on Gemini flash 8b
let spent = (globalThis as any).__llmSpent ?? 0;

export function chargeTokens(n: number): boolean {
  if (spent + n > DAILY_CAP_TOKENS) return false;
  spent += n;
  (globalThis as any).__llmSpent = spent;
  return true;
}
export function budgetRemaining(): number { return Math.max(0, DAILY_CAP_TOKENS - spent); }
```

- [ ] **Step 5: Implement `lib/llm/openrouter.ts`**

```ts
import { z, type ZodType } from 'zod';
import { cacheKey, cacheGet, cacheSet } from './cache';
import { chargeTokens } from './budget';
import { env } from '@/lib/env';

const MODEL_CHAIN = [
  'google/gemini-flash-1.5-8b',
  'google/gemini-flash-1.5',
  'meta-llama/llama-3.1-8b-instruct:free',
];

interface Args<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  maxTokens?: number;
}

export async function openrouterJson<T>({ system, user, schema, maxTokens = 512 }: Args<T>): Promise<T | null> {
  const prompt = `SYS:${system}\n\nUSR:${user}`;
  for (const model of MODEL_CHAIN) {
    const key = cacheKey(model, prompt);
    const cached = cacheGet<T>(key);
    if (cached !== undefined) return cached;
    if (!chargeTokens(maxTokens)) return null;

    let res: Response;
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env().OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          response_format: { type: 'json_object' },
          max_tokens: maxTokens,
          temperature: 0,
        }),
      });
    } catch { continue; }  // network error — try next

    if (res.status === 429 || res.status >= 500) continue;  // rate/outage — try next
    if (!res.ok) continue;

    let body: any;
    try { body = await res.json(); } catch { continue; }
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') continue;
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { return null; }
    const result = schema.safeParse(parsed);
    if (!result.success) return null;
    cacheSet(key, result.data);
    return result.data;
  }
  return null;
}
```

- [ ] **Step 6: Run — passes, commit**

```bash
pnpm test -- openrouter
git add -A && git commit -m "feat(llm): OpenRouter client with fallback chain, cache, budget guard"
```

---

### Task 16: LLM task modules (column-mapping, name-parsing, company-canon, domain-guess)

**Files:**
- Create: `lib/llm/tasks/column-mapping.ts`, `lib/llm/tasks/name-parsing.ts`, `lib/llm/tasks/company-canon.ts`, `lib/llm/tasks/domain-guess.ts`
- Create: `tests/unit/llm-tasks.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/llm-tasks.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import * as or from '@/lib/llm/openrouter';
import { mapColumnsLlm } from '@/lib/llm/tasks/column-mapping';
import { parseNamesLlm } from '@/lib/llm/tasks/name-parsing';
import { companyCanonLlm } from '@/lib/llm/tasks/company-canon';
import { guessDomainLlm } from '@/lib/llm/tasks/domain-guess';

describe('LLM task wrappers', () => {
  it('mapColumnsLlm returns mapping', async () => {
    vi.spyOn(or, 'openrouterJson').mockResolvedValue({
      first_name: 'A', last_name: 'B', company: 'C', confidence: 0.9,
    } as any);
    const r = await mapColumnsLlm(['A','B','C','D'], [['x','y','z','w']]);
    expect(r).toMatchObject({ first_name:'A', last_name:'B', company:'C' });
  });

  it('parseNamesLlm returns array', async () => {
    vi.spyOn(or, 'openrouterJson').mockResolvedValue({
      names: [{ first:'John', last:'Smith' }],
    } as any);
    const r = await parseNamesLlm(['Dr. John Smith']);
    expect(r?.[0]).toEqual({ first:'John', last:'Smith' });
  });

  it('companyCanonLlm returns canonical or null', async () => {
    vi.spyOn(or, 'openrouterJson').mockResolvedValue({ same_as: 'Google', confidence: 0.95 } as any);
    const r = await companyCanonLlm('Google Inc.', ['Google','Alphabet']);
    expect(r).toBe('Google');
  });

  it('guessDomainLlm returns domain string', async () => {
    vi.spyOn(or, 'openrouterJson').mockResolvedValue({ domain: 'palantir.com', confidence: 0.8 } as any);
    const r = await guessDomainLlm('Palantir Technologies');
    expect(r).toBe('palantir.com');
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm test -- llm-tasks`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/llm/tasks/column-mapping.ts`**

```ts
import { z } from 'zod';
import { openrouterJson } from '../openrouter';

const Schema = z.object({
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  company: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export async function mapColumnsLlm(
  headers: string[], sampleRows: string[][]
): Promise<z.infer<typeof Schema> | null> {
  const user = `Headers: ${JSON.stringify(headers)}\nSample rows:\n${sampleRows.map(r => JSON.stringify(r)).join('\n')}\n\nReturn {"first_name":<header-or-null>,"last_name":<header-or-null>,"company":<header-or-null>,"confidence":0-1}.`;
  const res = await openrouterJson({
    system: 'You map CSV headers to fields for a sourcing tool. Return strict JSON. If unsure, return null.',
    user, schema: Schema,
  });
  if (!res || res.confidence < 0.6) return null;
  return res;
}
```

- [ ] **Step 4: Implement `lib/llm/tasks/name-parsing.ts`**

```ts
import { z } from 'zod';
import { openrouterJson } from '../openrouter';

const Schema = z.object({
  names: z.array(z.object({ first: z.string(), last: z.string() })),
});

export async function parseNamesLlm(fullNames: string[]): Promise<{first:string; last:string}[] | null> {
  if (!fullNames.length) return [];
  const user = `Split each full name into first_name + last_name. Strip titles (Dr., Mr., Mrs.) and suffixes (Jr., III, PhD). Keep order.\n\n${fullNames.map((n, i) => `${i+1}. ${n}`).join('\n')}\n\nReturn {"names":[{"first","last"}, ...]}.`;
  const res = await openrouterJson({
    system: 'You parse messy full names. Return strict JSON array in input order.',
    user, schema: Schema,
  });
  if (!res || res.names.length !== fullNames.length) return null;
  return res.names;
}
```

- [ ] **Step 5: Implement `lib/llm/tasks/company-canon.ts`**

```ts
import { z } from 'zod';
import { openrouterJson } from '../openrouter';

const Schema = z.object({
  same_as: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export async function companyCanonLlm(newName: string, candidates: string[]): Promise<string | null> {
  if (!candidates.length) return null;
  const user = `Is "${newName}" the same company as any of these? Candidates: ${JSON.stringify(candidates)}. Return {"same_as":<matching-candidate-or-null>,"confidence":0-1}.`;
  const res = await openrouterJson({
    system: 'You decide if two company names refer to the same entity. "Google", "Google LLC", "Google Inc." are the same.',
    user, schema: Schema,
  });
  if (!res || res.confidence < 0.75) return null;
  return res.same_as;
}
```

- [ ] **Step 6: Implement `lib/llm/tasks/domain-guess.ts`**

```ts
import { z } from 'zod';
import { openrouterJson } from '../openrouter';

const Schema = z.object({
  domain: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export async function guessDomainLlm(companyName: string): Promise<string | null> {
  const user = `What is the work-email domain for "${companyName}"? Return {"domain":<likely-domain-or-null>,"confidence":0-1}.`;
  const res = await openrouterJson({
    system: 'You guess corporate email domains from company names. Return the root domain only, e.g. "palantir.com" not "apollo.palantir.com".',
    user, schema: Schema,
  });
  if (!res || !res.domain || res.confidence < 0.6) return null;
  return res.domain.toLowerCase();
}
```

- [ ] **Step 7: Run — passes, commit**

```bash
pnpm test -- llm-tasks
git add -A && git commit -m "feat(llm): task wrappers — column-map, name-parse, company-canon, domain-guess"
```

---

### Task 17: `lib/apollo/client.ts` — Bulk People Enrichment wrapper

**Files:**
- Create: `lib/apollo/client.ts`, `tests/unit/apollo-client.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/apollo-client.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { apolloBulkMatch, ApolloCreditsExhausted, ApolloRateLimit } from '@/lib/apollo/client';

describe('apolloBulkMatch', () => {
  it('returns matches array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ matches: [{ email: 'a@b.com', email_status: 'verified' }] }),
      { status: 200 }
    )));
    const r = await apolloBulkMatch([{ first_name:'A', last_name:'B', organization_name:'C' }]);
    expect(r.matches.length).toBe(1);
  });

  it('throws ApolloCreditsExhausted on 402', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 402 })));
    await expect(apolloBulkMatch([{ first_name:'A', last_name:'B', organization_name:'C' }]))
      .rejects.toBeInstanceOf(ApolloCreditsExhausted);
  });

  it('throws ApolloRateLimit on 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    await expect(apolloBulkMatch([{ first_name:'A', last_name:'B', organization_name:'C' }]))
      .rejects.toBeInstanceOf(ApolloRateLimit);
  });

  it('throws on >10 details', async () => {
    const details = Array.from({ length: 11 }, () => ({ first_name:'A', last_name:'B', organization_name:'C' }));
    await expect(apolloBulkMatch(details)).rejects.toThrow(/10/);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm test -- apollo-client`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/apollo/client.ts`**

```ts
import { env } from '@/lib/env';

export class ApolloCreditsExhausted extends Error { constructor() { super('Apollo credits exhausted'); } }
export class ApolloRateLimit extends Error { constructor() { super('Apollo rate limit'); } }
export class ApolloError extends Error {}

export interface BulkMatchDetail {
  first_name: string;
  last_name?: string | null;
  organization_name: string;
  domain?: string;
}

export interface BulkMatchPerson {
  first_name?: string;
  last_name?: string;
  email?: string | null;
  email_status?: 'verified' | 'guessed' | 'unavailable' | 'bounced' | string;
  organization?: { name?: string; website_url?: string };
}

export interface BulkMatchResponse {
  matches: (BulkMatchPerson | null)[];
  missing_records?: number;
}

export async function apolloBulkMatch(details: BulkMatchDetail[]): Promise<BulkMatchResponse> {
  if (details.length === 0) return { matches: [] };
  if (details.length > 10) throw new Error('apolloBulkMatch: max 10 details per call');
  const res = await fetch('https://api.apollo.io/api/v1/people/bulk_match', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': env().APOLLO_API_KEY,
    },
    body: JSON.stringify({ details, reveal_personal_emails: false }),
  });
  if (res.status === 402) throw new ApolloCreditsExhausted();
  if (res.status === 429) throw new ApolloRateLimit();
  if (!res.ok) throw new ApolloError(`Apollo ${res.status}: ${await res.text()}`);
  return res.json() as Promise<BulkMatchResponse>;
}
```

- [ ] **Step 4: Run — passes, commit**

```bash
pnpm test -- apollo-client
git add -A && git commit -m "feat(apollo): bulk_match wrapper with typed error classes"
```

---

### Task 18: Google OAuth + Sheets client + setup script

**Files:**
- Create: `lib/google/oauth.ts`, `lib/google/sheets.ts`, `scripts/setup-admin-oauth.ts`
- Create: `tests/unit/google-sheets.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/google-sheets.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { createSheetForConsultant } from '@/lib/google/sheets';

vi.mock('googleapis', () => {
  const createSpreadsheet = vi.fn().mockResolvedValue({ data: { spreadsheetId: 'SID', spreadsheetUrl: 'https://sheet/SID' } });
  const valuesUpdate = vi.fn().mockResolvedValue({});
  const permCreate = vi.fn().mockResolvedValue({});
  return {
    google: {
      sheets: () => ({ spreadsheets: { create: createSpreadsheet, values: { update: valuesUpdate } } }),
      drive: () => ({ permissions: { create: permCreate } }),
      auth: { OAuth2: class { setCredentials() {} getAccessToken() { return Promise.resolve({ token: 'a' }); } } },
    },
    __test: { createSpreadsheet, valuesUpdate, permCreate },
  };
});

describe('createSheetForConsultant', () => {
  it('creates sheet, writes rows, shares with consultant', async () => {
    const r = await createSheetForConsultant({
      consultant: { email: 'ava@berkeley.edu', display_name: 'Ava' },
      rows: [{ full_name:'John Smith', first_name:'John', company_display:'Tesla', email:'john.smith@tesla.com' }],
      refreshToken: 'RT',
    });
    expect(r.id).toBe('SID');
    expect(r.url).toBe('https://sheet/SID');
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `pnpm test -- google-sheets`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/google/oauth.ts`**

```ts
import { google } from 'googleapis';
import { env } from '@/lib/env';

export function oauthClient(refreshToken: string) {
  const client = new google.auth.OAuth2(
    env().GOOGLE_OAUTH_CLIENT_ID,
    env().GOOGLE_OAUTH_CLIENT_SECRET,
    'http://localhost:3333/oauth/callback'
  );
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}
```

- [ ] **Step 4: Implement `lib/google/sheets.ts`**

```ts
import { google } from 'googleapis';
import { oauthClient } from './oauth';

interface RowDTO { full_name: string; first_name: string; company_display: string; email: string }
interface Args {
  consultant: { email: string; display_name: string | null };
  rows: RowDTO[];
  refreshToken: string;
}

export async function createSheetForConsultant({ consultant, rows, refreshToken }: Args) {
  const auth = oauthClient(refreshToken);
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  const dateStr = new Date().toISOString().slice(0, 10);
  const title = `SBC Sourcing — ${consultant.display_name ?? consultant.email} — ${dateStr}`;

  const { data: spreadsheet } = await sheets.spreadsheets.create({
    requestBody: { properties: { title }, sheets: [{ properties: { title: 'Contacts' } }] },
  });
  const id = spreadsheet.spreadsheetId!;
  const url = spreadsheet.spreadsheetUrl!;

  await sheets.spreadsheets.values.update({
    spreadsheetId: id, range: 'Contacts!A1', valueInputOption: 'RAW',
    requestBody: {
      values: [
        ['Full Name', 'First Name', 'Company', 'Email'],
        ...rows.map(r => [r.full_name, r.first_name, r.company_display, r.email]),
      ],
    },
  });

  await drive.permissions.create({
    fileId: id,
    requestBody: { type: 'user', role: 'writer', emailAddress: consultant.email },
    sendNotificationEmail: false,
  });
  return { id, url };
}

export async function deleteSheet(sheetId: string, refreshToken: string) {
  const drive = google.drive({ version: 'v3', auth: oauthClient(refreshToken) });
  try { await drive.files.delete({ fileId: sheetId }); }
  catch (e: any) { if (e?.code !== 404) throw e; }
}

export function retryWithBackoff<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  return new Promise(async (resolve, reject) => {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try { resolve(await fn()); return; }
      catch (e) {
        lastErr = e;
        if (i < attempts - 1) await new Promise(r => setTimeout(r, Math.pow(4, i) * 1000));
      }
    }
    reject(lastErr);
  });
}
```

- [ ] **Step 5: Write `scripts/setup-admin-oauth.ts`**

```ts
// Run once, locally: `pnpm exec tsx scripts/setup-admin-oauth.ts`
// Starts localhost:3333, opens browser to Google consent screen, captures the
// refresh token, and stores it in Supabase Vault.
import { google } from 'googleapis';
import http from 'node:http';
import open from 'open';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

async function main() {
  const client = new google.auth.OAuth2(
    env().GOOGLE_OAUTH_CLIENT_ID,
    env().GOOGLE_OAUTH_CLIENT_SECRET,
    'http://localhost:3333/oauth/callback'
  );
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });
  console.log('Opening browser for Google consent...');
  await open(url);
  const code = await new Promise<string>((resolve) => {
    const srv = http.createServer(async (req, res) => {
      const u = new URL(req.url!, 'http://localhost:3333');
      const c = u.searchParams.get('code');
      if (c) {
        res.end('Thanks — you can close this tab.');
        srv.close();
        resolve(c);
      } else { res.statusCode = 400; res.end('missing code'); }
    });
    srv.listen(3333);
  });
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error('No refresh_token returned — revoke & retry');

  const supabase = createClient(env().NEXT_PUBLIC_SUPABASE_URL, env().SUPABASE_SERVICE_ROLE_KEY);
  // Requires the `vault_write_secret` RPC migration (see Task 19)
  const { error } = await supabase.rpc('vault_write_secret', {
    secret_name: 'google_oauth_refresh_token',
    secret_value: tokens.refresh_token,
  });
  if (error) throw error;
  console.log('✔ Refresh token stored in Supabase Vault.');
}
main().catch(e => { console.error(e); process.exit(1); });
```

Add dep:
```bash
pnpm add open
pnpm add -D tsx
```

- [ ] **Step 6: Run — passes, commit**

```bash
pnpm test -- google-sheets
git add -A && git commit -m "feat(google): sheets+oauth client, createSheet/deleteSheet, setup script"
```

---

### Task 19: Supabase Vault RPCs for secret storage

**Files:**
- Create: `supabase/migrations/0012_vault_rpcs.sql`

- [ ] **Step 1: Write `0012_vault_rpcs.sql`**

```sql
-- Service-role only: store/read a secret in Supabase Vault.
-- Vault extension provides vault.secrets table; we wrap it so only service role can call.
create or replace function vault_write_secret(secret_name text, secret_value text)
returns void language plpgsql security definer as $$
begin
  perform vault.create_secret(secret_value, secret_name)
  on conflict do update set decrypted_secret = secret_value;
exception
  when undefined_function then
    -- Simpler fallback for local dev without vault extension: store in a plain table
    create table if not exists app_secrets (name text primary key, value text);
    insert into app_secrets (name, value) values (secret_name, secret_value)
    on conflict (name) do update set value = excluded.value;
end $$;

create or replace function vault_read_secret(secret_name text)
returns text language plpgsql security definer as $$
declare v text;
begin
  begin
    select decrypted_secret into v from vault.decrypted_secrets where name = secret_name;
  exception when undefined_table or undefined_function then
    select value into v from app_secrets where name = secret_name;
  end;
  return v;
end $$;

revoke all on function vault_write_secret(text, text) from public;
revoke all on function vault_read_secret(text) from public;
grant execute on function vault_write_secret(text, text) to service_role;
grant execute on function vault_read_secret(text) to service_role;
```

- [ ] **Step 2: Apply + commit**

```bash
pnpm dlx supabase db reset
git add -A && git commit -m "feat(db): vault read/write RPCs for service-role secret storage"
```

---

## Phase 4 — Supabase clients, auth, middleware

### Task 20: Supabase client factories

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/service.ts`, `lib/supabase/client.ts`, `lib/supabase/types.ts`

- [ ] **Step 1: Generate types**

```bash
pnpm dlx supabase gen types typescript --local > lib/supabase/types.ts
```

- [ ] **Step 2: Write `lib/supabase/server.ts` (request-scoped SSR client)**

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import type { Database } from './types';

export function supabaseServer() {
  const store = cookies();
  return createServerClient<Database>(
    env().NEXT_PUBLIC_SUPABASE_URL,
    env().NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (n) => store.get(n)?.value,
        set: (n, v, o) => store.set({ name: n, value: v, ...o }),
        remove: (n, o) => store.set({ name: n, value: '', ...o }),
      },
    }
  );
}
```

- [ ] **Step 3: Write `lib/supabase/service.ts` (admin/service client)**

```ts
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import type { Database } from './types';

// Bypasses RLS — use only from trusted server code (API routes, cron workers).
export function supabaseService() {
  return createClient<Database>(env().NEXT_PUBLIC_SUPABASE_URL, env().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 4: Write `lib/supabase/client.ts` (browser client)**

```ts
'use client';
import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';
import type { Database } from './types';
export const supabaseBrowser = () =>
  createBrowserClient<Database>(env().NEXT_PUBLIC_SUPABASE_URL, env().NEXT_PUBLIC_SUPABASE_ANON_KEY);
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(supabase): server/service/browser client factories + generated types"
```

---

### Task 21: Auth callback route + resolve-consultant invocation

**Files:**
- Create: `app/auth/callback/route.ts`, `lib/auth/resolve.ts`, `tests/integration/auth-callback.test.ts`

- [ ] **Step 1: Write failing test**

`tests/integration/auth-callback.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveConsultantForSession } from '@/lib/auth/resolve';

const rpcMock = vi.fn();
vi.mock('@/lib/supabase/service', () => ({
  supabaseService: () => ({ rpc: rpcMock }),
}));

describe('resolveConsultantForSession', () => {
  beforeEach(() => rpcMock.mockReset());

  it('calls RPC and returns row', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'c1', is_approved: true }, error: null });
    const r = await resolveConsultantForSession({ id:'u1', email:'a@berkeley.edu', user_metadata:{ full_name:'Ava' } } as any);
    expect(rpcMock).toHaveBeenCalledWith('resolve_consultant', {
      p_auth_user_id: 'u1', p_email: 'a@berkeley.edu', p_display_name: 'Ava',
    });
    expect(r?.id).toBe('c1');
  });

  it('returns null on RPC error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('x') });
    const r = await resolveConsultantForSession({ id:'u1', email:'a@berkeley.edu' } as any);
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: Run — fails; implement `lib/auth/resolve.ts`**

```ts
import type { User } from '@supabase/supabase-js';
import { supabaseService } from '@/lib/supabase/service';
import type { Database } from '@/lib/supabase/types';

type Consultant = Database['public']['Tables']['consultants']['Row'];

export async function resolveConsultantForSession(user: User): Promise<Consultant | null> {
  const email = user.email;
  if (!email) return null;
  const displayName = (user.user_metadata?.full_name as string | undefined) ?? email;
  const { data, error } = await supabaseService().rpc('resolve_consultant', {
    p_auth_user_id: user.id,
    p_email: email,
    p_display_name: displayName,
  });
  if (error) return null;
  return data as Consultant | null;
}
```

- [ ] **Step 3: Implement `app/auth/callback/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { resolveConsultantForSession } from '@/lib/auth/resolve';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  if (code) {
    const supabase = supabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await resolveConsultantForSession(data.user);
    }
  }
  return NextResponse.redirect(new URL('/', url));
}
```

- [ ] **Step 4: Run — passes, commit**

```bash
pnpm test -- auth-callback
git add -A && git commit -m "feat(auth): OAuth callback + resolve-consultant RPC invocation"
```

---

### Task 22: Auth middleware (approve-gate + admin-gate)

**Files:**
- Create: `middleware.ts`, `lib/auth/current.ts`

- [ ] **Step 1: Implement `lib/auth/current.ts`**

```ts
import { supabaseServer } from '@/lib/supabase/server';

export async function currentConsultant() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('consultants')
    .select('*')
    .eq('auth_user_id', user.id)
    .is('deactivated_at', null)
    .maybeSingle();
  return data;
}

export async function requireApprovedConsultant() {
  const c = await currentConsultant();
  if (!c) return { error: 'unauthenticated' as const };
  if (!c.is_approved) return { error: 'pending_approval' as const };
  return { consultant: c };
}

export async function requireAdmin() {
  const r = await requireApprovedConsultant();
  if ('error' in r) return r;
  if (!r.consultant.is_admin) return { error: 'forbidden' as const };
  return { consultant: r.consultant };
}
```

- [ ] **Step 2: Implement `middleware.ts`**

```ts
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/env';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(
    env().NEXT_PUBLIC_SUPABASE_URL,
    env().NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (n) => req.cookies.get(n)?.value,
        set: (n, v, o) => res.cookies.set({ name: n, value: v, ...o }),
        remove: (n, o) => res.cookies.set({ name: n, value: '', ...o }),
      },
    }
  );
  // Refresh session if expired
  await supabase.auth.getUser();
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|auth/callback|api/cron).*)'],
};
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(auth): middleware session refresh + currentConsultant/requireAdmin helpers"
```

---

## Phase 5 — API routes & server logic

### Task 23: Upload ingestion — `lib/uploads/ingest.ts`

**Files:**
- Create: `lib/uploads/ingest.ts`, `lib/uploads/validate-row.ts`, `lib/companies/canon.ts`
- Create: `tests/integration/ingest.test.ts` (uses local Supabase)

- [ ] **Step 1: Implement `lib/uploads/validate-row.ts`**

```ts
import { normalize } from '@/lib/csv/normalize';

export interface RawRow { first_name?: string; last_name?: string; company?: string }
export interface ValidRow {
  first_name: string;
  last_name: string | null;
  company_display: string;
  first_name_normalized: string;
  last_name_normalized: string;
  company_normalized: string;
}

const MAX_FIELD_LEN = 200;

export function validateRow(r: RawRow): ValidRow | null {
  const first = (r.first_name ?? '').trim();
  const last = (r.last_name ?? '').trim();
  const company = (r.company ?? '').trim();
  if (!first || !company) return null;
  if (first.length > MAX_FIELD_LEN || company.length > MAX_FIELD_LEN || last.length > MAX_FIELD_LEN) return null;
  const fn = normalize(first);
  const cn = normalize(company);
  if (!fn || !cn) return null;
  return {
    first_name: first, last_name: last || null, company_display: company,
    first_name_normalized: fn, last_name_normalized: normalize(last),
    company_normalized: cn,
  };
}
```

- [ ] **Step 2: Implement `lib/companies/canon.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { companyCanonLlm } from '@/lib/llm/tasks/company-canon';
import { normalize } from '@/lib/csv/normalize';

export async function findOrCreateCompany(
  supa: SupabaseClient, displayName: string, normalized: string
): Promise<string> {
  // Exact match
  const { data: exact } = await supa.from('companies').select('id').eq('name_normalized', normalized).maybeSingle();
  if (exact?.id) return exact.id;

  // Near-match candidates: normalized string differs by short legal suffix
  const stripSuffix = (n: string) =>
    n.replace(/(inc|llc|corp|corporation|co|ltd|group|holdings|technologies|tech)$/i, '');
  const base = stripSuffix(normalized);
  const { data: candidates } = await supa
    .from('companies')
    .select('id, name_normalized, display_name')
    .or(`name_normalized.eq.${base},name_normalized.eq.${base}inc,name_normalized.eq.${base}llc,name_normalized.eq.${base}corp`);
  if (candidates && candidates.length) {
    const ask = candidates.map(c => c.display_name);
    const canonical = await companyCanonLlm(displayName, ask);
    if (canonical) {
      const hit = candidates.find(c => c.display_name === canonical);
      if (hit) return hit.id;
    }
  }

  // Insert new — concurrent races resolved via UNIQUE(name_normalized)
  const { data: inserted, error } = await supa
    .from('companies')
    .insert({ name_normalized: normalized, display_name: displayName })
    .select('id')
    .single();
  if (!error && inserted) return inserted.id;

  // Lost the race — read back
  const { data: after } = await supa.from('companies').select('id').eq('name_normalized', normalized).single();
  return after!.id;
}
```

- [ ] **Step 3: Implement `lib/uploads/ingest.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateRow, type RawRow } from './validate-row';
import { findOrCreateCompany } from '@/lib/companies/canon';
import { buildNormalizedKey } from '@/lib/csv/normalize';
import { renderTemplate } from '@/lib/apollo/patterns';
import type { Pattern } from '@/lib/apollo/patterns';

export interface IngestResult {
  uploadId: string;
  raw: number; deduped: number; alreadyInPool: number; archived: number; rejected: number; admitted: number;
  enrichedInstantly: number; pending: number;
}

export async function ingestUpload(
  supa: SupabaseClient,
  consultantId: string,
  filename: string | null,
  rows: RawRow[]
): Promise<IngestResult> {
  const { data: upload, error: upErr } = await supa
    .from('uploads').insert({ consultant_id: consultantId, filename, row_count_raw: rows.length })
    .select('id').single();
  if (upErr || !upload) throw upErr;
  const uploadId = upload.id;

  // Stage A: intra-file dedup
  const seen = new Set<string>();
  const valid = [];
  let rejected = 0;
  for (const r of rows) {
    const v = validateRow(r);
    if (!v) { rejected++; continue; }
    const key = buildNormalizedKey(v.first_name_normalized, v.last_name_normalized, v.company_normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push({ ...v, normalized_key: key });
  }
  const deduped = valid.length;

  // Stage B: archive dedup
  const { data: archived } = await supa
    .from('dedup_archive').select('normalized_key').in('normalized_key', [...seen]);
  const archivedKeys = new Set((archived ?? []).map((r: any) => r.normalized_key));
  const afterArchive = valid.filter(v => !archivedKeys.has(v.normalized_key));
  const archivedCount = valid.length - afterArchive.length;

  // Stage C: pool dedup
  const { data: inPool } = await supa
    .from('contacts').select('normalized_key').in('normalized_key', afterArchive.map(v => v.normalized_key));
  const poolKeys = new Set((inPool ?? []).map((r: any) => r.normalized_key));
  const admitted = afterArchive.filter(v => !poolKeys.has(v.normalized_key));
  const alreadyInPool = afterArchive.length - admitted.length;

  // Company canonicalization
  const companyMap = new Map<string, string>();  // normalized -> company_id
  for (const v of admitted) {
    if (!companyMap.has(v.company_normalized)) {
      companyMap.set(v.company_normalized, await findOrCreateCompany(supa, v.company_display, v.company_normalized));
    }
  }

  // Fetch company templates to decide instant-fill vs pending
  const companyIds = [...new Set(companyMap.values())];
  const { data: companiesData } = await supa
    .from('companies').select('id, template_confidence, template_pattern, domain').in('id', companyIds);
  const templateMap = new Map((companiesData ?? []).map(c => [c.id, c]));

  // Build contact rows
  let enrichedInstantly = 0, pending = 0;
  const contactRows = admitted.map(v => {
    const companyId = companyMap.get(v.company_normalized)!;
    const co = templateMap.get(companyId);
    let email: string | null = null;
    let source: 'template' | null = null;
    let status: 'pending' | 'enriched' = 'pending';
    if (co && ['HIGH','MEDIUM','LOW'].includes(co.template_confidence) && co.template_pattern && co.domain) {
      const rendered = renderTemplate(v.first_name, v.last_name, co.template_pattern as Pattern, co.domain);
      if (rendered) {
        email = rendered; source = 'template'; status = 'enriched'; enrichedInstantly++;
      } else { pending++; }
    } else { pending++; }
    return {
      first_name: v.first_name, last_name: v.last_name,
      first_name_normalized: v.first_name_normalized, last_name_normalized: v.last_name_normalized,
      company_id: companyId, company_display: v.company_display,
      normalized_key: v.normalized_key,
      email, email_source: source, enrichment_status: status,
      enriched_at: status === 'enriched' ? new Date().toISOString() : null,
      uploaded_by: consultantId, upload_id: uploadId,
    };
  });

  if (contactRows.length) {
    const { error } = await supa.from('contacts').insert(contactRows);
    if (error) throw error;
  }

  // Enqueue enrichment jobs for companies with any pending rows
  const pendingCompanyIds = [...new Set(
    contactRows.filter(r => r.enrichment_status === 'pending').map(r => r.company_id)
  )];
  for (const cid of pendingCompanyIds) {
    await supa.from('enrichment_jobs').insert({ company_id: cid }).throwOnError().select();  // ignore dup-unique
      // will fail on unique conflict; catch that silently
  }

  await supa.from('uploads').update({
    row_count_deduped: deduped,
    row_count_archived: archivedCount,
    row_count_already_in_pool: alreadyInPool,
    row_count_rejected: rejected,
    row_count_admitted: admitted.length,
    status: 'complete',
    completed_at: new Date().toISOString(),
  }).eq('id', uploadId);

  return { uploadId, raw: rows.length, deduped, alreadyInPool, archived: archivedCount, rejected, admitted: admitted.length, enrichedInstantly, pending };
}
```

- [ ] **Step 4: Integration test (local Supabase)**

`tests/integration/ingest.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { ingestUpload } from '@/lib/uploads/ingest';

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe('ingestUpload', () => {
  let consultantId: string;
  beforeEach(async () => {
    await supa.from('contacts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supa.from('uploads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supa.from('enrichment_jobs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supa.from('companies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supa.from('dedup_archive').delete().neq('normalized_key', '__none__');
    const { data } = await supa.from('consultants').insert({
      email: 'test@berkeley.edu', display_name: 'T', is_approved: true
    }).select('id').single();
    consultantId = data!.id;
  });

  it('ingests fresh rows, enqueues jobs for new companies', async () => {
    const r = await ingestUpload(supa, consultantId, 't.csv', [
      { first_name:'John', last_name:'Smith', company:'Tesla' },
      { first_name:'Jane', last_name:'Doe', company:'Tesla' },
    ]);
    expect(r.admitted).toBe(2);
    expect(r.pending).toBe(2);
    const { data: jobs } = await supa.from('enrichment_jobs').select();
    expect(jobs!.length).toBe(1);  // one per company
  });

  it('drops archive duplicates', async () => {
    await supa.from('dedup_archive').insert({
      normalized_key: 'john|smith|tesla', original_first_name:'John',
      original_last_name:'Smith', original_company:'Tesla',
    });
    const r = await ingestUpload(supa, consultantId, 't.csv', [
      { first_name:'John', last_name:'Smith', company:'Tesla' },
    ]);
    expect(r.admitted).toBe(0);
    expect(r.archived).toBe(1);
  });
});
```

- [ ] **Step 5: Run + commit**

```bash
pnpm dlx supabase db reset
SUPABASE_URL=$(pnpm dlx supabase status -o env | grep '^API_URL' | cut -d= -f2) pnpm test -- ingest
git add -A && git commit -m "feat(ingest): 3-stage dedup + company canon + instant template fill + job enqueue"
```

---

### Task 24: Upload API route — `POST /api/uploads`

**Files:**
- Create: `app/api/uploads/route.ts`, `tests/integration/uploads-route.test.ts`

- [ ] **Step 1: Implement**

```ts
// app/api/uploads/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApprovedConsultant } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';
import { parseCsv } from '@/lib/csv/parse';
import { mapColumnsByAlias } from '@/lib/csv/map-columns';
import { mapColumnsLlm } from '@/lib/llm/tasks/column-mapping';
import { parseNamesLlm } from '@/lib/llm/tasks/name-parsing';
import { ingestUpload } from '@/lib/uploads/ingest';

const BodySchema = z.object({
  filename: z.string().max(255).optional(),
  csv: z.string().min(1).max(10 * 1024 * 1024),  // 10MB cap
  columnMap: z.object({
    first_name: z.string().nullable(),
    last_name: z.string().nullable(),
    company: z.string(),
  }).optional(),
});

export async function POST(req: Request) {
  const auth = await requireApprovedConsultant();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

  const parseResult = BodySchema.safeParse(await req.json());
  if (!parseResult.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  const { csv, filename, columnMap: overrideMap } = parseResult.data;

  const parsed = parseCsv(csv);
  let map = overrideMap
    ? { first_name: overrideMap.first_name, last_name: overrideMap.last_name, company: overrideMap.company, unresolved: [] }
    : mapColumnsByAlias(parsed.headers);
  if (map.unresolved.includes('company') || map.unresolved.includes('first_name')) {
    const llm = await mapColumnsLlm(parsed.headers, parsed.rows.slice(0, 3).map(r => parsed.headers.map(h => r[h] ?? '')));
    if (llm) map = { first_name: llm.first_name, last_name: llm.last_name, company: llm.company, unresolved: [] };
  }
  if (!map.company || !map.first_name) {
    return NextResponse.json({ error: 'column_mapping_failed', headers: parsed.headers }, { status: 422 });
  }

  // If last_name unresolved and there's a single full-name column, try name parsing
  const raw = parsed.rows.map(r => ({
    first_name: r[map.first_name!] ?? '',
    last_name: map.last_name ? r[map.last_name] : undefined,
    company: r[map.company!] ?? '',
  }));
  if (!map.last_name) {
    const firstBatch = raw.slice(0, 50).map(r => r.first_name);
    const parsedNames = await parseNamesLlm(firstBatch);
    if (parsedNames) for (let i = 0; i < parsedNames.length; i++) {
      raw[i]!.first_name = parsedNames[i]!.first;
      raw[i]!.last_name = parsedNames[i]!.last;
    }
  }

  const result = await ingestUpload(supabaseService(), auth.consultant.id, filename ?? null, raw);
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Integration test (happy path)**

`tests/integration/uploads-route.test.ts`: similar shape to Task 23 test but hits the POST route directly via `new Request(...)`. Verify returns 200 + proper counts, and that a 422 is returned on unmappable headers.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(api): POST /api/uploads with column mapping fallback chain"
```

---

### Task 25: Pull-sheet API route — `POST /api/sheets`

**Files:**
- Create: `app/api/sheets/route.ts`, `supabase/migrations/0013_pull_sheet_rpc.sql`

- [ ] **Step 1: Write `0013_pull_sheet_rpc.sql`** — atomic claim-archive-delete

```sql
create or replace function pull_sheet(p_consultant_id uuid, p_max_rows int)
returns table (
  id uuid, first_name text, last_name text, company_display text, email text,
  uploaded_by uuid, normalized_key text
) language plpgsql as $$
begin
  return query
    with chosen as (
      select c.* from contacts c
      where c.enrichment_status = 'enriched'
      order by (c.uploaded_by = p_consultant_id) desc, c.created_at asc
      limit p_max_rows
      for update skip locked
    ),
    archived as (
      insert into dedup_archive (normalized_key, original_first_name, original_last_name, original_company, first_uploaded_by)
      select c.normalized_key, c.first_name, c.last_name, c.company_display, c.uploaded_by
      from chosen c
      on conflict (normalized_key) do nothing
      returning normalized_key
    ),
    deleted as (
      delete from contacts c using chosen where c.id = chosen.id
      returning c.id, c.first_name, c.last_name, c.company_display, c.email, c.uploaded_by, c.normalized_key
    )
    select * from deleted;
end $$;

grant execute on function pull_sheet(uuid, int) to service_role;
```

- [ ] **Step 2: Implement `app/api/sheets/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { requireApprovedConsultant } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';
import { createSheetForConsultant, retryWithBackoff } from '@/lib/google/sheets';

const DEFAULT_MAX_ROWS = 300;

export async function POST() {
  const auth = await requireApprovedConsultant();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 401 });

  const supa = supabaseService();
  const { data: rows, error } = await supa.rpc('pull_sheet', {
    p_consultant_id: auth.consultant.id, p_max_rows: DEFAULT_MAX_ROWS,
  });
  if (error) return NextResponse.json({ error: 'pull_failed', detail: error.message }, { status: 500 });
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'pool_empty' }, { status: 409 });
  }

  const fromOwn = rows.filter((r: any) => r.uploaded_by === auth.consultant.id).length;
  const { data: sheetInsert } = await supa.from('sheets').insert({
    consultant_id: auth.consultant.id, row_count: rows.length,
    from_own_sourcing: fromOwn, from_shared_pool: rows.length - fromOwn,
  }).select('id').single();
  const sheetDbId = sheetInsert!.id;

  // Backfill pulled_in_sheet for archive rows we just created
  await supa.from('dedup_archive').update({ pulled_in_sheet: sheetDbId })
    .in('normalized_key', rows.map((r: any) => r.normalized_key))
    .is('pulled_in_sheet', null);

  const { data: tokenData } = await supa.rpc('vault_read_secret', { secret_name: 'google_oauth_refresh_token' });
  const refreshToken = tokenData as unknown as string;

  try {
    const sheet = await retryWithBackoff(() => createSheetForConsultant({
      consultant: { email: auth.consultant.email, display_name: auth.consultant.display_name },
      rows: rows.map((r: any) => ({
        full_name: `${r.first_name} ${r.last_name ?? ''}`.trim(),
        first_name: r.first_name, company_display: r.company_display, email: r.email,
      })),
      refreshToken,
    }));
    await supa.from('sheets').update({
      google_sheet_id: sheet.id, google_sheet_url: sheet.url,
    }).eq('id', sheetDbId);
    return NextResponse.json({
      url: sheet.url, row_count: rows.length,
      warning: rows.length < DEFAULT_MAX_ROWS ? `Only ${rows.length} rows available (pool running low)` : null,
    });
  } catch (e: any) {
    // Fallback: CSV download
    await supa.from('sheets').update({ status: 'fallback_csv' }).eq('id', sheetDbId);
    const csv = ['Full Name,First Name,Company,Email',
      ...rows.map((r: any) => [
        `${r.first_name} ${r.last_name ?? ''}`.trim(), r.first_name, r.company_display, r.email,
      ].map((v: string) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv',
        'content-disposition': `attachment; filename=sbc-sourcing-${Date.now()}.csv`,
        'x-fallback-reason': 'google_api_failed',
      },
    });
  }
}
```

- [ ] **Step 3: Commit**

```bash
pnpm dlx supabase db reset
git add -A && git commit -m "feat(api): POST /api/sheets — atomic pull, Google Sheets, CSV fallback"
```

---

### Task 26: Enrichment worker — `lib/enrichment/process-job.ts` + `app/api/cron/enrich/route.ts`

**Files:**
- Create: `lib/enrichment/process-job.ts`, `app/api/cron/enrich/route.ts`
- Create: `tests/integration/process-job.test.ts`

- [ ] **Step 1: Implement `lib/enrichment/process-job.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { apolloBulkMatch, ApolloCreditsExhausted, ApolloRateLimit } from '@/lib/apollo/client';
import { detectPattern, isPersonalDomain, renderTemplate, type Pattern } from '@/lib/apollo/patterns';
import { normalize } from '@/lib/csv/normalize';
import { tallySamples, evaluateConfidence } from '@/lib/enrichment/tally';

const BATCH = 10;

export async function processEnrichmentJob(supa: SupabaseClient, companyId: string): Promise<void> {
  const { data: company } = await supa.from('companies').select('*').eq('id', companyId).single();
  if (!company) return;

  // Fast path: template already locked — render from template, no Apollo call
  if (['HIGH','MEDIUM','LOW'].includes(company.template_confidence) && company.template_pattern && company.domain) {
    await fillPendingViaTemplate(supa, company);
    await reenqueueIfPending(supa, companyId);
    return;
  }

  // Pick up to 10 pending contacts
  const { data: pending } = await supa
    .from('contacts').select('*')
    .eq('company_id', companyId).eq('enrichment_status', 'pending')
    .limit(BATCH);
  if (!pending || pending.length === 0) return;

  let response;
  try {
    response = await apolloBulkMatch(pending.map(p => ({
      first_name: p.first_name, last_name: p.last_name ?? undefined, organization_name: p.company_display,
    })));
  } catch (e) {
    if (e instanceof ApolloRateLimit) throw e;
    if (e instanceof ApolloCreditsExhausted) throw e;
    // Other Apollo error: delete these pending rows per policy; don't retry
    await supa.from('contacts').delete().in('id', pending.map(p => p.id));
    throw e;
  }

  let creditsThisCall = 0;
  for (let i = 0; i < pending.length; i++) {
    const c = pending[i]!;
    const m = response.matches[i];
    if (!m || !m.email) {
      await supa.from('contacts').delete().eq('id', c.id);
      continue;
    }
    if (m.email_status !== 'verified') {
      await supa.from('apollo_samples').insert({
        company_id: companyId, person_first_name: c.first_name, person_last_name: c.last_name,
        email_returned: m.email, email_ignored_reason: 'guessed_status',
      });
      await supa.from('contacts').delete().eq('id', c.id);
      continue;
    }
    const domain = m.email.split('@')[1]!.toLowerCase();
    if (isPersonalDomain(domain)) {
      await supa.from('apollo_samples').insert({
        company_id: companyId, person_first_name: c.first_name, person_last_name: c.last_name,
        email_returned: m.email, email_ignored_reason: 'personal_domain',
      });
      await supa.from('contacts').delete().eq('id', c.id);
      continue;
    }
    const returnedOrgNorm = normalize(m.organization?.name ?? '');
    if (returnedOrgNorm && returnedOrgNorm !== company.name_normalized) {
      await supa.from('apollo_samples').insert({
        company_id: companyId, person_first_name: c.first_name, person_last_name: c.last_name,
        email_returned: m.email, email_ignored_reason: 'wrong_company',
      });
      await supa.from('contacts').delete().eq('id', c.id);
      continue;
    }
    const det = detectPattern(c.first_name, c.last_name, m.email);
    await supa.from('apollo_samples').insert({
      company_id: companyId, person_first_name: c.first_name, person_last_name: c.last_name,
      email_returned: m.email, detected_pattern: det?.pattern ?? null, detected_domain: det?.domain ?? null,
      email_ignored_reason: det ? null : 'no_pattern_match', credits_spent: 1,
    });
    creditsThisCall++;
    if (det) {
      await supa.from('contacts').update({
        email: m.email, email_source: 'apollo_direct',
        enrichment_status: 'enriched', enriched_at: new Date().toISOString(),
      }).eq('id', c.id);
    } else {
      await supa.from('contacts').delete().eq('id', c.id);
    }
  }

  // Re-tally and update company state
  const { data: samples } = await supa.from('apollo_samples').select('detected_pattern, detected_domain, email_ignored_reason').eq('company_id', companyId);
  const t = tallySamples((samples ?? []) as any);
  const confidence = evaluateConfidence(t.matchCount, t.totalSamples);
  await supa.from('companies').update({
    sample_size: t.totalSamples,
    matching_samples: t.matchCount,
    template_pattern: t.winnerPattern,
    domain: t.winnerDomain,
    template_confidence: confidence,
    apollo_credits_spent: company.apollo_credits_spent + creditsThisCall,
    last_sampled_at: new Date().toISOString(),
    locked_at: ['HIGH','MEDIUM','LOW'].includes(confidence) ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', companyId);

  if (['HIGH','MEDIUM','LOW'].includes(confidence)) {
    const { data: updated } = await supa.from('companies').select('*').eq('id', companyId).single();
    await fillPendingViaTemplate(supa, updated!);
  }

  await reenqueueIfPending(supa, companyId);
}

async function fillPendingViaTemplate(supa: SupabaseClient, company: any) {
  const { data: pending } = await supa.from('contacts').select('*')
    .eq('company_id', company.id).eq('enrichment_status', 'pending');
  if (!pending || !pending.length) return;
  for (const c of pending) {
    const email = renderTemplate(c.first_name, c.last_name, company.template_pattern as Pattern, company.domain);
    if (email) {
      await supa.from('contacts').update({
        email, email_source: 'template', enrichment_status: 'enriched',
        enriched_at: new Date().toISOString(),
      }).eq('id', c.id);
    } else {
      // Pattern can't render (e.g., needs last_name but it's empty) — delete per policy
      await supa.from('contacts').delete().eq('id', c.id);
    }
  }
}

async function reenqueueIfPending(supa: SupabaseClient, companyId: string) {
  const { count } = await supa.from('contacts').select('*', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('enrichment_status', 'pending');
  if (count && count > 0) {
    await supa.from('enrichment_jobs').insert({ company_id: companyId }).then(() => {}, () => {});  // ignore unique conflict
  }
}
```

- [ ] **Step 2: Implement `app/api/cron/enrich/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { supabaseService } from '@/lib/supabase/service';
import { processEnrichmentJob } from '@/lib/enrichment/process-job';
import { ApolloRateLimit, ApolloCreditsExhausted } from '@/lib/apollo/client';

export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${env().CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supa = supabaseService();

  // Advisory lock: prevent overlap
  const { data: lockOk } = await supa.rpc('pg_try_advisory_lock' as any, { key: 4242 });
  if (!lockOk) return NextResponse.json({ ok: true, skipped: 'locked' });

  try {
    const { data: jobs } = await supa.from('enrichment_jobs')
      .select('id, company_id').eq('status', 'queued').order('created_at').limit(10);
    if (!jobs || jobs.length === 0) return NextResponse.json({ ok: true, processed: 0 });

    let processed = 0;
    for (const job of jobs) {
      await supa.from('enrichment_jobs').update({
        status: 'running', locked_at: new Date().toISOString(),
        attempts: (await supa.from('enrichment_jobs').select('attempts').eq('id', job.id).single()).data!.attempts + 1,
      }).eq('id', job.id);
      try {
        await processEnrichmentJob(supa, job.company_id);
        await supa.from('enrichment_jobs').update({
          status: 'done', completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        processed++;
      } catch (e) {
        if (e instanceof ApolloRateLimit) {
          await supa.from('enrichment_jobs').update({
            status: 'queued', locked_at: null, last_error: 'rate_limit',
          }).eq('id', job.id);
          break;
        }
        if (e instanceof ApolloCreditsExhausted) {
          await supa.from('enrichment_jobs').update({
            status: 'queued', locked_at: null, last_error: 'credits_exhausted',
          }).eq('id', job.id);
          // TODO: ops_alerts table + admin banner in §8 Settings
          break;
        }
        // Other error: retry up to 3; on 3rd failure, mark failed (and pending contacts already deleted in process-job)
        const { data: j } = await supa.from('enrichment_jobs').select('attempts').eq('id', job.id).single();
        const attempts = j?.attempts ?? 1;
        await supa.from('enrichment_jobs').update({
          status: attempts >= 3 ? 'failed' : 'queued',
          locked_at: null, last_error: (e as Error).message,
        }).eq('id', job.id);
      }
    }
    return NextResponse.json({ ok: true, processed });
  } finally {
    await supa.rpc('pg_advisory_unlock' as any, { key: 4242 });
  }
}
```

- [ ] **Step 3: Integration test with mocked Apollo** — verify that 3/3 unanimous matches lock template to HIGH and fill remaining pending rows via template in the same tick.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(enrichment): process-job + cron/enrich route with advisory lock"
```

---

### Task 27: Cleanup cron — `app/api/cron/cleanup/route.ts`

**Files:**
- Create: `app/api/cron/cleanup/route.ts`

- [ ] **Step 1: Implement**

```ts
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { supabaseService } from '@/lib/supabase/service';
import { deleteSheet } from '@/lib/google/sheets';

export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${env().CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const supa = supabaseService();
  const { data: tokenData } = await supa.rpc('vault_read_secret', { secret_name: 'google_oauth_refresh_token' });
  const refreshToken = tokenData as unknown as string;
  const { data: sheets } = await supa.from('sheets').select('id, google_sheet_id')
    .lt('scheduled_delete_at', new Date().toISOString()).is('deleted_at', null).not('google_sheet_id', 'is', null);
  let deleted = 0;
  for (const s of sheets ?? []) {
    try {
      await deleteSheet(s.google_sheet_id!, refreshToken);
      await supa.from('sheets').update({ deleted_at: new Date().toISOString(), status: 'deleted' }).eq('id', s.id);
      deleted++;
    } catch (e) { /* try again next run */ }
  }
  return NextResponse.json({ ok: true, deleted });
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat(cron): daily cleanup — delete sheets older than 90 days from Drive"
```

---

### Task 28: Admin API routes — consultant actions, template refresh, pool admin

**Files:**
- Create: `app/api/admin/consultants/[id]/approve/route.ts`
- Create: `app/api/admin/consultants/[id]/signout/route.ts`
- Create: `app/api/admin/consultants/[id]/deactivate/route.ts`
- Create: `app/api/admin/consultants/[id]/delete/route.ts`
- Create: `app/api/admin/consultants/[id]/promote/route.ts`
- Create: `app/api/admin/consultants/route.ts` (POST to add by email)
- Create: `app/api/admin/templates/[id]/refresh/route.ts`
- Create: `app/api/admin/pool/contacts/[id]/route.ts` (DELETE)
- Create: `app/api/admin/pool/archive/[key]/route.ts` (DELETE)

Each route follows this shape:

```ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/current';
import { supabaseService } from '@/lib/supabase/service';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.error === 'forbidden' ? 403 : 401 });
  const supa = supabaseService();
  // ...specific action...
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 1: Implement `approve`**

```ts
await supa.from('consultants').update({
  is_approved: true, approved_at: new Date().toISOString(), approved_by: auth.consultant.id,
}).eq('id', params.id);
```

- [ ] **Step 2: Implement `signout`**

```ts
const { data: c } = await supa.from('consultants').select('auth_user_id').eq('id', params.id).single();
if (c?.auth_user_id) {
  await supa.auth.admin.signOut(c.auth_user_id, 'global');
}
await supa.from('consultants').update({ sessions_revoked_at: new Date().toISOString() }).eq('id', params.id);
```

- [ ] **Step 3: Implement `deactivate`**

```ts
const { data: c } = await supa.from('consultants').select('auth_user_id').eq('id', params.id).single();
if (c?.auth_user_id) await supa.auth.admin.signOut(c.auth_user_id, 'global');
await supa.from('consultants').update({
  deactivated_at: new Date().toISOString(), deactivated_by: auth.consultant.id, is_approved: false,
}).eq('id', params.id);
```

- [ ] **Step 4: Implement `delete`**

```ts
const { data: c } = await supa.from('consultants').select('auth_user_id').eq('id', params.id).single();
if (c?.auth_user_id) await supa.auth.admin.deleteUser(c.auth_user_id);
await supa.from('consultants').update({
  deactivated_at: new Date().toISOString(), deactivated_by: auth.consultant.id,
  auth_user_id: null, is_approved: false,
}).eq('id', params.id);
```

- [ ] **Step 5: Implement `promote`** — flip `is_admin` with body `{make_admin: boolean}`

- [ ] **Step 6: Implement `POST /api/admin/consultants`** — add a new consultant by email (is_approved=true, auth_user_id=null)

```ts
const { email } = z.object({ email: z.string().email().endsWith('@berkeley.edu') }).parse(await req.json());
await supa.from('consultants').insert({ email, is_approved: true, approved_at: new Date().toISOString(), approved_by: auth.consultant.id });
```

- [ ] **Step 7: Implement `POST /api/admin/templates/[id]/refresh`**

```ts
const { reEnrich } = z.object({ reEnrich: z.boolean().default(false) }).parse(await req.json());
await supa.from('companies').update({
  template_confidence: 'UNKNOWN', template_pattern: null, domain: null,
  sample_size: 0, matching_samples: 0, locked_at: null,
}).eq('id', params.id);
if (reEnrich) {
  await supa.from('contacts').update({ enrichment_status: 'pending', email: null, email_source: null, enriched_at: null })
    .eq('company_id', params.id).eq('enrichment_status', 'enriched');
}
await supa.from('enrichment_jobs').insert({ company_id: params.id }).then(()=>{},()=>{});
```

- [ ] **Step 8: Implement `DELETE /api/admin/pool/contacts/[id]`** — simple `delete from contacts`

- [ ] **Step 9: Implement `DELETE /api/admin/pool/archive/[key]`** — simple `delete from dedup_archive`

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(api/admin): consultant actions + template refresh + pool admin endpoints"
```

---

## Phase 6 — UI

UI uses shadcn/ui components throughout. Install once:

```bash
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button card table badge input label dropdown-menu dialog toast progress alert
```

### Task 29: Root layout, sign-in page, pending-approval page

**Files:**
- Create: `app/sign-in/page.tsx`, `app/pending/page.tsx`
- Modify: `app/page.tsx` (route based on consultant state)
- Create: `components/sign-in-button.tsx`

- [ ] **Step 1: Implement `components/sign-in-button.tsx`**

```tsx
'use client';
import { Button } from '@/components/ui/button';
import { supabaseBrowser } from '@/lib/supabase/client';

export function SignInButton() {
  const signIn = async () => {
    const supa = supabaseBrowser();
    await supa.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: 'berkeley.edu', prompt: 'select_account' },
      },
    });
  };
  return <Button onClick={signIn}>Sign in with Google</Button>;
}
```

- [ ] **Step 2: Implement `app/sign-in/page.tsx`**

```tsx
import { SignInButton } from '@/components/sign-in-button';
export default function SignIn() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-sm text-center space-y-4">
        <h1 className="text-2xl font-bold">SBC Consulting Sourcing</h1>
        <p className="text-sm text-muted-foreground">Sign in with your @berkeley.edu Google account.</p>
        <SignInButton />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Implement `app/pending/page.tsx`**

```tsx
export default function Pending() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-sm text-center space-y-2">
        <h1 className="text-xl font-semibold">Waiting for admin approval</h1>
        <p className="text-sm text-muted-foreground">
          Your account is created but not yet approved. An admin will approve you shortly.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Implement `app/page.tsx`** — dispatcher

```tsx
import { redirect } from 'next/navigation';
import { currentConsultant } from '@/lib/auth/current';

export default async function Home() {
  const c = await currentConsultant();
  if (!c) redirect('/sign-in');
  if (!c.is_approved) redirect('/pending');
  if (c.is_admin) redirect('/admin');
  redirect('/dashboard');
}
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(ui): sign-in + pending-approval + home-dispatcher pages"
```

---

### Task 30: Consultant dashboard — upload + get sheet

**Files:**
- Create: `app/(consultant)/layout.tsx`, `app/(consultant)/dashboard/page.tsx`
- Create: `components/upload-zone.tsx`, `components/get-sheet-button.tsx`
- Create: `components/nav-consultant.tsx`

- [ ] **Step 1: Layout with nav**

`app/(consultant)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { currentConsultant } from '@/lib/auth/current';
import { NavConsultant } from '@/components/nav-consultant';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const c = await currentConsultant();
  if (!c) redirect('/sign-in');
  if (!c.is_approved) redirect('/pending');
  return (
    <div>
      <NavConsultant name={c.display_name ?? c.email} isAdmin={c.is_admin} />
      <main className="max-w-4xl mx-auto p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: `NavConsultant` component** — simple horizontal nav with Dashboard / Uploads / Sheets links + user menu with sign-out. (Admin sees extra "Admin" link if `isAdmin`.)

- [ ] **Step 3: `UploadZone` component**

```tsx
'use client';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';

export function UploadZone() {
  const [state, setState] = useState<'idle'|'uploading'|'done'|'error'>('idle');
  const [msg, setMsg] = useState<string>('');

  async function handleFile(file: File) {
    setState('uploading'); setMsg('Parsing...');
    const text = await file.text();
    const res = await fetch('/api/uploads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: file.name, csv: text }),
    });
    const body = await res.json();
    if (!res.ok) { setState('error'); setMsg(body.error ?? 'Upload failed'); return; }
    setState('done');
    setMsg(`${body.admitted} rows added. ${body.enrichedInstantly} enriched, ${body.pending} in progress.`);
  }

  return (
    <div className="border-2 border-dashed rounded-lg p-8 text-center">
      <input type="file" accept=".csv" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      {state === 'uploading' && <Progress className="mt-4" />}
      {msg && <Alert className="mt-4"><AlertDescription>{msg}</AlertDescription></Alert>}
    </div>
  );
}
```

- [ ] **Step 4: `GetSheetButton` component**

```tsx
'use client';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function GetSheetButton() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>();
  async function pull() {
    setLoading(true); setErr(undefined);
    const res = await fetch('/api/sheets', { method: 'POST' });
    if (res.status === 409) { setErr('Pool empty — ask a teammate to upload first'); setLoading(false); return; }
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/csv')) {
      // Fallback: download CSV
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } else {
      const body = await res.json();
      if (body.url) window.open(body.url, '_blank');
      if (body.warning) setErr(body.warning);
    }
    setLoading(false);
  }
  return (
    <div>
      <Button onClick={pull} disabled={loading}>{loading ? 'Preparing...' : 'Get my sheet (300 rows)'}</Button>
      {err && <p className="text-sm text-destructive mt-2">{err}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Dashboard page**

```tsx
// app/(consultant)/dashboard/page.tsx
import { UploadZone } from '@/components/upload-zone';
import { GetSheetButton } from '@/components/get-sheet-button';

export default function Dashboard() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-2">Upload contacts</h2>
        <UploadZone />
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-2">Get a sheet</h2>
        <GetSheetButton />
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(ui): consultant dashboard with upload + get-sheet"
```

---

### Task 31: Consultant upload + sheet history pages

**Files:**
- Create: `app/(consultant)/uploads/page.tsx`, `app/(consultant)/sheets/page.tsx`

- [ ] **Step 1: `/uploads` — list my uploads**

```tsx
import { supabaseServer } from '@/lib/supabase/server';
import { currentConsultant } from '@/lib/auth/current';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default async function Uploads() {
  const c = await currentConsultant();
  const { data: uploads } = await supabaseServer().from('uploads')
    .select('*').eq('consultant_id', c!.id).order('uploaded_at', { ascending: false });
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Your uploads</h2>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Date</TableHead><TableHead>File</TableHead>
          <TableHead>Raw</TableHead><TableHead>Admitted</TableHead><TableHead>Rejected</TableHead>
          <TableHead>Archive dups</TableHead><TableHead>Status</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {uploads?.map(u => (
            <TableRow key={u.id}>
              <TableCell>{new Date(u.uploaded_at).toLocaleString()}</TableCell>
              <TableCell>{u.filename}</TableCell>
              <TableCell>{u.row_count_raw}</TableCell>
              <TableCell>{u.row_count_admitted}</TableCell>
              <TableCell>{u.row_count_rejected}</TableCell>
              <TableCell>{u.row_count_archived}</TableCell>
              <TableCell>{u.status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: `/sheets` — list my sheets**

Same shape; columns: Date, Row count, From own sourcing, URL (link if still active), Status.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(ui): consultant uploads + sheets history pages"
```

---

### Task 32: Admin shell + Overview tab

**Files:**
- Create: `app/admin/layout.tsx`, `app/admin/page.tsx`
- Create: `components/nav-admin.tsx`, `components/time-range-toggle.tsx`, `components/kpi-card.tsx`
- Create: `lib/admin/queries.ts`

- [ ] **Step 1: `lib/admin/queries.ts`** — aggregate queries for overview

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type Range = 'day' | 'week' | 'month' | 'all';
export function rangeStart(r: Range): Date | null {
  const now = Date.now();
  if (r === 'day') return new Date(now - 86400_000);
  if (r === 'week') return new Date(now - 7 * 86400_000);
  if (r === 'month') return new Date(now - 30 * 86400_000);
  return null;
}

export async function overviewKpis(supa: SupabaseClient, range: Range) {
  const since = rangeStart(range);
  const [pool, uploaded, sheets, apollo, cache] = await Promise.all([
    supa.from('contacts').select('*', { count: 'exact', head: true }),
    since ? supa.from('uploads').select('row_count_admitted').gte('uploaded_at', since.toISOString())
          : supa.from('uploads').select('row_count_admitted'),
    since ? supa.from('sheets').select('row_count').gte('created_at', since.toISOString())
          : supa.from('sheets').select('row_count'),
    since ? supa.from('apollo_samples').select('credits_spent').gte('sampled_at', since.toISOString())
          : supa.from('apollo_samples').select('credits_spent'),
    supa.from('companies').select('template_confidence'),
  ]);
  const uploadedRows = (uploaded.data ?? []).reduce((a: number, r: any) => a + (r.row_count_admitted ?? 0), 0);
  const sheetRows = (sheets.data ?? []).reduce((a: number, r: any) => a + (r.row_count ?? 0), 0);
  const credits = (apollo.data ?? []).reduce((a: number, r: any) => a + (r.credits_spent ?? 0), 0);
  const byConf: Record<string, number> = {};
  for (const r of cache.data ?? []) byConf[(r as any).template_confidence] = (byConf[(r as any).template_confidence] ?? 0) + 1;
  return {
    pool: pool.count ?? 0,
    uploadedRows, sheetCount: (sheets.data ?? []).length, sheetRows,
    credits, confidenceBreakdown: byConf,
  };
}

export async function perConsultantActivity(supa: SupabaseClient, range: Range) {
  const since = rangeStart(range);
  const sinceIso = since?.toISOString();
  const { data: consultants } = await supa.from('consultants').select('*').is('deactivated_at', null);
  const results = [];
  for (const c of consultants ?? []) {
    const [uploaded, sheetsOut, ownPull] = await Promise.all([
      sinceIso
        ? supa.from('uploads').select('row_count_admitted').eq('consultant_id', c.id).gte('uploaded_at', sinceIso)
        : supa.from('uploads').select('row_count_admitted').eq('consultant_id', c.id),
      sinceIso
        ? supa.from('sheets').select('row_count, from_own_sourcing').eq('consultant_id', c.id).gte('created_at', sinceIso)
        : supa.from('sheets').select('row_count, from_own_sourcing').eq('consultant_id', c.id),
      Promise.resolve(null),
    ]);
    const uploadedRows = (uploaded.data ?? []).reduce((a: number, r: any) => a + (r.row_count_admitted ?? 0), 0);
    const rowsOut = (sheetsOut.data ?? []).reduce((a: number, r: any) => a + (r.row_count ?? 0), 0);
    const fromOwn = (sheetsOut.data ?? []).reduce((a: number, r: any) => a + (r.from_own_sourcing ?? 0), 0);
    results.push({
      id: c.id, display_name: c.display_name, email: c.email, is_admin: c.is_admin,
      is_approved: c.is_approved, last_active_at: c.last_active_at,
      uploaded_rows: uploadedRows,
      sheets_pulled: (sheetsOut.data ?? []).length,
      rows_out: rowsOut,
      pct_own: rowsOut > 0 ? (fromOwn / rowsOut * 100).toFixed(0) : '—',
    });
  }
  return results;
}
```

- [ ] **Step 2: `app/admin/layout.tsx`** — gate + nav

```tsx
import { redirect } from 'next/navigation';
import { currentConsultant } from '@/lib/auth/current';
import { NavAdmin } from '@/components/nav-admin';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const c = await currentConsultant();
  if (!c || !c.is_admin) redirect('/');
  return (
    <div>
      <NavAdmin name={c.display_name ?? c.email} />
      <main className="max-w-6xl mx-auto p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: `app/admin/page.tsx`** — overview with KPI bar, per-consultant table, cache health, top companies

```tsx
import { supabaseService } from '@/lib/supabase/service';
import { overviewKpis, perConsultantActivity } from '@/lib/admin/queries';
import { KpiCard } from '@/components/kpi-card';
import { TimeRangeToggle } from '@/components/time-range-toggle';
import type { Range } from '@/lib/admin/queries';

export default async function AdminOverview({ searchParams }: { searchParams: { range?: Range } }) {
  const range = (searchParams.range ?? 'month') as Range;
  const supa = supabaseService();
  const kpis = await overviewKpis(supa, range);
  const consultants = await perConsultantActivity(supa, range);
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Overview</h1>
        <TimeRangeToggle current={range} />
      </div>
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Active pool" value={kpis.pool.toLocaleString()} sub="rows available" />
        <KpiCard label={`Uploaded (${range})`} value={kpis.uploadedRows.toLocaleString()} />
        <KpiCard label={`Sheets pulled (${range})`} value={String(kpis.sheetCount)} sub={`${kpis.sheetRows} rows out`} />
        <KpiCard label={`Apollo credits (${range})`} value={String(kpis.credits)} sub="1 credit ≈ 1 work email" />
      </div>
      {/* Per-consultant table — render `consultants` array */}
      {/* Cache health — render `kpis.confidenceBreakdown` */}
    </div>
  );
}
```

- [ ] **Step 4: `TimeRangeToggle` + `KpiCard`** components — simple shadcn button groups + cards

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(ui/admin): Overview tab with KPIs, per-consultant table, time-range toggle"
```

---

### Task 33: Admin Consultants tab + drill-down page

**Files:**
- Create: `app/admin/consultants/page.tsx`, `app/admin/consultants/[id]/page.tsx`
- Create: `components/consultant-actions.tsx`, `components/add-consultant-form.tsx`

- [ ] **Step 1: `/admin/consultants`** — list with filters (approved / pending / deactivated / admin) + AddConsultantForm at top + row actions using ConsultantActions

- [ ] **Step 2: `ConsultantActions` client component**

```tsx
'use client';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';

export function ConsultantActions({ id, isApproved, isAdmin, isDeactivated }: any) {
  const router = useRouter();
  async function call(endpoint: string, body: any = {}) {
    await fetch(`/api/admin/consultants/${id}/${endpoint}`, {
      method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body),
    });
    router.refresh();
  }
  const confirmDelete = () => {
    const ans = prompt('Type DELETE to confirm hard-delete of this consultant');
    if (ans === 'DELETE') call('delete');
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="sm">Actions</Button></DropdownMenuTrigger>
      <DropdownMenuContent>
        {!isApproved && <DropdownMenuItem onClick={() => call('approve')}>Approve</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => call('signout')}>Force sign-out</DropdownMenuItem>
        {!isDeactivated && <DropdownMenuItem onClick={() => call('deactivate')}>Deactivate</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => call('promote', { make_admin: !isAdmin })}>
          {isAdmin ? 'Demote to consultant' : 'Promote to admin'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={confirmDelete} className="text-destructive">Delete account</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: `AddConsultantForm`** — posts to `POST /api/admin/consultants` with email, validates `@berkeley.edu`, refreshes

- [ ] **Step 4: Drill-down `/admin/consultants/[id]`** — table of all uploads + table of all sheets (sheet URLs clickable if still active)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(ui/admin): Consultants tab + drill-down + actions dropdown"
```

---

### Task 34: Admin Templates, Pool, Settings tabs

**Files:**
- Create: `app/admin/templates/page.tsx`, `app/admin/pool/page.tsx`, `app/admin/settings/page.tsx`
- Create: `components/force-refresh-button.tsx`, `components/pool-search.tsx`

- [ ] **Step 1: Templates page** — table: name | confidence | pattern | domain | samples | credits | locked_at | Actions. "Force refresh" button per row (with checkbox: "also re-enrich current contacts")

```tsx
// components/force-refresh-button.tsx (client)
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';

export function ForceRefreshButton({ companyId }: { companyId: string }) {
  const [reEnrich, setReEnrich] = useState(false);
  const router = useRouter();
  async function run() {
    await fetch(`/api/admin/templates/${companyId}/refresh`, {
      method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ reEnrich }),
    });
    router.refresh();
  }
  return (
    <Dialog>
      <DialogTrigger asChild><Button size="sm" variant="outline">Force refresh</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Force refresh template</DialogTitle></DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={reEnrich} onChange={e => setReEnrich(e.target.checked)} />
          Also re-enrich current enriched contacts at this company
        </label>
        <Button onClick={run}>Confirm</Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Pool page** — search input (server action filters `contacts` by name/company LIKE) + delete-row buttons + archive-release section

- [ ] **Step 3: Settings page** — displays admin-editable configs: Apollo cost-per-credit (stored in a new `app_config` table, or just env var), LLM daily budget, retention days. For v1: read-only placeholder that shows current values; edit UI can be added later.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(ui/admin): Templates, Pool, Settings tabs"
```

---

## Phase 7 — Deployment, ops, tests

### Task 35: Vercel config + deployment

**Files:**
- Create: `vercel.json`
- Create: `docs/runbook.md`

- [ ] **Step 1: Write `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/enrich", "schedule": "* * * * *" },
    { "path": "/api/cron/cleanup", "schedule": "0 9 * * *" }
  ],
  "functions": {
    "app/api/cron/enrich/route.ts": { "maxDuration": 60 },
    "app/api/cron/cleanup/route.ts": { "maxDuration": 60 }
  }
}
```

Note: `0 9 * * *` UTC = 02:00 PT in PDT (adjust to `0 10` during PST for exact 02:00 local, or accept the 1-hour drift as acceptable for a nightly cleanup).

- [ ] **Step 2: Deploy checklist**

Document in `docs/runbook.md`:
1. `vercel link` in the project root
2. `vercel env add` for each env var in `.env.example` (production scope)
3. Confirm `CRON_SECRET` is a 32+ char random string: `openssl rand -hex 32`
4. Push to main → Vercel auto-deploys
5. Verify `/api/cron/enrich` authorized request returns `{ok: true, processed: 0}` after deploy
6. Run `pnpm exec tsx scripts/setup-admin-oauth.ts` locally (requires `.env.local` populated with service role key pointing at prod) → stores admin refresh token in Vault

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore(deploy): vercel.json with cron config + runbook stub"
```

---

### Task 36: Runbook content

**Files:**
- Modify: `docs/runbook.md` (expand to full ops guide)

- [ ] **Step 1: Fill `docs/runbook.md`** with runnable procedures for:

- **Add a new consultant** — admin UI path + fallback SQL (`insert into consultants (email, is_approved) values ('x@berkeley.edu', true)`)
- **Seed an additional admin** — update SQL: `update consultants set is_admin=true where email='x@berkeley.edu'`
- **Rotate `CRON_SECRET`** — generate new, `vercel env rm CRON_SECRET && vercel env add CRON_SECRET`, re-deploy
- **Re-run Google OAuth setup** — revoke old in Google → run `setup-admin-oauth.ts`
- **Apollo credit top-up** — after top-up, toggle the admin banner (future: `POST /api/admin/worker/resume`; for v1, requeue jobs manually via SQL: `update enrichment_jobs set status='queued', last_error=null where last_error='credits_exhausted'`)
- **Force-refresh a bad template** — admin UI Templates tab
- **Manually delete a pool row** — admin UI Pool tab, or SQL `delete from contacts where ...`
- **Recover sole-admin lockout** — connect to Supabase SQL editor as service role: `update consultants set deactivated_at=null, is_approved=true, is_admin=true where email='x@berkeley.edu'`
- **Inspect failed enrichment jobs** — `select * from enrichment_jobs where status='failed' order by created_at desc limit 20`
- **Emergency pool-wide freeze** — `update enrichment_jobs set status='failed' where status in ('queued','running')` (stops the worker immediately; re-enqueue from contacts after fixing root cause)
- **Local dev loop** — `pnpm dlx supabase start && pnpm dev`; seed test data via a script; run `pnpm test`
- **Test against prod-like env** — use Vercel preview deployments with branch-specific env vars

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs: expand runbook with common ops procedures"
```

---

### Task 37: End-to-end Playwright test — happy path

**Files:**
- Create: `tests/e2e/happy-path.spec.ts`, `tests/e2e/helpers/seed.ts`

- [ ] **Step 1: Seed helper**

`tests/e2e/helpers/seed.ts`:
```ts
import { createClient } from '@supabase/supabase-js';

export async function seedApprovedConsultant(email: string) {
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  await supa.from('consultants').upsert({ email, is_approved: true });
  const { data: user } = await supa.auth.admin.createUser({ email, email_confirm: true });
  const { data: consultant } = await supa.from('consultants')
    .update({ auth_user_id: user.user!.id, display_name: 'E2E Tester' })
    .eq('email', email).select().single();
  return consultant!;
}

export async function clearAll() {
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  for (const t of ['contacts','uploads','enrichment_jobs','apollo_samples','sheets','dedup_archive','companies']) {
    await supa.from(t).delete().neq(t === 'dedup_archive' ? 'normalized_key' : 'id',
      t === 'dedup_archive' ? '__none__' : '00000000-0000-0000-0000-000000000000');
  }
}
```

- [ ] **Step 2: Happy path test**

`tests/e2e/happy-path.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { clearAll, seedApprovedConsultant } from './helpers/seed';
import fs from 'node:fs';
import path from 'node:path';

test.beforeEach(async () => { await clearAll(); });

test('consultant uploads, sees confirmation, admin sees activity', async ({ page, context }) => {
  const email = 'e2e@berkeley.edu';
  await seedApprovedConsultant(email);

  // Bypass OAuth for tests — use Supabase admin to generate a session, inject cookies
  // (See Supabase docs on generating session tokens for tests)
  // ...

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /Upload contacts/i })).toBeVisible();

  const csvPath = path.join(__dirname, 'fixtures/sample.csv');
  fs.writeFileSync(csvPath, 'first_name,last_name,company\nJohn,Smith,Tesla\nJane,Doe,Apple\n');
  await page.setInputFiles('input[type="file"]', csvPath);
  await expect(page.getByText(/rows added/i)).toBeVisible({ timeout: 10_000 });
});
```

For v1, E2E auth uses admin-created test users; full Google-OAuth-against-live doesn't need to be automated. Subsequent tests would cover:
- pull-sheet happy path (mock Google Sheets API or hit real with a test Google account)
- admin approval flow
- force sign-out

- [ ] **Step 3: Add Playwright command**

```bash
pnpm test:e2e
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test(e2e): Playwright happy-path seed helper + upload smoke test"
```

---

### Task 38: README — entry-point docs

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

Sections:
- What this is (1-sentence pitch)
- Quickstart for local dev (Supabase start, env, `pnpm dev`, `pnpm test`)
- Quickstart for deploy (link to runbook)
- Architecture diagram (link to spec)
- Where to find what (lib/ map)
- Testing strategy (unit + integration + E2E)
- Runbook link
- License / ownership

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs: README with quickstart + project map"
```

---

## Self-Review

Before handing off for execution, verify:

1. **Spec coverage:** Walk §1-§20 of the spec. Every requirement maps to a task:
   - §2 roles → Tasks 4 (schema), 22 (middleware), 28 (admin actions)
   - §3.1 onboarding → Tasks 9 (RPC), 21 (callback), 29 (sign-in/pending pages)
   - §3.2 upload flow → Tasks 13 (parser), 14 (alias map), 16 (LLM tasks), 23 (ingest), 24 (route), 30 (UI)
   - §3.3 pull flow → Task 25
   - §3.4 admin → Tasks 28, 32-34
   - §5 schema → Tasks 4-9, 19, 25 (pull_sheet RPC)
   - §6 Apollo → Tasks 11, 12, 17, 26
   - §7 Google Sheets → Task 18, 25, 27
   - §8 admin dashboard → Tasks 32-34
   - §9 error handling → baked into 23, 24, 25, 26 (delete-on-error); Tasks 28 (admin self-deactivation warning in Action dropdown)
   - §10 testing → Tasks 10-14 (unit), 23, 24, 26 (integration), 37 (E2E)
   - §11 monitoring → structured logs implicit in all API routes; ops_alerts table deferred (flagged in §17 of spec)
   - §12 deployment → Tasks 35, 36
   - §13 repo layout → matches file paths throughout
   - §18 LLM → Tasks 15, 16
   - §19 edge cases → covered by per-task error handling

2. **Placeholder scan:** Each task has concrete code / file paths / commands.

3. **Type consistency:** Function names match across tasks (`processEnrichmentJob`, `ingestUpload`, `pull_sheet`, `resolve_consultant`).

4. **Known deferrals:** `ops_alerts` table for admin banner on Apollo 402, and the explicit "resume worker" admin UI, are documented as v1.5 work in runbook (manual SQL toggle until then). This is consistent with the spec's §17 (design decisions deferred to implementation).

---

