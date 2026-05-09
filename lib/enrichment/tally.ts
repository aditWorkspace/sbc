export interface SampleRow {
  detected_pattern: string | null;
  detected_domain: string | null;
  email_ignored_reason: string | null;
}

export type Confidence = 'UNKNOWN'|'SAMPLING'|'HIGH'|'MEDIUM'|'LOW'|'UNRESOLVED';

// Two-stage tally:
//   1. Find the dominant DOMAIN among matched samples (most-frequent wins;
//      tie-break by shorter domain — corporate primaries tend to be shorter).
//   2. Within samples that have that dominant domain, find the dominant PATTERN.
//
// Why two stages: stale CSV data often has people listed at company X who actually
// work at company Y. Icypeas correctly returns their real-company email. If we
// tally globally, those wrong-company samples drag the ratio below the lock
// threshold even though everyone at the actual target company shares one pattern.
// e.g. Apple had 14 first|apple.com + 27 various|other.com = 14/41 (34%, no lock).
// With two-stage: apple.com is dominant (14 vs <5 each for others) → within
// apple.com, 'first' has 14/14 = 100% → HIGH lock.
export function tallySamples(samples: SampleRow[]): {
  winnerPattern: string | null;
  winnerDomain: string | null;
  matchCount: number;
  totalSamples: number;
} {
  const valid = samples.filter(s => !s.email_ignored_reason && s.detected_pattern && s.detected_domain);
  if (!valid.length) return { winnerPattern: null, winnerDomain: null, matchCount: 0, totalSamples: 0 };

  // Stage 1: dominant domain
  const domainCounts = new Map<string, number>();
  for (const s of valid) {
    const d = s.detected_domain!;
    domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
  }
  const sortedDomains = [...domainCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].length - b[0].length,
  );
  const winnerDomain = sortedDomains[0]![0];

  // Stage 2: dominant pattern within winner domain
  const inDomain = valid.filter(s => s.detected_domain === winnerDomain);
  const patternCounts = new Map<string, number>();
  for (const s of inDomain) {
    const p = s.detected_pattern!;
    patternCounts.set(p, (patternCounts.get(p) ?? 0) + 1);
  }
  const sortedPatterns = [...patternCounts.entries()].sort((a, b) => b[1] - a[1]);
  const winnerPattern = sortedPatterns[0]![0];
  const matchCount = sortedPatterns[0]![1];

  // totalSamples is denominator for confidence — use within-domain count, not
  // global. This is the change that fixes the wrong-company contamination.
  return { winnerPattern, winnerDomain, matchCount, totalSamples: inDomain.length };
}

export function evaluateConfidence(matchCount: number, total: number): Confidence {
  if (total === 0) return 'UNKNOWN';
  const ratio = matchCount / total;
  if (total >= 3 && matchCount === total) return 'HIGH';
  if (total >= 10 && ratio >= 0.9) return 'HIGH';
  if (total >= 10 && ratio >= 0.75) return 'MEDIUM';
  if (total >= 10 && ratio >= 0.6) return 'LOW';
  // Lower-bar lock: with 5+ samples and ≥60% agreement, still lock at LOW.
  // Better to template-fill at 60% confidence than burn Icypeas credits forever
  // for companies that have minor pattern variation.
  if (total >= 5 && ratio >= 0.6) return 'LOW';
  if (total >= 30) return 'UNRESOLVED';
  return 'SAMPLING';
}
