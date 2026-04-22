const ALIASES: Record<'first_name'|'last_name'|'company', string[]> = {
  first_name: ['first name','firstname','first_name','fname','given name','given_name','first'],
  last_name:  ['last name','lastname','last_name','lname','surname','family name','last'],
  company:    ['company','company name','organization','organisation','org','employer','firm','account','company_name'],
};

export interface ColumnMap {
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  unresolved: ('first_name'|'last_name'|'company')[];
}

export function mapColumnsByAlias(headers: string[]): ColumnMap {
  const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z]/g, '');
  const headerMap = new Map(headers.map(h => [norm(h), h]));
  const out: ColumnMap = { first_name: null, last_name: null, company: null, unresolved: [] };
  for (const field of ['first_name','last_name','company'] as const) {
    for (const alias of ALIASES[field]) {
      const h = headerMap.get(norm(alias));
      if (h) { out[field] = h; break; }
    }
    if (out[field] === null) out.unresolved.push(field);
  }
  return out;
}
