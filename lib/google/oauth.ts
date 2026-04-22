import { google } from 'googleapis';
import { env } from '@/lib/env';

export function oauthClient(refreshToken: string) {
  const client = new google.auth.OAuth2(
    env().GOOGLE_OAUTH_CLIENT_ID,
    env().GOOGLE_OAUTH_CLIENT_SECRET,
    env().GOOGLE_OAUTH_REDIRECT_URI,
  );
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}
