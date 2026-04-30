(async () => {
  const { icypeasBulkMatch } = await import('@/lib/icypeas/client');

  // 10 contacts in one batch (matches BATCH=10 in process-job.ts)
  const cases = [
    { first_name: 'Emily',   last_name: 'Baum',     organization_name: 'KCC' },
    { first_name: 'Erin',    last_name: 'Ehmke',    organization_name: 'KCC' },
    { first_name: 'Euan',    last_name: 'Anderson', organization_name: 'KCC' },
    { first_name: 'Forest',  last_name: 'Himmelfarb', organization_name: 'KCC' },
    { first_name: 'Gary',    last_name: 'Ludvigson', organization_name: 'KCC' },
    { first_name: 'Forest',  last_name: 'Himmelfarb', organization_name: 'Meta' },
    { first_name: 'Gary',    last_name: 'Willis',   organization_name: 'Meta' },
    { first_name: 'Heiko',   last_name: 'Schaefer', organization_name: 'Meta' },
    { first_name: 'Jon',     last_name: 'Dietz',    organization_name: 'Meta' },
    { first_name: 'Josie',   last_name: 'Adams',    organization_name: 'Meta' },
  ];

  console.log('Probing Icypeas with 10 stuck contacts...');
  const t0 = Date.now();
  try {
    const r = await icypeasBulkMatch(cases);
    console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
    let transient = 0, noMatch = 0, found = 0;
    r.matches.forEach((m, i) => {
      const c = cases[i]!;
      let tag = '';
      if (m === undefined) { transient++; tag = 'TRANSIENT (undefined)'; }
      else if (m === null) { noMatch++; tag = 'NO MATCH (null)'; }
      else { found++; tag = `FOUND ${m.email}`; }
      console.log(`[${c.organization_name}] ${c.first_name} ${c.last_name}: ${tag}`);
    });
    console.log(`\nSummary: ${found} found, ${noMatch} no-match, ${transient} transient`);
  } catch (e) {
    console.error('THREW:', (e as Error).message);
  }
})();
