import { normalize } from '@/lib/csv/normalize';

export interface RawRow { first_name?: string; last_name?: string; company?: string }
export interface ValidRow {
  first_name: string;
  last_name: string | null;
  company_display: string;
  first_name_normalized: string;
  last_name_normalized: string;
  company_normalized: string;
}

const MAX_FIELD_LEN = 200;

export function validateRow(r: RawRow): ValidRow | null {
  const first = (r.first_name ?? '').trim();
  const last = (r.last_name ?? '').trim();
  const company = (r.company ?? '').trim();
  if (!first || !company) return null;
  if (first.length > MAX_FIELD_LEN || company.length > MAX_FIELD_LEN || last.length > MAX_FIELD_LEN) return null;
  const fn = normalize(first);
  const cn = normalize(company);
  if (!fn || !cn) return null;
  return {
    first_name: first,
    last_name: last || null,
    company_display: company,
    first_name_normalized: fn,
    last_name_normalized: normalize(last),
    company_normalized: cn,
  };
}
