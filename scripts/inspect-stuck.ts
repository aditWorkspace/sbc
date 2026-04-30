(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supa = createClient(url, key);

  console.log('=== apollo_samples (most recent 30) ===');
  const { data: ss } = await supa.from('apollo_samples').select('*').order('id', { ascending: false }).limit(30);
  for (const s of ss ?? []) {
    const sa = s as any;
    console.log(`  ${sa.person_first_name} ${sa.person_last_name} → ${sa.email_returned ?? '(none)'} pat=${sa.detected_pattern ?? '-'} reason=${sa.email_ignored_reason ?? 'matched'}`);
  }
  console.log(`Total samples: ${ss?.length}`);

  console.log('\n=== Companies (full) ===');
  const { data: cos } = await supa.from('companies').select('*').limit(50);
  for (const c of cos ?? []) {
    const ca = c as any;
    console.log(`  "${ca.display_name}" id=${ca.id.slice(0,8)} conf=${ca.template_confidence} pat=${ca.template_pattern} dom=${ca.domain} samples=${ca.matching_samples}/${ca.sample_size} credits=${ca.apollo_credits_spent}`);
  }

  console.log('\n=== Jobs (all) ===');
  const { data: jobs } = await supa.from('enrichment_jobs').select('*');
  for (const j of jobs ?? []) {
    const ja = j as any;
    console.log(`  co=${ja.company_id.slice(0,8)} status=${ja.status} attempts=${ja.attempts} last_error=${ja.last_error}`);
  }

  console.log('\n=== Contact status counts ===');
  for (const status of ['pending', 'enriched']) {
    const { count } = await supa.from('contacts').select('*', { count: 'exact', head: true }).eq('enrichment_status', status);
    console.log(`  ${status}: ${count ?? 0}`);
  }
})();
