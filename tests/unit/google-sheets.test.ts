import { describe, it, expect, vi } from 'vitest';

// Minimal env for tests — lib/env reads process.env lazily
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://t.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'p';
process.env.SUPABASE_SERVICE_ROLE_KEY = 's';
process.env.ICYPEAS_API_KEY = 'ic';
process.env.ICYPEAS_SECRET_API_KEY = 'sk';
process.env.ICYPEAS_USER_ID = 'u';
process.env.OPENROUTER_API_KEY = 'or-test';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'cs';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3010/oauth/callback';
process.env.CRON_SECRET = 'x'.repeat(32);

const createSpreadsheet = vi.fn().mockResolvedValue({ data: { spreadsheetId: 'SID', spreadsheetUrl: 'https://sheet/SID' } });
const valuesUpdate = vi.fn().mockResolvedValue({});
const permCreate = vi.fn().mockResolvedValue({});

vi.mock('googleapis', () => ({
  google: {
    sheets: () => ({ spreadsheets: { create: createSpreadsheet, values: { update: valuesUpdate } } }),
    drive: () => ({ permissions: { create: permCreate } }),
    auth: { OAuth2: class { setCredentials() {} getAccessToken() { return Promise.resolve({ token: 'a' }); } } },
  },
}));

import { createSheetForConsultant } from '@/lib/google/sheets';

describe('createSheetForConsultant', () => {
  it('creates sheet, writes rows, shares with consultant', async () => {
    const r = await createSheetForConsultant({
      consultant: { email: 'ava@berkeley.edu', display_name: 'Ava' },
      rows: [{ full_name:'John Smith', first_name:'John', company_display:'Tesla', email:'john.smith@tesla.com' }],
      refreshToken: 'RT',
    });
    expect(r.id).toBe('SID');
    expect(r.url).toBe('https://sheet/SID');
    expect(createSpreadsheet).toHaveBeenCalled();
    expect(valuesUpdate).toHaveBeenCalled();
    expect(permCreate).toHaveBeenCalled();
  });
});
