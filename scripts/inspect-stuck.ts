(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Pool state
  const { count: pending } = await supa.from('contacts').select('*', { count: 'exact', head: true }).eq('enrichment_status', 'pending');
  const { count: enriched } = await supa.from('contacts').select('*', { count: 'exact', head: true }).eq('enrichment_status', 'enriched');
  console.log(`Pool — pending: ${pending}, enriched: ${enriched}`);

  // Sample reasons distribution
  const { data: samples } = await supa.from('apollo_samples').select('email_ignored_reason').limit(2000);
  const reasonCount = new Map<string, number>();
  for (const s of samples ?? []) {
    const r = (s as any).email_ignored_reason ?? 'matched';
    reasonCount.set(r, (reasonCount.get(r) ?? 0) + 1);
  }
  console.log(`\nSample outcomes (${samples?.length} total):`);
  for (const [r, c] of [...reasonCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c.toString().padStart(4)}  ${r}`);
  }

  // Companies and their lock state
  const { data: cos } = await supa.from('companies').select('display_name, template_confidence, template_pattern, domain, sample_size, matching_samples, apollo_credits_spent').order('apollo_credits_spent', { ascending: false }).limit(30);
  console.log(`\nCompanies (top 30 by credits):`);
  console.log('  conf      pat            dom                  samples  match  credits  display_name');
  for (const c of cos ?? []) {
    const ca = c as any;
    console.log(`  ${ca.template_confidence.padEnd(10)} ${(ca.template_pattern ?? '-').padEnd(14)} ${(ca.domain ?? '-').padEnd(20)} ${(ca.sample_size ?? 0).toString().padStart(4)}    ${(ca.matching_samples ?? 0).toString().padStart(4)}   ${(ca.apollo_credits_spent ?? 0).toString().padStart(5)}    ${ca.display_name}`);
  }

  // Detected patterns distribution among samples that DID match
  const { data: matchedSamples } = await supa.from('apollo_samples').select('detected_pattern, detected_domain, company_id').is('email_ignored_reason', null).not('detected_pattern', 'is', null).limit(2000);
  const patternsByCompany = new Map<string, Map<string, number>>();
  for (const s of matchedSamples ?? []) {
    const cid = (s as any).company_id;
    const pat = (s as any).detected_pattern;
    if (!patternsByCompany.has(cid)) patternsByCompany.set(cid, new Map());
    const m = patternsByCompany.get(cid)!;
    m.set(pat, (m.get(pat) ?? 0) + 1);
  }
  // Show companies with >1 distinct pattern (these prevent lock)
  console.log(`\nCompanies where samples disagree on pattern (preventing lock):`);
  let mixed = 0;
  for (const [cid, pats] of patternsByCompany) {
    if (pats.size > 1) {
      const co = (cos ?? []).find((c: any) => c.id === cid);
      console.log(`  ${co ? (co as any).display_name : cid.slice(0, 8)}: ${[...pats.entries()].map(([p, n]) => `${p}=${n}`).join(', ')}`);
      mixed++;
    }
  }
  console.log(`  → ${mixed} companies with mixed patterns`);

  // Recent uploads
  const { data: ups } = await supa.from('uploads').select('id, filename, row_count_raw, row_count_admitted, status, uploaded_at').order('uploaded_at', { ascending: false }).limit(5);
  console.log(`\nRecent uploads:`);
  for (const u of ups ?? []) {
    const ua = u as any;
    console.log(`  ${ua.uploaded_at} ${ua.filename} raw=${ua.row_count_raw} admitted=${ua.row_count_admitted} status=${ua.status}`);
  }
})();
