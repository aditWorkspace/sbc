// Wipe operational data so consultants start with a clean pool tomorrow.
// KEEPS: consultants, app_secrets (auth + config).
// WIPES: contacts, enrichment_jobs, apollo_samples, dedup_archive, sheets,
//        uploads, companies.

(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supa = createClient(url, key);

  // FK-respecting order. dedup_archive references sheets (sheet_fk), so it
  // must be wiped before sheets. apollo_samples references companies on cascade,
  // so it auto-wipes when companies go.
  const plan = [
    { table: 'contacts',         filter: { col: 'id', op: 'not.is', val: null } },
    { table: 'enrichment_jobs',  filter: { col: 'id', op: 'not.is', val: null } },
    { table: 'apollo_samples',   filter: { col: 'id', op: 'not.is', val: null } },
    { table: 'dedup_archive',    filter: { col: 'normalized_key', op: 'not.is', val: null } },
    { table: 'sheets',           filter: { col: 'id', op: 'not.is', val: null } },
    { table: 'uploads',          filter: { col: 'id', op: 'not.is', val: null } },
    { table: 'companies',        filter: { col: 'id', op: 'not.is', val: null } },
  ];

  console.log('=== BEFORE ===');
  for (const { table } of plan) {
    const { count } = await supa.from(table).select('*', { count: 'exact', head: true });
    console.log(`  ${table}: ${count ?? 0}`);
  }

  console.log('\n=== WIPING ===');
  for (const { table, filter } of plan) {
    // PostgREST requires a filter; "not is null" matches every row that has the column set.
    const { error, count } = await supa.from(table).delete({ count: 'exact' }).not(filter.col, 'is', null);
    if (error) console.log(`  ${table}: ERROR ${error.message}`);
    else console.log(`  ${table}: deleted ${count ?? '?'}`);
  }

  console.log('\n=== AFTER ===');
  for (const { table } of plan) {
    const { count } = await supa.from(table).select('*', { count: 'exact', head: true });
    console.log(`  ${table}: ${count ?? 0}`);
  }

  const { count: cc } = await supa.from('consultants').select('*', { count: 'exact', head: true });
  console.log(`\nKEPT — consultants: ${cc ?? 0}`);
})();
