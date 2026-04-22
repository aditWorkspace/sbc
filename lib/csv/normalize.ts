export function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s.toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');
}
export function buildNormalizedKey(firstNorm: string, lastNorm: string, companyNorm: string): string {
  return `${firstNorm}|${lastNorm}|${companyNorm}`;
}
