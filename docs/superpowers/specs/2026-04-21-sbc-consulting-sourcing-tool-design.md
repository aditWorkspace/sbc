# SBC Consulting — Sourcing Tool Design

**Status:** Draft for review
**Author:** Adit + Claude (brainstorming session)
**Date:** 2026-04-21
**Target release:** Single-push v1

## 1. Context & goals

SBC Consulting (Berkeley) runs an outbound sourcing operation: roughly ten consultants continuously build lists of prospective contacts (first name, last name, company), enrich them with work emails, and send mail-merge outreach. Today this is ad-hoc — each consultant repeats manual Apollo lookups, there's no shared memory of "we already emailed this person," and the admin has no visibility into who's actually doing the work.

The tool solves three problems:

1. **Amortize Apollo cost** — learn each company's email pattern from a few samples and reuse it for every future contact at that company.
2. **Prevent duplicate outreach** — no person should receive an email from the club twice, ever.
3. **Give the admin observability** — who's uploading, who's sending, what's the pool health.

Non-goal: the tool does **not** send the emails itself. Consultants continue using their own mail-merge tool (GMass, etc.) on top of the Google Sheets the tool generates.

### Success criteria

- A consultant can sign in, upload a 300-row CSV, and receive a populated Google Sheet in under 2 minutes when the companies are already in the template cache.
- A net-new company's template is learned with ≤10 Apollo credits 80% of the time (Balanced preset assumption).
- Zero cross-consultant duplicate emails — the same `(name, company)` is never delivered to two consultants, and is never re-admitted to the pool after being pulled.
- Admin can answer "what has consultant X done this month?" in two clicks.

---

## 2. Users & roles

There are exactly two roles. Role is a boolean (`is_admin`) on the `consultants` row, not a separate table.

**Consultant**
- Signs in with Google (restricted to `@berkeley.edu` domain)
- Must be approved (`is_approved=true`) by an admin before the app does anything
- Can upload CSVs, view their own upload history, pull sheets, view their own sheet history
- Cannot see any other consultant's data

**Admin**
- Everything a consultant can do
- Plus: whitelist/deactivate consultants, see all consultants' activity, force-refresh a company's template, manually delete pool rows, view aggregate stats
- Designated by setting `is_admin=true` on their consultant row (seeded once during initial deploy)

---

## 3. End-to-end user flows

### 3.1 Consultant onboarding

1. Consultant visits the app root → clicks "Sign in with Google"
2. Google OAuth restricted to `hd=berkeley.edu` (Google-enforced hosted-domain hint)
3. Supabase Auth callback → creates a `consultants` row with `is_approved=false`
4. App shows a "pending admin approval" screen; no other features accessible
5. Admin opens admin dashboard → "Pending approvals" section → clicks Approve
6. Consultant refreshes → lands on dashboard with upload area and "Get sheet" button

### 3.2 Upload flow

1. Consultant drags a CSV onto the upload zone, or clicks to browse
2. Client parses headers; must map to `first_name`, `last_name`, `company` (case-insensitive, with some aliases — "First Name"/"firstname"/"fname" all map). If required columns can't be inferred, show a column-mapping UI before submit.
3. POST to `/api/uploads` with the parsed rows
4. Server creates an `uploads` row with `status='processing'`
5. Server performs **dedup in three stages**:
   - **Stage A — intra-file dedup:** duplicate `(normalized_first, normalized_last, normalized_company)` within the same upload → keep first occurrence
   - **Stage B — pool dedup:** rows that already exist in `contacts` → silently drop (was already uploaded by someone)
   - **Stage C — archive dedup:** rows present in `dedup_archive` → silently drop (was already pulled by the club)
6. For each surviving row:
   - Find-or-create a `companies` row by `name_normalized`
   - If the company has `template_confidence ∈ {HIGH, MEDIUM, LOW}` → render email from template, insert contact with `enrichment_status='enriched'`, `email_source='template'`
   - If company is `UNRESOLVED` → insert contact with `enrichment_status='pending'`, enqueue `enrichment_jobs` row with `kind='direct_finder'` for this contact
   - If company is new or `SAMPLING` and has no pending sample job → insert contact as pending, enqueue one `kind='sample'` job (deduped by company_id)
7. Update `uploads` row: `row_count_raw`, `row_count_deduped`, `row_count_archived`, `row_count_admitted`, `status='complete'`
8. Return upload summary to client: "We received 300 rows. 40 already existed, 260 added. 180 enriched instantly. 80 are being enriched in the background — check back in a minute."
9. Client subscribes to Supabase Realtime on the `contacts` table filtered by `upload_id` (or polls `/api/uploads/:id`) to show live enrichment progress.

### 3.3 Pull-sheet flow

1. Consultant clicks "Get my sheet" on the dashboard
2. POST to `/api/sheets` with no body
3. Server runs a **single SQL transaction**:
   ```
   BEGIN;
   -- Select 300 rows: own first, then shared, only enriched rows
   WITH chosen AS (
     SELECT id FROM contacts
     WHERE enrichment_status = 'enriched'
     ORDER BY (uploaded_by = $consultant_id) DESC, created_at ASC
     LIMIT 300
     FOR UPDATE SKIP LOCKED
   ),
   archived AS (
     INSERT INTO dedup_archive (normalized_key, original_first_name, original_last_name, original_company, first_uploaded_by)
     SELECT c.normalized_key, c.first_name, c.last_name, c.company_display, c.uploaded_by
     FROM contacts c JOIN chosen USING (id)
     RETURNING normalized_key
   ),
   deleted AS (
     DELETE FROM contacts WHERE id IN (SELECT id FROM chosen) RETURNING *
   )
   SELECT * FROM deleted;
   COMMIT;
   ```
