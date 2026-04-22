import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}
loadEnvLocal();

import { createClient } from '@supabase/supabase-js';

const EMAILS_INPUT = `
marisaikeda1@berkeley.edu nnatalietrann@berkeley.edu lwang07@berkeley.edu
etran124@berkeley.edu mattwongg@berkeley.edu aditmittal@berkeley.edu
tanishqshinde@berkeley.edu alexandrakowalczyk@berkeley.edu gmungi@berkeley.edu
tiffany_chenn@berkeley.edu akarsh.tripathi@berkeley.edu lola.123@berkeley.edu
aaron_chang@berkeley.edu anvitadas@berkeley.edu amakram@berkeley.edu
mischalin@berkeley.edu sanvi_garg@berkeley.edu emily.lunasin@berkeley.edu
joshuakim060425@berkeley.edu 2adityamehta@berkeley.edu alissale@berkeley.edu
savakassev@berkeley.edu shaharilzaman@berkeley.edu jennifer_tian@berkeley.edu
jchavez22@berkeley.edu tiffany_ling@berkeley.edu josephhack8@berkeley.edu
jeffw3558@berkeley.edu nathanjtma@berkeley.edu mayo.mashita@berkeley.edu
diananguyen@berkeley.edu Lance06kaye@berkeley.edu manasmapuskar@berkeley.edu
Massimo.sonnino@berkeley.com angelinelmyrie@berkeley.edu presha.dutt@berkeley.edu
arnavmahendra@berkeley.edu amyzhhang@berkeley.edu isaree.inkc@berkeley.edu
jessicaxue@berkeley.edu navdeeptakher@berkeley.edu bodhisilberling@berkeley.edu
gni@berkeley.edu svenwenzel@berkeley.edu nguyenkathy0088@berkeley.edu
woodward21@berkeley.edu ryan.rjy317@berkeley.edu kieranczajac@berkeley.edu
ethancheng@berkeley.edu navjosh.rikhraj@berkeley.edu phoebelinn@berkeley.edu
stellarxl@berkeley.edu siasama@berkeley.edu arulloomba@berkeley.edu
erict123@berkeley.edu berkeleyhale@berkeley.edu keiralam@berkeley.edu
`;

async function main() {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Normalize + dedupe + filter to @berkeley.edu only
  const raw = EMAILS_INPUT.trim().split(/\s+/).map(e => e.trim().toLowerCase()).filter(Boolean);
  const unique = [...new Set(raw)];
  const berkeley = unique.filter(e => e.endsWith('@berkeley.edu'));
  const invalid = unique.filter(e => !e.endsWith('@berkeley.edu'));

  console.log(`Input: ${raw.length} emails → ${unique.length} unique → ${berkeley.length} valid @berkeley.edu, ${invalid.length} invalid`);
  if (invalid.length) console.log(`  Invalid (wrong domain, skipped): ${invalid.join(', ')}`);

  // Find admin's consultant_id for approved_by attribution
  const { data: admin } = await supa.from('consultants')
    .select('id').eq('email', 'aditmittal@berkeley.edu').maybeSingle();
  const approvedBy = admin?.id ?? null;
  console.log(`  approved_by = ${approvedBy ?? 'null (admin row not found?)'}\n`);

  // Check which already exist (non-deactivated)
  const { data: existing } = await supa.from('consultants')
    .select('email').in('email', berkeley).is('deactivated_at', null);
  const existingSet = new Set((existing ?? []).map(r => r.email.toLowerCase()));
  const toInsert = berkeley.filter(e => !existingSet.has(e));
  const toApprove = berkeley.filter(e => existingSet.has(e));

  console.log(`  ${existingSet.size} already exist — will bump is_approved=true if not already`);
  console.log(`  ${toInsert.length} new — will insert with is_approved=true\n`);

  // Insert new
  let insertedCount = 0;
  if (toInsert.length) {
    const rows = toInsert.map(email => ({
      email,
      is_approved: true,
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
    }));
    const { error, count } = await supa.from('consultants').insert(rows, { count: 'exact' });
    if (error) { console.error(`Insert error: ${error.message}`); }
    else insertedCount = count ?? rows.length;
  }

  // Approve any existing-but-pending
  let approvedCount = 0;
  if (toApprove.length) {
    const { error, count } = await supa.from('consultants')
      .update({ is_approved: true, approved_at: new Date().toISOString(), approved_by: approvedBy }, { count: 'exact' })
      .in('email', toApprove)
      .eq('is_approved', false)
      .is('deactivated_at', null);
    if (error) console.error(`Update error: ${error.message}`);
    else approvedCount = count ?? 0;
  }

  console.log(`\n✔ Inserted: ${insertedCount}`);
  console.log(`✔ Re-approved existing-pending: ${approvedCount}`);
  console.log(`\nGoogle Cloud Test Users — paste this block (one per line):`);
  console.log('─'.repeat(60));
  for (const e of berkeley) console.log(e);
  console.log('─'.repeat(60));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
