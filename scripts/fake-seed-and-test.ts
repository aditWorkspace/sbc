// Self-contained end-to-end test.
// - Seeds N fake contacts (already enriched, bypassing Icypeas)
// - Runs the REAL pull_sheet RPC
// - Calls the REAL createSheetForConsultant with the pulled rows
// - Reports the actual Google Sheets error if any, verbatim
// Usage: pnpm exec tsx scripts/fake-seed-and-test.ts [rowCount]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvLocal();

import { createClient } from '@supabase/supabase-js';
import { createSheetForConsultant, describeGoogleError } from '@/lib/google/sheets';
import { buildNormalizedKey, normalize } from '@/lib/csv/normalize';

const TARGET_ROWS = Number(process.argv[2] ?? 1000);
// Uses real Berkeley email so Google's Drive share doesn't reject it as non-existent.
const TEST_EMAIL = 'aditmittal@berkeley.edu';

const FIRST_NAMES = ['Ava','Bob','Carla','Dan','Erin','Frank','Grace','Hank','Iris','Jack','Kate','Liam','Maya','Noah','Olivia','Paul','Quinn','Ruth','Sam','Tara','Uma','Victor','Wendy','Xavier','Yara','Zack','Alex','Beth','Chris','Diana'];
const LAST_NAMES = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Lopez','Wilson','Anderson','Taylor','Thomas','Hernandez','Moore','Martin','Jackson','Thompson','White','Harris'];
const COMPANIES = ['Acme','Globex','Initech','Umbrella','Stark','Wayne','Wonka','Aperture','Cyberdyne','Tyrell','Soylent','Vault-Tec','Dunder Mifflin','Pied Piper','Hooli','Gringotts','Weyland','Monsters Inc','Planet Express','Oscorp','Massive Dynamic','Los Pollos','Nakatomi','Cheers','MomCorp'];
const DOMAINS = ['acme.test','globex.test','initech.test','umbrella.test','stark.test','wayne.test','wonka.test','aperture.test','cyberdyne.test','tyrell.test','soylent.test','vaulttec.test','dundermifflin.test','piedpiper.test','hooli.test','gringotts.test','weyland.test','monstersinc.test','planetexpress.test','oscorp.test','massive.test','lospollos.test','nakatomi.test','cheers.test','momcorp.test'];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }

