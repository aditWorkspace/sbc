(async () => {
  const { icypeasBulkMatch } = await import('@/lib/icypeas/client');

  const cases = [
    { first_name: 'Emily',   last_name: 'Baum',     organization_name: 'KCC' },
    { first_name: 'Erin',    last_name: 'Ehmke',    organization_name: 'KCC' },
    { first_name: 'Forest',  last_name: 'Himmelfarb', organization_name: 'Meta' },
    { first_name: 'Gary',    last_name: 'Willis',   organization_name: 'Meta' },
    { first_name: 'Heiko',   last_name: 'Schaefer', organization_name: 'Meta' },
  ];

  console.log('Probing Icypeas for stuck contacts...');
  const t0 = Date.now();
  try {
    const r = await icypeasBulkMatch(cases);
    console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
    r.matches.forEach((m, i) => {
      const c = cases[i]!;
      const tag = m === undefined ? 'TRANSIENT' : m === null ? 'NO MATCH' : `FOUND ${m.email}`;
      console.log(`[${c.organization_name}] ${c.first_name} ${c.last_name}: ${tag}`);
    });
  } catch (e) {
    console.error('THREW:', (e as Error).message);
  }
})();
