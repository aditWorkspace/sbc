(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supa = createClient(url, key);

  // Recent uploads
  const { data: uploads } = await supa
    .from('uploads').select('*').order('created_at', { ascending: false }).limit(5);
  console.log('=== Recent uploads ===');
  for (const u of uploads ?? []) {
    console.log(`  ${(u as any).created_at} ${(u as any).filename} raw=${(u as any).row_count_raw} admitted=${(u as any).row_count_admitted} status=${(u as any).status}`);
  }

  // Pending by company
  const { data: distinctCo } = await supa
    .from('contacts').select('company_id, company_display, created_at')
    .eq('enrichment_status', 'pending').limit(2000);
  const byCo = new Map<string, { name: string; count: number; latest: string }>();
  for (const r of distinctCo ?? []) {
    const k = (r as any).company_id;
    const e = byCo.get(k) ?? { name: (r as any).company_display, count: 0, latest: '' };
    e.count++;
    if (!e.latest || (r as any).created_at > e.latest) e.latest = (r as any).created_at;
    byCo.set(k, e);
  }
  console.log(`\n=== Pending by company (${distinctCo?.length} total) ===`);
  [...byCo.values()].sort((a, b) => b.count - a.count).forEach(c =>
    console.log(`  ${c.count.toString().padStart(4)} contacts — "${c.name}" (latest ${c.latest})`));

  // Job state for each
  console.log('\n=== Jobs ===');
  for (const cid of byCo.keys()) {
    const { data: jobs } = await supa
      .from('enrichment_jobs').select('*').eq('company_id', cid)
      .order('created_at', { ascending: false }).limit(2);
    const co = byCo.get(cid)!;
    console.log(`  "${co.name}":`);
    for (const j of jobs ?? []) {
      console.log(`    ${(j as any).status} attempts=${(j as any).attempts} last_error=${(j as any).last_error}`);
    }
  }
})();
