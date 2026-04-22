import Papa from 'papaparse';

export interface ParsedCsv { headers: string[]; rows: Record<string, string>[] }

export function parseCsv(text: string): ParsedCsv {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transform: (v) => (typeof v === 'string' ? v.trim() : v),
  });
  const headers = (result.meta.fields ?? []).map(h => h.trim());
  const rows = (result.data ?? []).filter(r => Object.values(r).some(v => v && v.length));
  return { headers, rows };
}
