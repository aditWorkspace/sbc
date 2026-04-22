import { normalize } from '@/lib/csv/normalize';

/**
 * Comprehensive corporate email pattern knowledge base.
 *
 * Each pattern is documented with a real-world example company that uses it,
 * so the detector can recognize almost any corporate email-template style
 * without hitting Icypeas.
 *
 * Order in PATTERN_ORDER matters — detectPattern tries each in sequence and
 * returns the FIRST match. More specific patterns (with separators) come
 * before ambiguous ones so we prefer the more-informative match.
 *
 * For "John Smith" at "acme.com":
 *
 *   1.  first.last       — john.smith        (Google, Apple, Microsoft, Meta, HubSpot)
 *   2.  first_last       — john_smith        (academic, some Asian corps)
 *   3.  first-last       — john-smith        (European firms, French/German-speaking)
 *   4.  first.l          — john.s            (rare formal abbreviation)
 *   5.  flast            — jsmith            (Amazon, IBM, legacy banks/enterprise)
 *   6.  f.last           — j.smith           (legal, European formal)
 *   7.  f-last           — j-smith           (rare European hyphen variant)
 *   8.  f_last           — j_smith           (rare underscore variant)
 *   9.  last.first       — smith.john        (academic institutions, some law firms)
 *  10.  last_first       — smith_john        (rare symmetric variant)
 *  11.  last.f           — smith.j           (Oxford/Cambridge, some law firms)
 *  12.  lastf            — smithj            (JP Morgan historical, some financial)
 *  13.  firstlast        — johnsmith         (mixed / varies by company)
 *  14.  firstl2          — johnsm            (rare — first + 2 chars of last)
 *  15.  firstl           — johns             (rare — first + 1 char of last)
 *  16.  first            — john              (OpenAI, Stripe, Anthropic — startup common)
 *  17.  last             — smith             (rare, usually when name is unique-enough)
 */
export type Pattern =
  | 'first.last' | 'first_last' | 'first-last' | 'first.l'
  | 'flast' | 'f.last' | 'f-last' | 'f_last'
  | 'last.first' | 'last_first' | 'last.f' | 'lastf'
  | 'firstlast' | 'firstl2' | 'firstl'
  | 'first' | 'last';

type Renderer = (f: string, l: string) => string | null;

const RENDERERS: Record<Pattern, Renderer> = {
  // Separator-based — most specific; nearly unambiguous
  'first.last':  (f, l) => f && l ? `${f}.${l}` : null,
  'first_last':  (f, l) => f && l ? `${f}_${l}` : null,
  'first-last':  (f, l) => f && l ? `${f}-${l}` : null,
  'first.l':     (f, l) => f && l ? `${f}.${l[0]}` : null,
  'flast':       (f, l) => f && l ? `${f[0]}${l}` : null,
  'f.last':      (f, l) => f && l ? `${f[0]}.${l}` : null,
  'f-last':      (f, l) => f && l ? `${f[0]}-${l}` : null,
  'f_last':      (f, l) => f && l ? `${f[0]}_${l}` : null,
  // Reversed (last-first) — academic + some legal/financial
  'last.first':  (f, l) => f && l ? `${l}.${f}` : null,
  'last_first':  (f, l) => f && l ? `${l}_${f}` : null,
  'last.f':      (f, l) => f && l ? `${l}.${f[0]}` : null,
  'lastf':       (f, l) => f && l ? `${l}${f[0]}` : null,
  // No-separator concatenations — more ambiguous, lower priority
  'firstlast':   (f, l) => f && l ? `${f}${l}` : null,
  'firstl2':     (f, l) => f && l.length >= 3 ? `${f}${l.slice(0, 2)}` : null,  // ≥3 so it differs from firstlast
  'firstl':      (f, l) => f && l ? `${f}${l[0]}` : null,
  // Single-part patterns — least specific, last resort
  'first':       (f) => f || null,
  'last':        (_, l) => l || null,
};

export const PATTERN_ORDER: Pattern[] = [
  // Separator patterns first (most specific)
  'first.last', 'first_last', 'first-last', 'first.l',
  'flast', 'f.last', 'f-last', 'f_last',
  'last.first', 'last_first', 'last.f', 'lastf',
  // Concatenations (more specific before less specific)
  'firstlast', 'firstl2', 'firstl',
  // Single-part (last resort)
  'first', 'last',
];

export const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me', 'pm.me',
  'zoho.com', 'mail.com', 'gmx.com', 'gmx.net',
  'fastmail.com', 'tutanota.com', 'yandex.com', 'yandex.ru',
  '163.com', 'qq.com', '126.com',  // common Chinese personal
  'naver.com', 'daum.net',  // common Korean personal
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
