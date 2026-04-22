import { describe, it, expect, vi } from 'vitest';
import * as or from '@/lib/llm/openrouter';
import { mapColumnsLlm } from '@/lib/llm/tasks/column-mapping';
import { parseNamesLlm } from '@/lib/llm/tasks/name-parsing';
import { companyCanonLlm } from '@/lib/llm/tasks/company-canon';
import { guessDomainLlm } from '@/lib/llm/tasks/domain-guess';

describe('LLM task wrappers', () => {
  it('mapColumnsLlm returns mapping', async () => {
    vi.spyOn(or, 'openrouterJson').mockResolvedValue({
      first_name: 'A', last_name: 'B', company: 'C', confidence: 0.9,
    } as any);
    const r = await mapColumnsLlm(['A','B','C','D'], [['x','y','z','w']]);
    expect(r).toMatchObject({ first_name:'A', last_name:'B', company:'C' });
  });

  it('parseNamesLlm returns array', async () => {
    vi.spyOn(or, 'openrouterJson').mockResolvedValue({
      names: [{ first:'John', last:'Smith' }],
    } as any);
    const r = await parseNamesLlm(['Dr. John Smith']);
    expect(r?.[0]).toEqual({ first:'John', last:'Smith' });
  });

  it('companyCanonLlm returns canonical or null', async () => {
    vi.spyOn(or, 'openrouterJson').mockResolvedValue({ same_as: 'Google', confidence: 0.95 } as any);
    const r = await companyCanonLlm('Google Inc.', ['Google','Alphabet']);
    expect(r).toBe('Google');
  });

  it('guessDomainLlm returns domain string', async () => {
    vi.spyOn(or, 'openrouterJson').mockResolvedValue({ domain: 'palantir.com', confidence: 0.8 } as any);
    const r = await guessDomainLlm('Palantir Technologies');
    expect(r).toBe('palantir.com');
  });
});
