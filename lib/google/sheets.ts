import { google } from 'googleapis';
import { oauthClient } from './oauth';

interface RowDTO { full_name: string; first_name: string; company_display: string; email: string }
interface Args {
  consultant: { email: string; display_name: string | null };
  rows: RowDTO[];
  refreshToken: string;
  ownerEmail?: string;  // email of the OAuth account that owns the Drive; skip sharing if same as consultant
}

export function describeGoogleError(err: unknown): string {
  const e = err as {
    message?: string;
    code?: number | string;
    status?: string;
    errors?: Array<{ message?: string; reason?: string }>;
    response?: {
      status?: number;
      data?: { error?: { message?: string; status?: string } };
    };
  };
  const googleMsg =
    e?.response?.data?.error?.message ??
    e?.errors?.[0]?.message ??
    e?.message ??
    'unknown error';
  const status = e?.response?.status ?? e?.code ?? e?.status ?? '?';
  const reason = e?.errors?.[0]?.reason ?? e?.response?.data?.error?.status ?? '';
  return `[google ${status}${reason ? ` ${reason}` : ''}] ${googleMsg}`;
}

export async function createSheetForConsultant({ consultant, rows, refreshToken, ownerEmail }: Args) {
  const auth = oauthClient(refreshToken);
  const sheets = google.sheets({ version: 'v4', auth });
  const drive = google.drive({ version: 'v3', auth });

  const dateStr = new Date().toISOString().slice(0, 10);
  const title = `SBC Sourcing — ${consultant.display_name ?? consultant.email} — ${dateStr}`;

  console.log(`[sheets] creating spreadsheet: ${title} (${rows.length} rows)`);

  let spreadsheetId: string;
  let url: string;
  let firstSheetId: number | undefined;
  let firstSheetTitle: string;
  try {
    const created = await sheets.spreadsheets.create({
      requestBody: { properties: { title }, sheets: [{ properties: { title: 'Contacts' } }] },
    });
    spreadsheetId = created.data.spreadsheetId ?? '';
    url = created.data.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    firstSheetId = created.data.sheets?.[0]?.properties?.sheetId ?? undefined;
    firstSheetTitle = created.data.sheets?.[0]?.properties?.title ?? 'Contacts';
    if (!spreadsheetId) throw new Error('Sheets API did not return a spreadsheetId');
    console.log(`[sheets] created id=${spreadsheetId}`);
  } catch (err) {
    console.error(`[sheets] CREATE FAILED: ${describeGoogleError(err)}`);
    throw err;
  }

  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${firstSheetTitle}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          ['Full Name', 'First Name', 'Company', 'Email'],
          ...rows.map(r => [r.full_name, r.first_name, r.company_display, r.email]),
        ],
      },
    });
    console.log(`[sheets] populated ${rows.length + 1} rows`);
  } catch (err) {
    console.error(`[sheets] VALUES UPDATE FAILED: ${describeGoogleError(err)}`);
    throw err;
  }

  // Header bold + freeze (nice-to-have; ignore failures silently since sheet itself is usable)
  if (firstSheetId !== undefined) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: { sheetId: firstSheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: { userEnteredFormat: { textFormat: { bold: true } } },
                fields: 'userEnteredFormat.textFormat.bold',
              },
            },
            {
              updateSheetProperties: {
                properties: { sheetId: firstSheetId, gridProperties: { frozenRowCount: 1 } },
                fields: 'gridProperties.frozenRowCount',
              },
            },
          ],
        },
      });
    } catch (err) {
      console.warn(`[sheets] formatting skipped: ${describeGoogleError(err)}`);
    }
  }

  // Share with consultant — skip if they're the same account as the owner (Google errors on "share with yourself")
  const isOwner = ownerEmail && ownerEmail.toLowerCase() === consultant.email.toLowerCase();
  if (!isOwner) {
    try {
      await drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: { type: 'user', role: 'writer', emailAddress: consultant.email },
        sendNotificationEmail: false,
      });
      console.log(`[sheets] shared with ${consultant.email}`);
    } catch (err) {
      console.error(`[sheets] SHARE FAILED: ${describeGoogleError(err)}`);
      throw err;
    }
  } else {
    console.log(`[sheets] skipping share — consultant is the owner`);
  }

  return { id: spreadsheetId, url };
}

export async function deleteSheet(sheetId: string, refreshToken: string) {
  const drive = google.drive({ version: 'v3', auth: oauthClient(refreshToken) });
  try { await drive.files.delete({ fileId: sheetId }); }
  catch (e: unknown) { if ((e as { code?: number })?.code !== 404) throw e; }
}

export async function retryWithBackoff<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      console.warn(`[sheets] attempt ${i + 1}/${attempts} failed: ${describeGoogleError(e)}`);
      if (i < attempts - 1) await new Promise(r => setTimeout(r, Math.pow(4, i) * 1000));
    }
  }
  throw lastErr;
}