4. Server receives the deleted rows (up to 300, maybe fewer if pool was low)
5. If count is zero → return error "Pool empty, ask a teammate to upload"
6. If count is under 300 but over zero → proceed, flag a warning in the response
7. Server inserts a `sheets` row with metadata (consultant_id, row_count, from_own_sourcing, from_shared_pool)
8. Server calls Google Sheets API (using admin refresh token from Vault) to:
   - Create a new spreadsheet titled `SBC Sourcing — {consultant.display_name} — {date}`
   - Write headers and 300 data rows
   - Share with the consultant's email (`role: writer`)
   - Set `scheduled_delete_at = created_at + 90 days`
9. Update the `sheets` row with `google_sheet_id` and `google_sheet_url`
10. Return `{url, row_count, warning?}` to the client
11. Client opens the URL in a new tab

**Failure handling for Sheets API:** if Google API call fails *after* the DB transaction committed, the rows are already deleted and archived. We must either (a) retry sheet creation, or (b) roll back by re-inserting the rows. Chosen approach: **retry with exponential backoff (3 attempts), then if still failing, surface the row data to the consultant as a direct CSV download** — they still get their data, just via a fallback path. The `sheets` row is marked `status='fallback_csv'`.

### 3.4 Admin flow

1. Admin signs in (same OAuth flow)
2. Dashboard defaults to "Overview" tab showing KPIs, per-consultant table, template cache health, top companies
3. Tabs: Overview, Consultants, Template Cache, Pool Admin, Settings
4. Time-range toggle (day / week / month / all-time) affects Overview metrics
5. Clicking a consultant row → drill-down: full upload history table + full sheet history table
6. Template Cache tab → list of companies with confidence levels + "Force refresh" button per row (resets the company to `UNKNOWN`, drops samples, enqueues a new sampling job)
7. Pool Admin tab → search pool by name/company, delete a row, release an archive entry
8. Settings tab → consultant whitelist management (add email, approve pending, deactivate)

---

## 4. System architecture

```
Consultants + Admin (browsers)
        │
        ▼
Next.js (App Router) deployed to Vercel
   ├── Consultant UI  (app/(consultant)/**)
   ├── Admin UI       (app/admin/**)
   ├── API routes     (app/api/**)
   ├── Enrichment worker (app/api/cron/enrich/route.ts)
   └── Cleanup cron   (app/api/cron/cleanup/route.ts)
        │
        ▼
Supabase (Postgres + Auth + Vault + Realtime)
        │
        ▼
External:
   ├── Apollo.io  (People Search + Email Finder)
   └── Google APIs (Sheets + Drive, server-side, admin's refresh token from Vault)
```

### 4.1 Runtime components

| Component | Home | Schedule |
|---|---|---|
| Consultant UI | Vercel | On demand |
| Admin UI | Vercel | On demand |
| `/api/uploads` (POST) | Vercel | On demand |
| `/api/sheets` (POST) | Vercel | On demand |
| `/api/admin/*` | Vercel | On demand |
| `/api/cron/enrich` | Vercel Cron | Every 60 seconds |
| `/api/cron/cleanup` | Vercel Cron | Daily at 02:00 PT |

Vercel Cron is configured via `vercel.json`. Paths `/api/cron/*` verify the `authorization: Bearer ${CRON_SECRET}` header — Vercel sends this automatically; the app rejects manual hits.

### 4.2 Auth & identity

Supabase Auth is configured with Google OAuth. The Google OAuth client has:
- Authorized redirect URI: `https://<project>.supabase.co/auth/v1/callback`
- `hd` (hosted-domain) parameter: `berkeley.edu` — enforced on the authorize URL; Google rejects non-matching domains before the user can consent

Supabase Auth webhook fires on every new signup → creates the `consultants` row with `is_approved=false, is_admin=false`.

Admin seeding is a two-phase process:
1. Migration `0010_admin_seed.sql` inserts a `consultants` row with the admin's `@berkeley.edu` email, `is_admin=true`, `is_approved=true`, `auth_user_id=NULL`.
2. When the admin signs in for the first time, the Auth webhook finds the existing row by email (instead of creating a new one) and backfills `auth_user_id` + `display_name` from the Google profile.
The same join-by-email pattern applies to consultants added via the admin UI (section 8.2).

### 4.3 Secrets

Stored in Supabase Vault (encrypted at rest, accessed via `vault.read_secret(name)` from Postgres):

- `apollo_api_key`
- `google_oauth_client_id`
- `google_oauth_client_secret`
- `google_oauth_refresh_token` (admin's — set once during setup)

Stored in Vercel env vars (not secret per se, just config):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; used to read Vault)
- `CRON_SECRET` (random 32-byte hex; Vercel attaches to cron requests)

---

## 5. Data model

All tables use UUID primary keys. `timestamptz` defaults to `now()`. Foreign keys are explicit. RLS policies noted per table.

### 5.1 `consultants`

