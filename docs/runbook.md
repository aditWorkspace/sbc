# SBC Sourcing Tool — Operations Runbook

Concrete procedures for running, deploying, and recovering the tool. Copy-paste commands where possible.

## Initial deploy checklist

1. **Database schema** — already applied by CLI in the build process. If starting fresh against a new Supabase project:
   ```bash
   supabase link --project-ref <ref>
   supabase db push --yes
   ```

2. **Admin email** — replace the placeholder if you haven't:
   ```sql
   update consultants set email = 'your.email@berkeley.edu', display_name = 'Your Name'
     where email = 'TO_BE_REPLACED@berkeley.edu';
   ```
   Already done for `aditmittal@berkeley.edu`.

3. **Supabase Auth — Google provider:** In the Supabase dashboard → Authentication → Providers → Google, enable it with the client ID / client secret (same as in `.env.local`). Set the authorized redirect URI to:
   ```
   https://ptcpvpuybbigametwfbo.supabase.co/auth/v1/callback
   ```
   Also add the `@berkeley.edu` hosted-domain restriction: in "Additional OAuth scopes" leave empty; in "Allow list of domains to login" (if the option exists) enter `berkeley.edu`.

4. **Google Cloud OAuth — redirect URIs:** In the Google Cloud Console for your OAuth 2.0 client, add these Authorized redirect URIs:
   ```
   http://localhost:3010/auth/callback            (local consultant sign-in)
   http://localhost:3010/oauth/callback           (local admin setup script)
   https://ptcpvpuybbigametwfbo.supabase.co/auth/v1/callback   (Supabase Auth Google)
   https://<your-vercel-domain>/auth/callback     (production consultant sign-in)
   ```

5. **Vercel env vars:** run `vercel link` from the repo root, then:
   ```bash
   vercel env add NEXT_PUBLIC_SUPABASE_URL
   vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
   vercel env add SUPABASE_SERVICE_ROLE_KEY
   vercel env add APOLLO_API_KEY
   vercel env add OPENROUTER_API_KEY
   vercel env add GOOGLE_OAUTH_CLIENT_ID
   vercel env add GOOGLE_OAUTH_CLIENT_SECRET
   vercel env add GOOGLE_OAUTH_REDIRECT_URI
   vercel env add CRON_SECRET
   ```
   `CRON_SECRET`: use `openssl rand -hex 32`. Vercel attaches `Authorization: Bearer <CRON_SECRET>` automatically to cron requests.

6. **First deploy:**
   ```bash
   vercel deploy --prod
   ```

7. **Admin Google OAuth refresh token** (required for sheet creation):
   ```bash
   pnpm exec tsx scripts/setup-admin-oauth.ts
   ```
   Opens your browser, you sign in to Google with whichever account should own the generated sheets (recommended: `aditarcadedude14@gmail.com` since that's the Google Cloud project owner), approve, and the refresh token is stored in Supabase Vault. One-time — rerun only if revoked.

## Common ops

### Add a new consultant
Admin UI → Consultants tab → "Add email" → enter `x@berkeley.edu`. OR via SQL:
```sql
insert into consultants (email, is_approved, approved_at)
  values ('x@berkeley.edu', true, now());
```

### Promote / demote admin
```sql
update consultants set is_admin = true where email = 'x@berkeley.edu';
```

### Rotate `CRON_SECRET`
```bash
vercel env rm CRON_SECRET
vercel env add CRON_SECRET  # paste new value
vercel deploy --prod
```

### Re-run admin Google OAuth (after token revoke)
```bash
pnpm exec tsx scripts/setup-admin-oauth.ts
```

### Apollo credits exhausted
After topping up at apollo.io, re-queue any paused jobs:
```sql
update enrichment_jobs set status = 'queued', last_error = null
  where last_error = 'credits_exhausted';
```

### Force-refresh a bad template
Admin UI → Templates tab → Force refresh on the row. OR SQL:
```sql
update companies set template_confidence = 'UNKNOWN', template_pattern = null, domain = null,
  sample_size = 0, matching_samples = 0, locked_at = null
  where name_normalized = '<normalized>';
insert into enrichment_jobs (company_id) select id from companies where name_normalized = '<normalized>';
```

### Manually delete a pool row
Admin UI → Pool tab → delete. OR:
```sql
delete from contacts where id = '<uuid>';
```

### Release a dedup_archive entry (allow re-upload)
```sql
delete from dedup_archive where normalized_key = '<key>';
```

### Recover sole-admin lockout
Connect via Supabase SQL editor (service role):
```sql
update consultants set deactivated_at = null, is_approved = true, is_admin = true
  where email = 'your.email@berkeley.edu';
```
If auth user was deleted, re-sign-in from your email will create a fresh row via the `resolve_consultant` RPC.

### Inspect failed enrichment jobs
```sql
select id, company_id, attempts, last_error, created_at
  from enrichment_jobs where status = 'failed'
  order by created_at desc limit 20;
```

### Emergency pool-wide freeze
```sql
update enrichment_jobs set status = 'failed'
  where status in ('queued','running');
```

### Local dev loop
```bash
pnpm dev           # http://localhost:3010
pnpm test          # unit + integration
pnpm test:e2e      # Playwright
pnpm run typecheck
```

## Enrichment cron trigger (Vercel Hobby workaround)

Vercel Hobby only allows **daily** cron schedules. The enrichment worker should run every minute. Two options:

**Option A (recommended — free):** Use an external cron service to ping the endpoint every minute:

1. Sign up at **https://cron-job.org** (free, no credit card)
2. Create a new cron job:
   - URL: `https://<your-vercel-domain>/api/cron/enrich`
   - Schedule: every 1 minute
   - HTTP method: GET
   - Headers: `Authorization: Bearer <CRON_SECRET>` (copy from `.env.local`)
3. Save — it'll start hitting your endpoint every minute

**Option B:** Upgrade Vercel to Pro ($20/user/mo), which unlocks minute-level crons. Then restore the cron in `vercel.json`:
```json
{ "path": "/api/cron/enrich", "schedule": "* * * * *" }
```

Until one of these is set up, enrichment jobs sit queued until manually triggered:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-vercel-domain>/api/cron/enrich
```

The cleanup cron (daily 09:00 UTC = 02:00 PT in PDT) stays on Vercel Cron — daily is fine under Hobby.

## Known limits

- Vercel Hobby function timeout: 60s. Enrichment worker processes 10 jobs/tick — if Apollo slows, cron may time out; the next tick picks up unfinished work.
- Supabase free tier: 500MB database. Audit tables (apollo_samples, dedup_archive) grow ~linearly with usage; monitor.
- Apollo Basic plan: 10k credits/month. 1 credit per returned work-email. A month of heavy usage (100 new companies/mo) costs ≈ 1000-2000 credits.
- LLM daily cap: 2M tokens (soft cap in `lib/llm/budget.ts`), roughly \$1/day on Gemini Flash 8b.

## Security hygiene

- Rotate the Apollo / OpenRouter / Google-OAuth-secret that were pasted in development chat logs.
- Rotate `SUPABASE_SERVICE_ROLE_KEY` before going live (Supabase dashboard → Settings → API → "Roll" button on the service_role row).
- `CRON_SECRET` should be regenerated at least annually.
- The Supabase service role key has full DB access — it's only used server-side in Vercel; never in client code.
