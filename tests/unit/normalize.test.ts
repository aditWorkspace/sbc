import { describe, it, expect } from 'vitest';
import { normalize, buildNormalizedKey } from '@/lib/csv/normalize';

describe('normalize', () => {
  it('lowercases', () => expect(normalize('JOHN')).toBe('john'));
  it('strips diacritics', () => expect(normalize('José')).toBe('jose'));
  it('strips apostrophes', () => expect(normalize("O'Brien")).toBe('obrien'));
  it('strips hyphens', () => expect(normalize('Jean-Paul')).toBe('jeanpaul'));
  it('strips whitespace', () => expect(normalize('  Mary  Jo  ')).toBe('maryjo'));
  it('handles empty', () => expect(normalize('')).toBe(''));
  it('handles null-ish', () => expect(normalize(null as unknown as string)).toBe(''));
});

describe('buildNormalizedKey', () => {
  it('joins with pipes', () =>
    expect(buildNormalizedKey('john','smith','tesla')).toBe('john|smith|tesla'));
  it('handles empty last', () =>
    expect(buildNormalizedKey('madonna','','records')).toBe('madonna||records'));
});
