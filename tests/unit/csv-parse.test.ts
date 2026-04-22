import { describe, it, expect } from 'vitest';
import { parseCsv } from '@/lib/csv/parse';

describe('parseCsv', () => {
  it('basic', () => {
    const r = parseCsv('first_name,last_name,company\nJohn,Smith,Tesla\n');
    expect(r.headers).toEqual(['first_name','last_name','company']);
    expect(r.rows).toEqual([{ first_name:'John', last_name:'Smith', company:'Tesla' }]);
  });
  it('BOM stripped', () => {
    const r = parseCsv('﻿first,last\nA,B\n');
    expect(r.headers[0]).toBe('first');
  });
  it('quoted commas', () => {
    const r = parseCsv('name,company\n"Smith, John","Acme, Inc."');
    expect(r.rows[0]).toEqual({ name:'Smith, John', company:'Acme, Inc.' });
  });
  it('semicolon delimiter', () => {
    const r = parseCsv('first;last\nA;B');
    expect(r.rows[0]).toEqual({ first:'A', last:'B' });
  });
  it('skips empty rows', () => {
    const r = parseCsv('first\nA\n\n\nB\n');
    expect(r.rows.length).toBe(2);
  });
});
