'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function GetSheetButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [msgKind, setMsgKind] = useState<'info'|'error'>('info');

  async function pull() {
    setLoading(true); setMsg(undefined);
    const res = await fetch('/api/sheets', { method: 'POST' });
    if (res.status === 409) {
      setMsgKind('error');
      setMsg('Pool empty — ask a teammate to upload first.');
      setLoading(false);
      return;
    }
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/csv')) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sbc-sourcing-${Date.now()}.csv`;
      a.click();
      setMsgKind('info');
      setMsg('Google Sheets unavailable — downloaded CSV fallback instead.');
    } else {
      const body = await res.json();
      if (body.url) window.open(body.url, '_blank');
      if (body.warning) { setMsgKind('info'); setMsg(body.warning); }
    }
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      <Button onClick={pull} disabled={loading}>
        {loading ? 'Preparing...' : 'Get my sheet (300 rows)'}
      </Button>
      {msg && (
        <Alert variant={msgKind === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