```sql
CREATE TABLE consultants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL CHECK (email LIKE '%@berkeley.edu'),
  display_name text,
  is_admin boolean NOT NULL DEFAULT false,
  is_approved boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  approved_by uuid REFERENCES consultants(id),
  deactivated_at timestamptz,
  deactivated_by uuid REFERENCES consultants(id),
  last_active_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: consultants can SELECT their own row; admins can do everything
ALTER TABLE consultants ENABLE ROW LEVEL SECURITY;
CREATE POLICY consultants_self_read ON consultants FOR SELECT
  USING (auth_user_id = auth.uid());
CREATE POLICY consultants_admin_all ON consultants FOR ALL
  USING (EXISTS (SELECT 1 FROM consultants c WHERE c.auth_user_id = auth.uid() AND c.is_admin));
```

### 5.2 `companies`

```sql
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_normalized text UNIQUE NOT NULL,  -- lowercase, whitespace-collapsed, punctuation-stripped
  display_name text NOT NULL,             -- original casing from first upload
  domain text,                            -- learned: e.g. "tesla.com"
  template_pattern text,                  -- enum: 'first.last' | 'firstlast' | 'flast' | 'f.last' | 'first' | 'firstl' | 'last' | 'last.first'
  template_confidence text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (template_confidence IN ('UNKNOWN', 'SAMPLING', 'HIGH', 'MEDIUM', 'LOW', 'UNRESOLVED')),
  sample_size int NOT NULL DEFAULT 0,
  matching_samples int NOT NULL DEFAULT 0,  -- how many samples match the current winner
  apollo_credits_spent int NOT NULL DEFAULT 0,
  locked_at timestamptz,
  last_sampled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX companies_confidence_idx ON companies(template_confidence);
```

No RLS — this is shared reference data; consultants can read all, writes locked to service role.

### 5.3 `apollo_samples`

```sql
CREATE TABLE apollo_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  person_first_name text,
  person_last_name text,
  email_returned text,
  email_ignored_reason text,   -- 'personal_domain' | 'no_email_found' | 'no_pattern_match'
  detected_pattern text,       -- matches companies.template_pattern enum
  detected_domain text,
  credits_spent int NOT NULL DEFAULT 1,
  apollo_response jsonb,       -- raw API response for debug
  sampled_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX apollo_samples_company_idx ON apollo_samples(company_id, sampled_at);
```

Purpose: audit log — lets the admin force-refresh a company and see exactly what Apollo returned. Grows roughly linearly with Apollo usage; prune older than 12 months via the daily cleanup cron if it ever becomes large (unlikely at club scale).

### 5.4 `contacts` (the pool)

```sql
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text,
  first_name_normalized text NOT NULL,   -- lowercase, no diacritics, no punctuation
  last_name_normalized text,
  company_id uuid NOT NULL REFERENCES companies(id),
  company_display text NOT NULL,          -- snapshot from upload for sheet output
  normalized_key text NOT NULL,           -- "{first_norm}|{last_norm}|{company_norm}" — computed by app on insert
  email text,
  email_source text CHECK (email_source IN ('template', 'apollo_direct', 'manual')),
  enrichment_status text NOT NULL DEFAULT 'pending'
    CHECK (enrichment_status IN ('pending', 'enriched', 'failed')),
  uploaded_by uuid NOT NULL REFERENCES consultants(id),
  upload_id uuid NOT NULL REFERENCES uploads(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  enriched_at timestamptz,

  UNIQUE (first_name_normalized, last_name_normalized, company_id)
);
CREATE INDEX contacts_company_status_idx ON contacts(company_id, enrichment_status);
CREATE INDEX contacts_uploader_idx ON contacts(uploaded_by);
CREATE INDEX contacts_status_created_idx ON contacts(enrichment_status, created_at);
CREATE INDEX contacts_normalized_key_idx ON contacts(normalized_key);
```

Note: `normalized_key` is computed in the app on insert (Postgres generated columns cannot use subqueries, so we avoid that route). The upload flow knows the company's `name_normalized` after the find-or-create step, and concatenates the three normalized pieces before inserting. The same formula is used when inserting into `dedup_archive` during pull — both sides must match byte-for-byte, so the computation lives in one helper: `buildNormalizedKey(firstNorm, lastNorm, companyNorm)`.

RLS:
```sql
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
-- Consultants see none directly — all access is via API routes using service role
-- Admin policy allows SELECT for audit/Pool Admin tab
CREATE POLICY contacts_admin_read ON contacts FOR SELECT
  USING (EXISTS (SELECT 1 FROM consultants c WHERE c.auth_user_id = auth.uid() AND c.is_admin));
```

### 5.5 `dedup_archive`

```sql
CREATE TABLE dedup_archive (
  normalized_key text PRIMARY KEY,
  original_first_name text,
  original_last_name text,
  original_company text,
  first_uploaded_by uuid REFERENCES consultants(id),
  pulled_in_sheet uuid REFERENCES sheets(id),
  archived_at timestamptz NOT NULL DEFAULT now()
);
```

Primary-key is the normalized key itself — zero-cost deduplication lookup on upload. Never pruned; this is the compliance audit trail.

### 5.6 `uploads`

```sql
CREATE TABLE uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL REFERENCES consultants(id),
  filename text,
  row_count_raw int NOT NULL DEFAULT 0,
  row_count_deduped int NOT NULL DEFAULT 0,        -- after intra-file dedup
  row_count_archived int NOT NULL DEFAULT 0,       -- dropped by archive dedup
  row_count_already_in_pool int NOT NULL DEFAULT 0,-- dropped by pool dedup
  row_count_admitted int NOT NULL DEFAULT 0,       -- actually inserted
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'complete', 'failed')),
  error_message text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX uploads_consultant_idx ON uploads(consultant_id, uploaded_at);
```

### 5.7 `enrichment_jobs`

