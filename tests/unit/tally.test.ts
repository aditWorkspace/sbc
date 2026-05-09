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

  it('ignores wrong-domain samples when computing within-domain ratio', () => {
    // Apple-style scenario: 14 first|apple.com, 5 various|other.com (people who
    // actually work elsewhere). totalSamples should be 14, not 19, so ratio = 1.0.
    const samples: SampleRow[] = [
      ...Array(14).fill(0).map(() => s('first', 'apple.com')),
      s('flast', 'nvidia.com'),
      s('first', 'rosendin.com'),
      s('flast', 'creativehydra.com'),
      s('first', 'xcreativelab.com'),
      s('flast', 'parsims.com'),
    ];
    const r = tallySamples(samples);
    expect(r.winnerDomain).toBe('apple.com');
    expect(r.winnerPattern).toBe('first');
    expect(r.matchCount).toBe(14);
    expect(r.totalSamples).toBe(14);
  });

  it('within-domain pattern minorities counted in total', () => {
    // 7 first|x.com, 3 last|x.com → winner=first, total=10, match=7
    const samples: SampleRow[] = [
      ...Array(7).fill(0).map(() => s('first', 'x.com')),
      ...Array(3).fill(0).map(() => s('last', 'x.com')),
    ];
    const r = tallySamples(samples);
    expect(r).toMatchObject({ winnerDomain: 'x.com', winnerPattern: 'first', matchCount: 7, totalSamples: 10 });
  });
});

describe('evaluateConfidence', () => {
  it('HIGH 3/3', () => expect(evaluateConfidence(3,3)).toBe('HIGH'));
  it('HIGH 9/10', () => expect(evaluateConfidence(9,10)).toBe('HIGH'));
  it('MEDIUM 8/10', () => expect(evaluateConfidence(8,10)).toBe('MEDIUM'));
  it('LOW 6/10', () => expect(evaluateConfidence(6,10)).toBe('LOW'));
  it('SAMPLING below 5', () => expect(evaluateConfidence(2,4)).toBe('SAMPLING'));
  it('LOW at 5+ with 60% agreement (early-lock)', () => expect(evaluateConfidence(3,5)).toBe('LOW'));
  it('SAMPLING at 5+ with <60%', () => expect(evaluateConfidence(2,5)).toBe('SAMPLING'));
  it('UNRESOLVED at 30 below 60%', () => expect(evaluateConfidence(15,30)).toBe('UNRESOLVED'));
  it('LOW at 30 >= 60%', () => expect(evaluateConfidence(18,30)).toBe('LOW'));
});
