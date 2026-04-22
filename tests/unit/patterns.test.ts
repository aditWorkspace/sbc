import { describe, it, expect } from 'vitest';
import { detectPattern, renderTemplate, isPersonalDomain } from '@/lib/apollo/patterns';

describe('detectPattern', () => {
  it('first.last', () => expect(detectPattern('John','Smith','john.smith@tesla.com')).toEqual({pattern:'first.last', domain:'tesla.com'}));
  it('firstlast',  () => expect(detectPattern('John','Smith','johnsmith@tesla.com')).toEqual({pattern:'firstlast', domain:'tesla.com'}));
  it('flast',      () => expect(detectPattern('John','Smith','jsmith@tesla.com')).toEqual({pattern:'flast', domain:'tesla.com'}));
  it('f.last',     () => expect(detectPattern('John','Smith','j.smith@tesla.com')).toEqual({pattern:'f.last', domain:'tesla.com'}));
  it('first',      () => expect(detectPattern('John','Smith','john@tesla.com')).toEqual({pattern:'first', domain:'tesla.com'}));
  it('first_last', () => expect(detectPattern('John','Smith','john_smith@tesla.com')).toEqual({pattern:'first_last', domain:'tesla.com'}));
  it('normalizes diacritics', () => expect(detectPattern('José','Ávila','jose.avila@acme.co')).toEqual({pattern:'first.last', domain:'acme.co'}));
  it('lowercases domain', () => expect(detectPattern('Jane','Doe','jane.doe@Foo.COM')?.domain).toBe('foo.com'));
  it('no match', () => expect(detectPattern('Jane','Doe','custom-vanity@foo.com')).toBeNull());
});

describe('renderTemplate', () => {
  it('first.last', () => expect(renderTemplate('John','Smith','first.last','tesla.com')).toBe('john.smith@tesla.com'));
  it('flast', () => expect(renderTemplate('John','Smith','flast','tesla.com')).toBe('jsmith@tesla.com'));
  it('first', () => expect(renderTemplate('John','Smith','first','tesla.com')).toBe('john@tesla.com'));
  it('null if last missing for last-needing pattern', () =>
    expect(renderTemplate('Madonna','','flast','records.com')).toBeNull());
  it('first works without last', () =>
    expect(renderTemplate('Madonna','','first','records.com')).toBe('madonna@records.com'));
});

describe('isPersonalDomain', () => {
  it('gmail', () => expect(isPersonalDomain('gmail.com')).toBe(true));
  it('tesla', () => expect(isPersonalDomain('tesla.com')).toBe(false));
  it('case-insensitive', () => expect(isPersonalDomain('Gmail.COM')).toBe(true));
});
