export interface SampleRow {
  detected_pattern: string | null;
  detected_domain: string | null;
  email_ignored_reason: string | null;
}

export type Confidence = 'UNKNOWN'|'SAMPLING'|'HIGH'|'MEDIUM'|'LOW'|'UNRESOLVED';

export function tallySamples(samples: SampleRow[]): {
  winnerPattern: string | null;
  winnerDomain: string | null;
  matchCount: number;
  totalSamples: number;
} {
  const valid = samples.filter(s => !s.email_ignored_reason && s.detected_pattern && s.detected_domain);
  if (!valid.length) return { winnerPattern: null, winnerDomain: null, matchCount: 0, totalSamples: 0 };
  const counts = new Map<string, { pattern: string; domain: string; n: number }>();
  for (const s of valid) {
    const key = `${s.detected_pattern}|${s.detected_domain}`;
    const entry = counts.get(key);
    if (entry) entry.n++;
    else counts.set(key, { pattern: s.detected_pattern!, domain: s.detected_domain!, n: 1 });
  }
  const sorted = [...counts.values()].sort((a, b) => b.n - a.n || a.domain.length - b.domain.length);
  const w = sorted[0]!;
  return { winnerPattern: w.pattern, winnerDomain: w.domain, matchCount: w.n, totalSamples: valid.length };
}

export function evaluateConfidence(matchCount: number, total: number): Confidence {
  if (total === 0) return 'UNKNOWN';
  const ratio = matchCount / total;
  if (total >= 3 && matchCount === total) return 'HIGH';
  if (total >= 10 && ratio >= 0.9) return 'HIGH';
  if (total >= 10 && ratio >= 0.75) return 'MEDIUM';
  if (total >= 10 && ratio >= 0.6) return 'LOW';
  if (total >= 30) return 'UNRESOLVED';
  return 'SAMPLING';
}
