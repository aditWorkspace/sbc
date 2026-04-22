import { describe, it, expect } from 'vitest';
import { mapColumnsByAlias } from '@/lib/csv/map-columns';

describe('mapColumnsByAlias', () => {
  it('exact', () => {
    expect(mapColumnsByAlias(['first_name','last_name','company']))
      .toEqual({ first_name:'first_name', last_name:'last_name', company:'company', unresolved: [] });
  });
  it('title-case variants', () => {
    expect(mapColumnsByAlias(['First Name','Last Name','Company Name']))
      .toMatchObject({ first_name:'First Name', last_name:'Last Name', company:'Company Name' });
  });
  it('fname/lname', () => {
    expect(mapColumnsByAlias(['fname','lname','company']))
      .toMatchObject({ first_name:'fname', last_name:'lname' });
  });
  it('reports unresolved', () => {
    const r = mapColumnsByAlias(['weird_col','company']);
    expect(r.first_name).toBeNull();
    expect(r.unresolved).toContain('first_name');
  });
});