async function main() {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  console.log(`[1] Ensuring test consultant '${TEST_EMAIL}' exists...`);
  const { data: existing } = await supa.from('consultants').select('*').eq('email', TEST_EMAIL).maybeSingle();
  let consultantId: string;
  if (existing) {
    consultantId = existing.id;
    console.log(`    Found existing id=${consultantId.slice(0, 8)}...`);
  } else {
    const { data: inserted, error } = await supa.from('consultants').insert({
      email: TEST_EMAIL, display_name: 'E2E Fake Tester', is_approved: true,
      approved_at: new Date().toISOString(),
    }).select('id').single();
    if (error) throw error;
    consultantId = inserted!.id;
    console.log(`    Created id=${consultantId.slice(0, 8)}...`);
  }

  console.log(`[2] Clearing prior test data for this consultant...`);
  await supa.from('contacts').delete().eq('uploaded_by', consultantId);
  await supa.from('uploads').delete().eq('consultant_id', consultantId);
  await supa.from('sheets').delete().eq('consultant_id', consultantId);

  console.log(`[3] Creating upload row...`);
  const { data: uploadRow, error: upErr } = await supa.from('uploads').insert({
    consultant_id: consultantId, filename: 'fake-1000.csv',
    row_count_raw: TARGET_ROWS, row_count_admitted: 0, status: 'processing',
  }).select('id').single();
  if (upErr) throw upErr;
  const uploadId = uploadRow!.id;

  console.log(`[4] Ensuring ${COMPANIES.length} test companies exist in DB...`);
  for (let i = 0; i < COMPANIES.length; i++) {
    const name = COMPANIES[i]!;
    const nameNorm = normalize(name);
    const domain = DOMAINS[i]!;
    const { data: existing } = await supa.from('companies').select('id').eq('name_normalized', nameNorm).maybeSingle();
    if (existing) continue;
    await supa.from('companies').insert({
      name_normalized: nameNorm, display_name: name, domain,
      template_pattern: 'first.last', template_confidence: 'HIGH',
      sample_size: 3, matching_samples: 3,
      locked_at: new Date().toISOString(),
    });
  }
  const { data: companyRows } = await supa.from('companies').select('id,name_normalized,display_name,domain').in('name_normalized', COMPANIES.map(normalize));
  const companyByNorm = new Map((companyRows ?? []).map(c => [c.name_normalized as string, c]));

  console.log(`[5] Generating ${TARGET_ROWS} fake contacts (pre-enriched, skipping Icypeas)...`);
  const BATCH = 500;
  const usedKeys = new Set<string>();
  let inserted = 0;
  while (inserted < TARGET_ROWS) {
    const rows: Array<Record<string, unknown>> = [];
    while (rows.length < BATCH && inserted + rows.length < TARGET_ROWS) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const suffix = Math.floor(Math.random() * 10000);
      const firstDisp = `${first}${suffix}`;
      const lastDisp = last;
      const company = companyByNorm.get(pick(COMPANIES.map(normalize)))!;
      const fNorm = normalize(firstDisp);
      const lNorm = normalize(lastDisp);
      const key = buildNormalizedKey(fNorm, lNorm, company.name_normalized as string);
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      rows.push({
        first_name: firstDisp,
        last_name: lastDisp,
        first_name_normalized: fNorm,
        last_name_normalized: lNorm,
        company_id: company.id,
        company_display: company.display_name,
        normalized_key: key,
        email: `${fNorm}.${lNorm}@${company.domain}`,
        email_source: 'template',
        enrichment_status: 'enriched',
        enriched_at: new Date().toISOString(),
        uploaded_by: consultantId,
        upload_id: uploadId,
      });
    }
    const { error } = await supa.from('contacts').insert(rows);
    if (error) { console.error('    Insert error:', error.message); throw error; }
    inserted += rows.length;
    process.stdout.write(`    ${inserted}/${TARGET_ROWS}\r`);
  }
  console.log(`    Inserted ${inserted} fake contacts.`);

  await supa.from('uploads').update({
    row_count_admitted: inserted, status: 'complete', completed_at: new Date().toISOString(),
  }).eq('id', uploadId);

  console.log(`[6] Calling pull_sheet RPC for 300 rows...`);
  const { data: pulledRows, error: pullErr } = await supa.rpc('pull_sheet', {
    p_consultant_id: consultantId, p_max_rows: 300,
  });
  if (pullErr) { console.error('    pull_sheet error:', pullErr); throw pullErr; }
  const rowsPulled = (pulledRows ?? []) as Array<{
    id: string; first_name: string; last_name: string | null;
    company_display: string; email: string | null;
    uploaded_by: string; normalized_key: string;
  }>;
  console.log(`    Pulled ${rowsPulled.length} rows from pool.`);
  if (rowsPulled.length === 0) { console.error('    No rows pulled — aborting sheet creation test.'); process.exit(1); }

  console.log(`[7] Reading Google refresh token from Vault...`);
  const { data: tokenData, error: tokenErr } = await supa.rpc('vault_read_secret', { secret_name: 'google_oauth_refresh_token' });
  if (tokenErr || !tokenData) {
    console.error('    Vault read failed:', tokenErr);
    process.exit(1);
  }
  const refreshToken = tokenData as unknown as string;
  console.log(`    Token prefix: ${String(refreshToken).slice(0, 12)}...`);

  console.log(`[8] Calling createSheetForConsultant — THIS IS THE CRITICAL TEST...`);
  try {
    const result = await createSheetForConsultant({
      consultant: { email: TEST_EMAIL, display_name: 'E2E Fake Tester' },
      rows: rowsPulled.map(r => ({
        full_name: `${r.first_name} ${r.last_name ?? ''}`.trim(),
        first_name: r.first_name,
        company_display: r.company_display,
        email: r.email ?? '',
      })),
      refreshToken,
    });
    console.log(`    ✅ SUCCESS: ${result.url}`);
    console.log(`    Spreadsheet ID: ${result.id}`);
  } catch (err) {
    console.error(`    ❌ FAIL: ${describeGoogleError(err)}`);
    console.error(`    Raw error:`, err);
    process.exit(1);
  }
  console.log(`\n🎉 Full pipeline works end-to-end.`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
