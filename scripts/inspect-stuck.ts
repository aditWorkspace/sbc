(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supa = createClient(url, key);

  const { data: distinctCo } = await supa
    .from('contacts')
    .select('company_id')
    .eq('enrichment_status', 'pending')
    .limit(1000);
  const companyIds = Array.from(new Set((distinctCo ?? []).map((r: any) => r.company_id)));
  console.log(`Stuck company ids: ${companyIds.length} total`);

  for (const cid of companyIds) {
    const { data: co } = await supa.from('companies').select('*').eq('id', cid).single();
    console.log(`\n=== ${(co as any)?.name} (id=${cid}) ===`);
    console.log(`  name_normalized: ${(co as any)?.name_normalized}`);
    console.log(`  template_confidence: ${(co as any)?.template_confidence}`);
    console.log(`  template_pattern: ${(co as any)?.template_pattern}`);
    console.log(`  domain: ${(co as any)?.domain}`);
    console.log(`  samples: ${(co as any)?.sample_size}/${(co as any)?.matching_samples}`);
    console.log(`  apollo_credits_spent: ${(co as any)?.apollo_credits_spent}`);

    const { data: samples } = await supa
      .from('apollo_samples').select('*').eq('company_id', cid)
      .order('created_at', { ascending: false }).limit(5);
    console.log(`  Recent samples (${(samples ?? []).length}):`);
    for (const s of samples ?? []) {
      console.log(`    ${(s as any).person_first_name} ${(s as any).person_last_name} → ${(s as any).email_returned} (${(s as any).email_ignored_reason ?? 'matched'})`);
    }

    const { data: jobs } = await supa
      .from('enrichment_jobs').select('*').eq('company_id', cid)
      .order('created_at', { ascending: false }).limit(3);
    console.log(`  Jobs:`);
    for (const j of jobs ?? []) {
      console.log(`    status=${(j as any).status} attempts=${(j as any).attempts} last_error=${(j as any).last_error}`);
    }
  }
})();
