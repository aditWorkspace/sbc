import { describe, it, expect } from 'vitest';
import { detectPattern, renderTemplate, isPersonalDomain, PATTERN_ORDER, type Pattern } from '@/lib/apollo/patterns';

// Round-trip test: for each pattern, render the template then detect it back.
// Guarantees every pattern is both producible and recognizable.
describe('pattern round-trip — detect(render(p)) matches same output', () => {
  const FIXTURES: { first: string; last: string; domain: string }[] = [
    { first: 'John',  last: 'Smith',     domain: 'acme.com' },
    { first: 'José',  last: 'Ávila',     domain: 'spotify.com' },
    { first: 'Sundar', last: 'Pichai',   domain: 'google.com' },
    { first: 'Ada',   last: 'Lovelace',  domain: 'example.org' },
  ];

  for (const fx of FIXTURES) {
    for (const p of PATTERN_ORDER) {
      it(`[${p}] ${fx.first} ${fx.last} @ ${fx.domain}`, () => {
        const rendered = renderTemplate(fx.first, fx.last, p, fx.domain);
        if (!rendered) return; // pattern may return null for short names (firstl2 requires last.length >= 3)
        const detected = detectPattern(fx.first, fx.last, rendered);
        expect(detected).not.toBeNull();
        expect(detected!.domain).toBe(fx.domain);
        // Contract: detected pattern must re-render to the SAME local-part
        // (collisions are fine; the winning pattern just needs to be equivalent).
        const reRendered = renderTemplate(fx.first, fx.last, detected!.pattern, fx.domain);
        expect(reRendered).toBe(rendered);
      });
    }
  }
});

describe('detectPattern — concrete emails', () => {
  it('first.last', () => expect(detectPattern('John','Smith','john.smith@tesla.com')).toEqual({pattern:'first.last', domain:'tesla.com'}));
  it('firstlast',  () => expect(detectPattern('John','Smith','johnsmith@tesla.com')).toEqual({pattern:'firstlast', domain:'tesla.com'}));
  it('flast',      () => expect(detectPattern('John','Smith','jsmith@tesla.com')).toEqual({pattern:'flast', domain:'tesla.com'}));
  it('f.last',     () => expect(detectPattern('John','Smith','j.smith@tesla.com')).toEqual({pattern:'f.last', domain:'tesla.com'}));
  it('f-last',     () => expect(detectPattern('John','Smith','j-smith@tesla.com')).toEqual({pattern:'f-last', domain:'tesla.com'}));
  it('f_last',     () => expect(detectPattern('John','Smith','j_smith@tesla.com')).toEqual({pattern:'f_last', domain:'tesla.com'}));
  it('first',      () => expect(detectPattern('John','Smith','john@tesla.com')).toEqual({pattern:'first', domain:'tesla.com'}));
  it('first_last', () => expect(detectPattern('John','Smith','john_smith@tesla.com')).toEqual({pattern:'first_last', domain:'tesla.com'}));
  it('first-last', () => expect(detectPattern('John','Smith','john-smith@tesla.com')).toEqual({pattern:'first-last', domain:'tesla.com'}));
  it('first.l',    () => expect(detectPattern('John','Smith','john.s@tesla.com')).toEqual({pattern:'first.l', domain:'tesla.com'}));
  it('firstl',     () => expect(detectPattern('John','Smith','johns@tesla.com')).toEqual({pattern:'firstl', domain:'tesla.com'}));
  it('firstl2',    () => expect(detectPattern('John','Smith','johnsm@tesla.com')).toEqual({pattern:'firstl2', domain:'tesla.com'}));
  it('last.first', () => expect(detectPattern('John','Smith','smith.john@tesla.com')).toEqual({pattern:'last.first', domain:'tesla.com'}));
  it('last_first', () => expect(detectPattern('John','Smith','smith_john@tesla.com')).toEqual({pattern:'last_first', domain:'tesla.com'}));
  it('last.f',     () => expect(detectPattern('John','Smith','smith.j@tesla.com')).toEqual({pattern:'last.f', domain:'tesla.com'}));
  it('lastf',      () => expect(detectPattern('John','Smith','smithj@tesla.com')).toEqual({pattern:'lastf', domain:'tesla.com'}));
  it('last',       () => expect(detectPattern('John','Smith','smith@tesla.com')).toEqual({pattern:'last', domain:'tesla.com'}));
  it('normalizes diacritics', () => expect(detectPattern('José','Ávila','jose.avila@acme.co')).toEqual({pattern:'first.last', domain:'acme.co'}));
  it('lowercases domain', () => expect(detectPattern('Jane','Doe','jane.doe@Foo.COM')?.domain).toBe('foo.com'));
  it('no match', () => expect(detectPattern('Jane','Doe','custom-vanity@foo.com')).toBeNull());
});

describe('renderTemplate', () => {
  it('first.last', () => expect(renderTemplate('John','Smith','first.last','tesla.com')).toBe('john.smith@tesla.com'));
  it('flast', () => expect(renderTemplate('John','Smith','flast','tesla.com')).toBe('jsmith@tesla.com'));
  it('first', () => expect(renderTemplate('John','Smith','first','tesla.com')).toBe('john@tesla.com'));
  it('firstl2 (3+ char last)', () => expect(renderTemplate('John','Smith','firstl2','tesla.com')).toBe('johnsm@tesla.com'));
  it('firstl2 rejects short last (<3 char)', () => expect(renderTemplate('John','Li','firstl2','tesla.com')).toBeNull());
  it('lastf', () => expect(renderTemplate('John','Smith','lastf','jpm.com')).toBe('smithj@jpm.com'));
  it('last.f', () => expect(renderTemplate('John','Smith','last.f','ox.ac.uk')).toBe('smith.j@ox.ac.uk'));
  it('first-last', () => expect(renderTemplate('Jean','Dupont','first-last','totalenergies.com')).toBe('jean-dupont@totalenergies.com'));
  it('null if last missing for last-needing pattern',
    () => expect(renderTemplate('Madonna','','flast','records.com')).toBeNull());
  it('first works without last',
    () => expect(renderTemplate('Madonna','','first','records.com')).toBe('madonna@records.com'));
});

describe('isPersonalDomain', () => {
  it('gmail', () => expect(isPersonalDomain('gmail.com')).toBe(true));
  it('tesla', () => expect(isPersonalDomain('tesla.com')).toBe(false));
  it('case-insensitive', () => expect(isPersonalDomain('Gmail.COM')).toBe(true));
  it('naver (Korean personal)', () => expect(isPersonalDomain('naver.com')).toBe(true));
  it('qq.com (Chinese personal)', () => expect(isPersonalDomain('qq.com')).toBe(true));
});

describe('PATTERN_ORDER integrity', () => {
  it('contains expected count (17 patterns)', () => {
    expect(PATTERN_ORDER.length).toBe(17);
  });
  it('no duplicate entries', () => {
    const seen = new Set<Pattern>(PATTERN_ORDER);
    expect(seen.size).toBe(PATTERN_ORDER.length);
  });
});