```sql
CREATE TABLE enrichment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('sample', 'direct_finder')),
  company_id uuid NOT NULL REFERENCES companies(id),
  contact_id uuid REFERENCES contacts(id),  -- only for kind='direct_finder'
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  -- at most one queued/running sample job per company (prevents duplicate work)
  UNIQUE (company_id, kind) DEFERRABLE
);
CREATE INDEX enrichment_jobs_queue_idx ON enrichment_jobs(status, created_at)
  WHERE status IN ('queued', 'running');
```

The unique `(company_id, kind)` constraint prevents stampede: if a company has 50 pending contacts, we still enqueue only one sample job. Once the job completes and the company is still unresolved, we enqueue the next round explicitly.

For `direct_finder` jobs, uniqueness is per-contact; the constraint is relaxed — we can use a partial unique index instead:

```sql
CREATE UNIQUE INDEX enrichment_jobs_sample_unique ON enrichment_jobs(company_id)
  WHERE kind='sample' AND status IN ('queued', 'running');
CREATE UNIQUE INDEX enrichment_jobs_finder_unique ON enrichment_jobs(contact_id)
  WHERE kind='direct_finder' AND status IN ('queued', 'running');
```

### 5.8 `sheets`

```sql
CREATE TABLE sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL REFERENCES consultants(id),
  google_sheet_id text,
  google_sheet_url text,
  row_count int NOT NULL,
  from_own_sourcing int NOT NULL DEFAULT 0,
  from_shared_pool int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'fallback_csv', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  scheduled_delete_at timestamptz GENERATED ALWAYS AS (created_at + interval '90 days') STORED,
  deleted_at timestamptz
);
CREATE INDEX sheets_consultant_idx ON sheets(consultant_id, created_at);
CREATE INDEX sheets_cleanup_idx ON sheets(scheduled_delete_at)
  WHERE deleted_at IS NULL;
```

---

## 6. Apollo enrichment logic

### 6.1 Pattern enumeration

Eight patterns, evaluated in order. If a sample email's local-part matches multiple, the first listed wins (deterministic tie-breaker). Names normalized to lowercase ASCII before comparison.

```ts
const PATTERNS = [
  { name: 'first.last',   render: (f, l) => `${f}.${l}` },
  { name: 'first_last',   render: (f, l) => `${f}_${l}` },
  { name: 'firstlast',    render: (f, l) => `${f}${l}` },
  { name: 'flast',        render: (f, l) => `${f[0]}${l}` },
  { name: 'f.last',       render: (f, l) => `${f[0]}.${l}` },
  { name: 'first',        render: (f, l) => `${f}` },
  { name: 'firstl',       render: (f, l) => `${f}${l[0]}` },
  { name: 'last.first',   render: (f, l) => `${l}.${f}` },
  { name: 'last',         render: (f, l) => `${l}` },
];
```

### 6.2 Normalization rules

```ts
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')  // strip diacritics: josé → jose
    .replace(/[^a-z]/g, '');          // strip hyphens, apostrophes, spaces, digits
}
```

Edge cases handled:
- `Jean-Paul` → `jeanpaul` (not `jean-paul` or `jean`)
- `O'Brien` → `obrien`
- `José Ávila` → `jose`, `avila`
- `Li` (short last) → `li` — short lengths are fine; `flast` = `jli` for first=John, last=Li, which is unambiguous
- Missing last name → last = `''`; patterns involving last are marked non-matching

### 6.3 Personal-domain filter

```ts
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me', 'pm.me',
  'zoho.com', 'mail.com',
]);
```

Samples with personal-domain emails are recorded in `apollo_samples` with `email_ignored_reason='personal_domain'` and do not count toward `sample_size`.

### 6.4 State machine

```
state UNKNOWN           — no samples yet
state SAMPLING          — samples < 3 or below threshold, more calls coming
state HIGH              — locked (3/3 agree, or ≥90% after ≥10 samples)
state MEDIUM            — locked (≥75% after ≥10 samples)
state LOW               — locked (≥60% after ≥10 samples, or ≥60% at cap 30)
state UNRESOLVED        — sample cap 30 hit, still <60% — future rows use direct_finder

Transitions (evaluated after each batch):
  UNKNOWN --[sample 3]-->     SAMPLING | HIGH
  SAMPLING (n=3)              HIGH (3/3)     OR SAMPLING → sample to 10
  SAMPLING (n=10)             HIGH (≥90%) | MEDIUM (≥75%) | LOW (≥60%) | SAMPLING → sample to 20
  SAMPLING (n=20)             MEDIUM (≥75%) | LOW (≥60%)  | SAMPLING → sample to 30
  SAMPLING (n=30)             LOW (≥60%) | UNRESOLVED
```

Winner = the pattern with the highest `matching_samples / sample_size`. Ties broken by pattern order (index 0 wins). Domains are compared as exact strings (case-insensitive) — `tesla.com` and `teslamotors.com` are different domains. If the top pattern has two domains, the more frequent domain wins; if frequencies tie, the shorter domain wins (heuristic: corporate primaries tend to be shorter than acquired/legacy ones).

### 6.5 Worker loop (pseudocode)

