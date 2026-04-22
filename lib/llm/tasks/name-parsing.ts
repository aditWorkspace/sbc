import { z } from 'zod';
import { openrouterJson } from '../openrouter';

const Schema = z.object({
  names: z.array(z.object({ first: z.string(), last: z.string() })),
});

export async function parseNamesLlm(fullNames: string[]): Promise<{first:string; last:string}[] | null> {
  if (!fullNames.length) return [];
  const user = `Split each full name into first_name + last_name. Strip titles (Dr., Mr., Mrs.) and suffixes (Jr., III, PhD). Keep order.\n\n${fullNames.map((n, i) => `${i+1}. ${n}`).join('\n')}\n\nReturn {"names":[{"first","last"}, ...]}.`;
  const res = await openrouterJson({
    system: 'You parse messy full names. Return strict JSON array in input order.',
    user, schema: Schema,
  });
  if (!res || res.names.length !== fullNames.length) return null;
  return res.names;
}
