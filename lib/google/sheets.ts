import { google } from 'googleapis';
import { oauthClient } from './oauth';

interface RowDTO { full_name: string; first_name: string; company_display: string; email: string }
interface Args {
  consultant: { email: string; display_name: string | null };
  rows: RowDTO[];
  refreshToken: string;
}

export async function createSheetForConsultant({ consultant, rows, refreshToken }: Args) {
  const auth = oauthClient(refreshToken);
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  const dateStr = new Date().toISOString().slice(0, 10);
  const title = `SBC Sourcing — ${consultant.display_name ?? consultant.email} — ${dateStr}`;

  const { data: spreadsheet } = await sheets.spreadsheets.create({
    requestBody: { properties: { title }, sheets: [{ properties: { title: 'Contacts' } }] },
  });
  const id = spreadsheet.spreadsheetId!;
  const url = spreadsheet.spreadsheetUrl!;

  await sheets.spreadsheets.values.update({
    spreadsheetId: id, range: 'Contacts!A1', valueInputOption: 'RAW',
    requestBody: {
      values: [
        ['Full Name', 'First Name', 'Company', 'Email'],
        ...rows.map(r => [r.full_name, r.first_name, r.company_display, r.email]),
      ],
    },
  });

  await drive.permissions.create({
    fileId: id,
    requestBody: { type: 'user', role: 'writer', emailAddress: consultant.email },
    sendNotificationEmail: false,
  });
  return { id, url };
}

export async function deleteSheet(sheetId: string, refreshToken: string) {
  const drive = google.drive({ version: 'v3', auth: oauthClient(refreshToken) });
  try { await drive.files.delete({ fileId: sheetId }); }
  catch (e: unknown) { if ((e as any)?.code !== 404) throw e; }
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, Math.pow(4, i) * 1000));
    }
  }
  throw lastErr;
}