```
POST /api/cron/enrich (Vercel Cron, every 60s)
  assert bearer == CRON_SECRET
  acquire advisory lock `enrichment_worker` (prevent overlap if previous run slow)

  jobs = SELECT * FROM enrichment_jobs
         WHERE status='queued'
         ORDER BY created_at
         LIMIT 20
         FOR UPDATE SKIP LOCKED

  for job in jobs:
    UPDATE enrichment_jobs SET status='running', locked_at=now(), attempts=attempts+1 WHERE id=job.id

    try:
      if job.kind == 'sample':
        run_sampling_round(job.company_id)
      elif job.kind == 'direct_finder':
        run_direct_finder(job.contact_id)

      UPDATE enrichment_jobs SET status='done', completed_at=now() WHERE id=job.id
    except ApolloRateLimit:
      UPDATE enrichment_jobs SET status='queued', locked_at=null, last_error='rate_limit' WHERE id=job.id
      sleep 5s
    except Exception as e:
      if job.attempts < 3:
        UPDATE enrichment_jobs SET status='queued', locked_at=null, last_error=e.message WHERE id=job.id
      else:
        UPDATE enrichment_jobs SET status='failed', last_error=e.message WHERE id=job.id

  release advisory lock
```

Vercel Cron hobby tier: function execution up to 60s. Pro: 300s. Either is plenty for 20 jobs/batch; if Apollo slow, lower the batch size.

### 6.6 Sampling round

```
def run_sampling_round(company_id):
    company = load companies WHERE id=company_id FOR UPDATE
    remaining_samples_needed = next_target_size(company.sample_size) - company.sample_size
    if remaining_samples_needed <= 0:
      mark company UNRESOLVED if at cap, return

    people = apollo.people_search(
      organization_name=company.display_name,
      per_page=remaining_samples_needed * 2,  # over-fetch; some may lack emails
      email_status=['verified'],  # Apollo values: verified | guessed | unavailable | bounced
                                  # we only trust 'verified' for pattern inference
    )
    # NOTE: cost model — 1 credit per person returned with an email, regardless of our use

    new_samples = []
    for p in people:
      if len(new_samples) >= remaining_samples_needed: break
      email = p.work_email or p.email
      if not email:
        record sample (ignored: no_email_found)
        continue
      domain = email.split('@')[1]
      if domain in PERSONAL_DOMAINS:
        record sample (ignored: personal_domain)
        continue
      pattern = detect_pattern(p.first_name, p.last_name, email)
      record sample (detected_pattern=pattern, detected_domain=domain)
      new_samples.append(...)

    # Re-evaluate
    (winner_pattern, winner_domain, match_count, total) = tally_samples(company_id)
    company.sample_size = total
    company.matching_samples = match_count
    company.template_pattern = winner_pattern
    company.domain = winner_domain
    company.last_sampled_at = now()

    ratio = match_count / total if total > 0 else 0
    if total >= 3 and total == match_count:  # 3/3 exact
      company.template_confidence = 'HIGH'
      company.locked_at = now()
    elif total >= 10 and ratio >= 0.9:
      company.template_confidence = 'HIGH'; company.locked_at = now()
    elif total >= 10 and ratio >= 0.75:
      company.template_confidence = 'MEDIUM'; company.locked_at = now()
    elif total >= 10 and ratio >= 0.6:
      company.template_confidence = 'LOW'; company.locked_at = now()
    elif total >= 30:
      company.template_confidence = 'UNRESOLVED'
    else:
      company.template_confidence = 'SAMPLING'

    save company

    # Drain pending contacts if we just locked a template
    if company.template_confidence in ('HIGH', 'MEDIUM', 'LOW'):
      UPDATE contacts
        SET email = render_template(first_name, last_name, company.template_pattern, company.domain),
            email_source = 'template',
            enrichment_status = 'enriched',
            enriched_at = now()
        WHERE company_id = company.id AND enrichment_status = 'pending'
    elif company.template_confidence == 'UNRESOLVED':
      INSERT INTO enrichment_jobs (kind, company_id, contact_id)
        SELECT 'direct_finder', company.id, id FROM contacts
        WHERE company_id = company.id AND enrichment_status = 'pending'
    elif company.template_confidence == 'SAMPLING':
      # need more samples — enqueue next round
      INSERT INTO enrichment_jobs (kind, company_id) VALUES ('sample', company.id)

def next_target_size(current):
    if current < 3: return 3
    if current < 10: return 10
    if current < 20: return 20
    return 30
```

### 6.7 Direct finder (for UNRESOLVED companies)

```
def run_direct_finder(contact_id):
    c = load contact
    co = load company
    result = apollo.email_finder(first_name=c.first_name, last_name=c.last_name, domain=co.domain or guessed_domain(co.name_normalized))
    if result.email and result.email_status == 'verified':
      UPDATE contacts SET email=result.email, email_source='apollo_direct', enrichment_status='enriched', enriched_at=now() WHERE id=contact_id
    else:
      UPDATE contacts SET enrichment_status='failed' WHERE id=contact_id
```

For UNRESOLVED companies without a learned domain, `guessed_domain` tries `${name_normalized}.com` as a best-effort (e.g., "tesla" → "tesla.com"). Low accuracy but free.

### 6.8 Force-refresh (admin)

Admin clicks Force-refresh on a company:
1. `UPDATE companies SET template_confidence='UNKNOWN', template_pattern=NULL, domain=NULL, sample_size=0, matching_samples=0, locked_at=NULL WHERE id=X`
2. `DELETE FROM apollo_samples WHERE company_id=X` (optional; keep for audit by default)
3. `INSERT INTO enrichment_jobs (kind, company_id) VALUES ('sample', X)`
4. Already-enriched contacts for this company keep their old emails — force-refresh only affects future uploads. Admin can optionally tick "also re-enrich current contacts" which would flip them to pending.

---

