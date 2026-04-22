import { describe, it, expect } from 'vitest';
import { tallySamples, evaluateConfidence, type SampleRow } from '@/lib/enrichment/tally';

const s = (pattern: string | null, domain: string | null, ignored: string | null = null): SampleRow =>
  ({ detected_pattern: pattern, detected_domain: domain, email_ignored_reason: ignored });

describe('tallySamples', () => {
  it('unanimous 3/3', () => {
    expect(tallySamples([s('first.last','tesla.com'), s('first.last','tesla.com'), s('first.last','tesla.com')]))
      .toEqual({ winnerPattern:'first.last', winnerDomain:'tesla.com', matchCount:3, totalSamples:3 });
  });
  it('ignores rows with ignored reason', () => {
    const r = tallySamples([s('first.last','tesla.com'), s(null,null,'personal_domain'), s('first.last','tesla.com')]);
    expect(r).toMatchObject({ matchCount:2, totalSamples:2 });
  });
  it('picks shorter domain on tie', () => {
    const r = tallySamples([s('first.last','tesla.com'), s('first.last','teslamotors.com')]);
    expect(r.winnerDomain).toBe('tesla.com');
  });
  it('empty input', () => {
    expect(tallySamples([])).toMatchObject({ matchCount:0, totalSamples:0, winnerPattern:null });
  });
});

describe('evaluateConfidence', () => {
  it('HIGH 3/3', () => expect(evaluateConfidence(3,3)).toBe('HIGH'));
  it('HIGH 9/10', () => expect(evaluateConfidence(9,10)).toBe('HIGH'));
  it('MEDIUM 8/10', () => expect(evaluateConfidence(8,10)).toBe('MEDIUM'));
  it('LOW 6/10', () => expect(evaluateConfidence(6,10)).toBe('LOW'));
  it('SAMPLING below 10', () => expect(evaluateConfidence(2,5)).toBe('SAMPLING'));
  it('UNRESOLVED at 30 below 60%', () => expect(evaluateConfidence(15,30)).toBe('UNRESOLVED'));
  it('LOW at 30 >= 60%', () => expect(evaluateConfidence(18,30)).toBe('LOW'));
});
