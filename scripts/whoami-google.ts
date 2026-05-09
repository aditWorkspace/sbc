// Tells you which Google account the saved OAuth refresh token belongs to.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

(function loadEnv() {
  const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]!] ??= m[2]!.replace(/^"|"$/g, '');
  }
})();

(async () => {
  const { google } = await import('googleapis');
  const { createClient } = await import('@supabase/supabase-js');

  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: refreshToken, error } = await supa.rpc('vault_read_secret', { secret_name: 'google_oauth_refresh_token' });
  if (error || !refreshToken) { console.error('Vault read failed:', error); process.exit(1); }

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI,
  );
  client.setCredentials({ refresh_token: refreshToken as string });

  // The OAuth scopes only include spreadsheets + drive.file (not userinfo),
  // so we can't call /userinfo. Instead, create a tiny throwaway sheet —
  // success proves the token is valid AND tells us whose Drive it lives in
  // (via the spreadsheet's `owner` metadata when we re-fetch it).
  try {
    const sheets = google.sheets({ version: 'v4', auth: client });
    const drive = google.drive({ version: 'v3', auth: client });

    const { data: created } = await sheets.spreadsheets.create({
      requestBody: { properties: { title: '__SBC OAuth Probe__' } },
      fields: 'spreadsheetId',
    });
    const id = created.spreadsheetId!;
    console.log('✓ Token is valid — created probe sheet', id);

    // Fetch metadata to find the owner email
    const { data: meta } = await drive.files.get({
      fileId: id,
      fields: 'name, owners(emailAddress, displayName)',
      supportsAllDrives: true,
    });
    if (meta.owners?.length) {
      console.log('Google account on file:');
      for (const o of meta.owners) {
        console.log(`  email: ${o.emailAddress}`);
        console.log(`  name:  ${o.displayName}`);
      }
    } else {
      console.log('(could not read owner metadata, but token works)');
    }

    // Clean up probe
    await drive.files.delete({ fileId: id });
    console.log('✓ Probe sheet deleted');
  } catch (e: any) {
    console.error('Token check failed:', e?.message ?? e);
    if (e?.response?.data) console.error(e.response.data);
    process.exit(1);
  }
})();