## 7. Google Sheets integration

### 7.1 One-time admin OAuth setup

A CLI script `scripts/setup-admin-oauth.ts` runs locally:
1. Starts a tiny HTTP server on `localhost:3333`
2. Opens browser to Google OAuth URL with scopes:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/drive.file` (narrow — only files the app creates)
3. User signs in as admin, approves
4. Google redirects back with auth code
5. Script exchanges code for refresh token
6. Script writes refresh token to Supabase Vault via service-role RPC
7. Script prints "Admin OAuth configured. You can delete this script now."

Scope choice: `drive.file` (not `drive`) means we can only touch files the app creates. Smaller blast radius; if something goes wrong, we can't accidentally scan or delete unrelated Drive content. This also keeps Google's verification requirements minimal.

### 7.2 Sheet creation code path

```ts
async function createSheetForConsultant({ consultant, rows }): Promise<{ url, id }> {
  const accessToken = await refreshAdminAccessToken();  // uses refresh token from Vault
  const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
  const drive = google.drive({ version: 'v3', auth: oAuth2Client });

  const title = `SBC Sourcing — ${consultant.display_name} — ${formatDate(new Date())}`;
  const { data: spreadsheet } = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: 'Contacts' } }],
    },
  });

  // Populate headers + rows
  await sheets.spreadsheets.values.update({
    spreadsheetId: spreadsheet.spreadsheetId,
    range: 'Contacts!A1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        ['Full Name', 'First Name', 'Company', 'Email'],
        ...rows.map(r => [r.full_name, r.first_name, r.company_display, r.email]),
      ],
    },
  });

  // Share with consultant
  await drive.permissions.create({
    fileId: spreadsheet.spreadsheetId,
    requestBody: { type: 'user', role: 'writer', emailAddress: consultant.email },
    sendNotificationEmail: false,  // don't spam — we open in a new tab instead
  });

  return { url: spreadsheet.spreadsheetUrl, id: spreadsheet.spreadsheetId };
}
```

Retry: wrap the whole function in exponential backoff (3 attempts, 1s / 4s / 16s). If all fail, fall back to CSV download.

### 7.3 Daily cleanup cron

```
GET /api/cron/cleanup (daily 02:00 PT)
  sheets_to_delete = SELECT * FROM sheets WHERE scheduled_delete_at < now() AND deleted_at IS NULL
  for sheet in sheets_to_delete:
    try:
      drive.files.delete({ fileId: sheet.google_sheet_id })
      UPDATE sheets SET deleted_at = now() WHERE id = sheet.id
    except FileNotFoundError:
      UPDATE sheets SET deleted_at = now() WHERE id = sheet.id  -- already gone
    except e:
      log(e); continue  -- try again tomorrow
