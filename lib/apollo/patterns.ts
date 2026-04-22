import { normalize } from '@/lib/csv/normalize';

export type Pattern =
  | 'first.last' | 'first_last' | 'firstlast' | 'flast' | 'f.last'
  | 'first' | 'firstl' | 'last.first' | 'last';

type Renderer = (f: string, l: string) => string | null;
const RENDERERS: Record<Pattern, Renderer> = {
  'first.last':  (f, l) => l ? `${f}.${l}` : null,
  'first_last':  (f, l) => l ? `${f}_${l}` : null,
  'firstlast':   (f, l) => l ? `${f}${l}` : null,
  'flast':       (f, l) => f && l ? `${f[0]}${l}` : null,
  'f.last':      (f, l) => f && l ? `${f[0]}.${l}` : null,
  'first':       (f) => f || null,
  'firstl':      (f, l) => f && l ? `${f}${l[0]}` : null,
  'last.first':  (f, l) => f && l ? `${l}.${f}` : null,
  'last':        (_, l) => l || null,
};

export const PATTERN_ORDER: Pattern[] = [
  'first.last','first_last','firstlast','flast','f.last','first','firstl','last.first','last',
];

export const PERSONAL_DOMAINS = new Set([
  'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','ymail.com',
  'hotmail.com','outlook.com','live.com','msn.com',
  'aol.com','icloud.com','me.com','mac.com',
  'protonmail.com','proton.me','pm.me','zoho.com','mail.com',
]);
export function isPersonalDomain(domain: string): boolean {
  return PERSONAL_DOMAINS.has(domain.toLowerCase());
}

export function detectPattern(
  firstName: string, lastName: string | null | undefined, email: string
): { pattern: Pattern; domain: string } | null {
  const at = email.indexOf('@');
  if (at < 0) return null;
  const local = email.slice(0, at).toLowerCase();
  const domain = email.slice(at + 1).toLowerCase();
  const f = normalize(firstName);
  const l = normalize(lastName ?? '');
  for (const pattern of PATTERN_ORDER) {
    const rendered = RENDERERS[pattern](f, l);
    if (rendered === local) return { pattern, domain };
  }
  return null;
}

export function renderTemplate(
  firstName: string, lastName: string | null | undefined, pattern: Pattern, domain: string
): string | null {
  const f = normalize(firstName);
  const l = normalize(lastName ?? '');
  const local = RENDERERS[pattern](f, l);
  if (!local) return null;
  return `${local}@${domain}`;
}
