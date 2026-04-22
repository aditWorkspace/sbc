// Run once, locally: `pnpm exec tsx scripts/setup-admin-oauth.ts`
import { google } from 'googleapis';
import http from 'node:http';
import open from 'open';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

async function main() {
  const client = new google.auth.OAuth2(
    env().GOOGLE_OAUTH_CLIENT_ID,
    env().GOOGLE_OAUTH_CLIENT_SECRET,
    env().GOOGLE_OAUTH_REDIRECT_URI,
  );
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });
  console.log('Opening browser for Google consent...');
  console.log('If the browser does not open, visit this URL manually:');
  console.log(url);
  await open(url);
  const code = await new Promise<string>((resolve, reject) => {
    const srv = http.createServer(async (req, res) => {
      const u = new URL(req.url!, env().GOOGLE_OAUTH_REDIRECT_URI);
      const c = u.searchParams.get('code');
      if (c) {
        res.end('Thanks — refresh token saved. You can close this tab.');
        srv.close();
        resolve(c);
      } else { res.statusCode = 400; res.end('missing code'); reject(new Error('missing code')); }
    });
    const port = new URL(env().GOOGLE_OAUTH_REDIRECT_URI).port || '3010';
    srv.listen(Number(port));
  });
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error('No refresh_token returned — revoke & retry with prompt=consent');

  const supabase = createClient(env().NEXT_PUBLIC_SUPABASE_URL, env().SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.rpc('vault_write_secret', {
    secret_name: 'google_oauth_refresh_token',
    secret_value: tokens.refresh_token,
  });
  if (error) throw error;
  console.log('Refresh token stored in Supabase Vault.');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