```

---

## 8. Admin dashboard (detailed)

### 8.1 Overview tab

- **Top KPIs (4 cards)**
  - Active pool size — `SELECT count(*) FROM contacts`
  - Rows uploaded (time-range) — `SELECT sum(row_count_admitted) FROM uploads WHERE uploaded_at >= :start`
  - Sheets pulled (time-range) — `SELECT count(*), sum(row_count) FROM sheets WHERE created_at >= :start`
  - Apollo spend (time-range) — `SELECT sum(credits_spent) FROM apollo_samples WHERE sampled_at >= :start` × credit-to-dollar rate (config); also show cache hit rate: `1 - (direct_finder_count / total_enrichments)`
- **Per-consultant activity table** — one row per consultant, columns: uploaded, sheets pulled, rows out, % from own sourcing, last active, is_approved/is_admin badges. Click → drill-down page.
- **Template cache health** — counts by confidence level; button to open Template Cache tab
- **Top companies by pool size** — `SELECT company_display, count(*) FROM contacts GROUP BY company_display ORDER BY 2 DESC LIMIT 5`

### 8.2 Consultants tab

- List of all consultants with filters (approved / pending / deactivated / admin)
- Add-email input → creates a `consultants` row with `is_approved=true` but `auth_user_id=NULL` — when that person signs in with Google, the row matches on email and pulls in the `auth_user_id`
- Approve pending signups with one click
- Deactivate: sets `deactivated_at=now()`, `deactivated_by=admin_id`. Deactivated consultants fail auth middleware check.

### 8.3 Template Cache tab

Table of companies with columns: name, confidence, pattern, domain, samples, credits spent, locked_at. Actions: Force-refresh, view sample history (opens `apollo_samples` for that company).

### 8.4 Pool Admin tab

Search `contacts` by name/company. Delete row. Release archive entry (`DELETE FROM dedup_archive WHERE normalized_key = X`).

### 8.5 Settings tab

(Minimal) Config for time-range default, retention days override, Apollo cost-per-credit for dollar estimates, cron-secret rotation instructions.

### 8.6 Time-range toggle

All Overview tab queries accept a `range` query param: `day | week | month | all`. Defaults to `month`. Implemented as URL state so admins can bookmark specific views.

---

## 9. Error handling & edge cases

**CSV parse failures.** Show inline errors before submit. Common cases: headers missing, no rows, rows with missing `first_name` or `company`. Missing `last_name` is allowed (patterns like `first`/`last` may not resolve, but the row still goes in the pool and fills if possible).

**Duplicate upload within one CSV.** Intra-file dedup at Stage A. Reported to user in the upload summary: "4 rows removed as in-file duplicates."

**Consultant uploads, immediately pulls, pool is empty.** Pull returns 0 rows with message "Pool is empty — ask a teammate to upload before pulling a sheet."

**Pool has 47 rows, consultant wants 300.** Return the 47 + warning: "Only 47 rows available (pool is running low). If you'd like 300, wait for more uploads."

**Apollo credit exhausted.** Worker detects `402 Payment Required` → creates an ops alert (log + dashboard banner for admin), pauses worker (sets all pending jobs to `status='failed'` with message; re-run the worker manually once credits top up). Future: admin-dashboard banner "Apollo credit at 5% — refill".

**Apollo returns a person not at this company.** Apollo occasionally returns cross-company matches. Validate: `person.organization.name` normalized must match `company.name_normalized`. If not, discard the sample.

**Consultant deleted from Google Workspace (still whitelisted).** Auth fails at Google; handled gracefully by Supabase Auth flow. Admin can deactivate via dashboard.

**Consultant pulls sheet, opens URL, it's missing.** 90-day auto-delete might happen while they still have the tab open. Tolerable.

**Google API rate limit during pull-sheet.** Retry with backoff (see 7.2). If all retries fail, fall back to CSV download with the same data; `sheets.status='fallback_csv'`.

**Two consultants pull sheets simultaneously with 400 rows in the pool.** The `FOR UPDATE SKIP LOCKED` in the pull transaction ensures they each get a disjoint subset. First gets up to 300, second gets the remaining 100 + warning.

**Admin tries to deactivate themselves.** UI warns; requires typing "DEACTIVATE" to confirm. If they do it anyway, they lose access — another admin (if any) can re-approve. If there's only one admin, a DB console visit is required (documented in runbook).

**Refresh token revoked.** Next Google API call returns `invalid_grant`. Admin dashboard shows a banner: "Google integration disconnected. Re-run `setup-admin-oauth.ts`." All pull-sheet operations fall back to CSV.

**Company whose domain is ambiguous** (e.g., "Tesla" could be `tesla.com` or `teslamotors.com`). Template-detection logic naturally handles this via domain tally; the more common domain wins. Admin can force-refresh and manually inspect the apollo_samples table if an edge case appears.

**Person with one name** (e.g., "Madonna, Madonna" from a music label). `first = 'madonna', last = 'madonna'`. Rendered email works fine; patterns `first` and `last` both match.

**Single-name-only entries** (first name provided, no last name). Rows where last_name is null: patterns involving last-name mark them as unrenderable; email stays null; row still goes in pool but has `enrichment_status='failed'` after enrichment attempt. These get pulled in sheets with empty Email column — admin can filter them out via Pool Admin if that's a nuisance.

---

## 10. Testing strategy

**Unit tests** (Jest/Vitest):
- `normalize(name)` — diacritics, punctuation, case
- `detectPattern(first, last, email)` — all 8 patterns, ambiguity tie-breakers
- `renderTemplate(first, last, pattern, domain)` — inverse of detect, round-trip property test
- `tallySamples(samples)` — ties, majority calculation, domain selection

**Integration tests** (against a local Supabase instance or supabase-js mock, with Apollo mocked):
- Upload CSV with all-new companies → jobs enqueued, worker runs, templates learned, contacts enriched
- Upload CSV with all-known companies → instant enrichment, no jobs
- Upload CSV with duplicates → dedup correctly applied at all three stages
- Pull sheet → rows deleted from pool, added to archive, sheet created (Google API mocked)
- Concurrent pull (two workers) → no overlapping rows (test via two parallel transactions)

**E2E tests** (Playwright):
- Sign in as consultant (Google OAuth mocked in test env or using a test account)
- Upload a small CSV
- Wait for enrichment
- Click "Get my sheet" → verify URL opens and sheet has correct headers + row count
- Sign in as admin → drill into consultant → verify counts match

**Manual checklist before release:**
- Run against real Apollo sandbox account
- Run against real Google account with real small test CSV (10 rows)
- Verify sheet appears in admin's Drive
- Verify consultant can open shared sheet
- Verify 90-day cleanup cron (fast-forward `scheduled_delete_at` to the past, trigger cron manually)

---

## 11. Monitoring & operations

- **Logs:** all API routes emit structured logs (Vercel → stdout → Vercel log drain or Axiom/Logflare). Worker logs include job id, company id, credits spent, outcome.
- **Metrics dashboard (in admin UI):** cache hit rate, credits spent (7d), enrichment job queue depth, failed jobs (7d).
- **Alerts:** (phase 1.5 if time permits) email to admin when: Apollo 402 returned; Google refresh token invalid; enrichment queue > 500 (backlog); worker hasn't run in >10 minutes.
- **Runbook (in repo):** `docs/runbook.md` with common ops: re-run OAuth setup, manually trigger cron, inspect failed jobs, force-refresh template, rotate CRON_SECRET, seed new admin.

---

## 12. Deployment

1. `supabase db push` applies migrations (`supabase/migrations/*.sql`)
2. `pnpm run seed:admin` inserts the admin's `consultants` row with their email, `is_admin=true, is_approved=true`
3. `pnpm exec tsx scripts/setup-admin-oauth.ts` runs admin OAuth flow once, stores refresh token
4. `vercel deploy --prod` ships the app
5. `vercel env pull` to sync env vars if developing locally
6. Vercel Cron is configured via `vercel.json`:
   ```json
   {
     "crons": [
       { "path": "/api/cron/enrich", "schedule": "* * * * *" },
       { "path": "/api/cron/cleanup", "schedule": "0 9 * * *" }
     ]
   }
   ```
   (09:00 UTC = 02:00 PT in PDT.)

---

## 13. Repository layout

```
sourcing-tool/
  app/
    (consultant)/
      layout.tsx              -- consultant shell (nav, sign-in gate)
      page.tsx                -- dashboard: upload + get sheet + history
      uploads/page.tsx        -- upload history detail
      sheets/page.tsx         -- sheet history
    admin/
      layout.tsx              -- admin gate (is_admin check)
      page.tsx                -- Overview
      consultants/page.tsx    -- Consultants tab
      consultants/[id]/page.tsx  -- drill-down
      templates/page.tsx      -- Template Cache
      pool/page.tsx           -- Pool Admin
      settings/page.tsx
    api/
      uploads/route.ts        -- POST upload
      sheets/route.ts         -- POST pull sheet
      admin/consultants/route.ts  -- CRUD
      admin/templates/[id]/refresh/route.ts
      cron/
        enrich/route.ts       -- Vercel Cron hits this
        cleanup/route.ts      -- Vercel Cron hits this
    auth/callback/route.ts    -- Supabase Auth callback
  lib/
    supabase/
      server.ts               -- server-side client (service role)
      client.ts               -- browser client (anon + user jwt)
    apollo/
      client.ts               -- Apollo API wrapper with rate limiter
      patterns.ts             -- detectPattern, renderTemplate, PATTERNS
    google/
      oauth.ts                -- refresh token dance, cached access token
      sheets.ts               -- createSheetForConsultant, deleteSheet
    enrichment/
      worker.ts               -- the cron entry point
      sampling.ts             -- run_sampling_round
      finder.ts               -- run_direct_finder
    csv/
      parse.ts                -- CSV parsing + column mapping
      normalize.ts            -- normalize()
  supabase/
    migrations/
      0001_consultants.sql
      0002_companies.sql
      0003_contacts.sql
      0004_dedup_archive.sql
      0005_uploads.sql
      0006_enrichment_jobs.sql
      0007_sheets.sql
      0008_apollo_samples.sql
      0009_rls_policies.sql
      0010_admin_seed.sql
  scripts/
    setup-admin-oauth.ts
    seed-admin.ts
  tests/
    unit/
    integration/
    e2e/
  docs/
    runbook.md
    superpowers/specs/2026-04-21-sbc-consulting-sourcing-tool-design.md
  vercel.json
  package.json
  tsconfig.json
  .env.example
```

---

## 14. Out of scope (v1)

- Email sending from the tool itself (consultants continue using their own mail-merge tool)
- LinkedIn / other enrichment sources (Apollo only)
- Google Sheets URL or `.xlsx` upload (CSV only)
- Per-row "sent" tracking (mail-merge handles this externally)
- Templates at different confidence levels rendering differently (all LOCKED rows are treated equal in sheets)
- Multi-tenant / multiple clubs on one deployment
- Slack notifications / webhooks
- Email deliverability verification beyond Apollo's built-in status field
- Rate-limiting on uploads (trusted user base; add if abuse appears)
- Mobile-optimized UI (desktop-first; responsive basics only)

---

## 15. Assumptions & known open questions

- **Apollo plan has sufficient credits.** Rough estimate: 100 net-new companies/month × ~10 samples avg = 1000 credits. Basic plan is typically 10k/month. Generous headroom.
- **Vercel Hobby is sufficient initially.** 60s function timeout is tight but workable with batch size 20 and Apollo avg 2s. If hitting timeouts, upgrade to Pro or shrink batch.
- **Google Workspace policies allow external sharing.** Admin's Drive must permit share-with-external (all `@berkeley.edu`); if SBC's Workspace restricts this, we fall back to sharing within `@berkeley.edu` only, which works since all consultants are on that domain.
- **`auth.users.id` stable.** Supabase guarantees this but noted for migration safety.
- **"SBC Consulting" is the display name everywhere** (sheet titles, email subject defaults if later added, dashboard header).
- **Berkeley domain list.** `@berkeley.edu` is the only allowed domain. If subdomains like `@haas.berkeley.edu` need allowlisting, extend the CHECK constraint.
- **Admin seat count.** Assumed one admin initially. Design supports multiple (just set `is_admin=true`); no changes needed.

---

## 16. Glossary

- **Pool** — the set of all `contacts` rows not yet pulled into a sheet
- **Enriched** — a contact row with a non-null `email` and `enrichment_status='enriched'`
- **Template** — a `(pattern, domain)` pair learned for a company, e.g., `(first.last, tesla.com)`
- **Sample** — a single Apollo lookup result used to infer a template
- **Locked** — a company whose template has been confirmed at HIGH/MED/LOW confidence
- **UNRESOLVED** — a company where we gave up on pattern detection and fall back to per-row Apollo Email Finder
- **Archived** — a `(normalized_name, company)` that has been pulled in some sheet and can never re-enter the pool
- **Pull** — the act of atomically claiming rows out of the pool into a consultant's Google Sheet

---

## 17. Design decisions deferred to implementation

These are choices where either option is fine; implementer picks whichever is cleaner at build time:

- Exact tailwind color palette and typography (will match basic Next.js + shadcn/ui defaults)
- Whether to use `React Server Components` for admin tables vs. client-side TanStack Table (probably RSC for simplicity)
- Specific Supabase migration tool (supabase CLI default)
- Whether the enrichment-progress UI uses Supabase Realtime or a `setInterval` poll (poll is simpler and fine for this scale)
- Whether to show Apollo cost in dollars or credits on the dashboard (show both, admin-toggleable)
