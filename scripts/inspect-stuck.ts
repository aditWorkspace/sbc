(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const { processEnrichmentJob } = await import('@/lib/enrichment/process-job');
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Find google.com company + my test consultant
  const { data: co } = await supa.from('companies').select('*').eq('name_normalized', 'googlecom').single();
  const coId = (co as any).id;
  const { data: cons } = await supa.from('consultants').select('id').eq('email', 'system-e2e@berkeley.edu').single();
  const consId = (cons as any).id;

  // Wipe state for google
  console.log('Wiping state for google.com...');
  await supa.from('apollo_samples').delete().eq('company_id', coId);
  await supa.from('contacts').delete().eq('company_id', coId);
  await supa.from('companies').update({
    template_confidence: 'UNKNOWN', template_pattern: null, domain: null,
    sample_size: 0, matching_samples: 0, locked_at: null, apollo_credits_spent: 0,
  }).eq('id', coId);

  // Need an upload row
  const { data: up } = await supa.from('uploads').insert({
    consultant_id: consId, filename: 'trace-test.csv', row_count_raw: 1,
  }).select('id').single();

  // Insert exactly 1 contact: Sundar
  console.log('Inserting Sundar...');
  const { data: ins } = await supa.from('contacts').insert({
    first_name: 'Sundar', last_name: 'Pichai',
    first_name_normalized: 'sundar', last_name_normalized: 'pichai',
    company_id: coId, company_display: 'google.com',
    normalized_key: `sundar|pichai|googlecom-${Date.now()}`,
    enrichment_status: 'pending',
    uploaded_by: consId, upload_id: (up as any).id,
  }).select('id').single();
  console.log(`Sundar id=${(ins as any).id}`);

  // Call processEnrichmentJob directly
  console.log('\nCalling processEnrichmentJob locally...');
  const t0 = Date.now();
  await processEnrichmentJob(supa, coId);
  console.log(`Done in ${Date.now() - t0}ms`);

  // Check Sundar's state
  const { data: after } = await supa.from('contacts').select('*').eq('id', (ins as any).id).maybeSingle();
  console.log('\nSundar state after:');
  console.log(after);

  // Check sample
  const { data: s } = await supa.from('apollo_samples').select('*').eq('company_id', coId).order('id', { ascending: false }).limit(1);
  console.log('\nSample:');
  console.log(s?.[0]);

  // Check company state
  const { data: co2 } = await supa.from('companies').select('*').eq('id', coId).single();
  console.log('\nCompany state:');
  console.log(co2);
})();
