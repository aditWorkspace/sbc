'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';

type Stage = 'idle' | 'claiming' | 'creating' | 'sharing' | 'opening' | 'done' | 'error';

const STAGE_LABEL: Record<Stage, string> = {
  idle: '',
  claiming: 'Claiming rows from the pool...',
  creating: 'Creating Google Sheet in admin Drive...',
  sharing: 'Sharing sheet with your email...',
  opening: 'Opening sheet...',
  done: '',
  error: '',
};

export function GetSheetButton() {
  const [stage, setStage] = useState<Stage>('idle');
  const [err, setErr] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  async function pull() {
    setErr(''); setSuccess(''); setStage('claiming');
    const res = await fetch('/api/sheets', { method: 'POST' });
    if (res.status === 409) {
      setStage('error');
      setErr('Pool empty — ask a teammate to upload a CSV first.');
      return;
    }
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      setStage('error');
      if (body.error === 'jr_consultant_cannot_pull') {
        setErr(body.message ?? 'Jr consultants cannot pull sheets yet.');
      } else {
        setErr('You do not have permission to pull a sheet.');
      }
      return;
    }
    setStage('creating');
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/csv')) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sbc-sourcing-${Date.now()}.csv`;
      a.click();
      setStage('done');
      setSuccess('Google Sheets API was unavailable — CSV fallback downloaded to your computer.');
    } else {
      const body = await res.json();
      if (!res.ok) {
        setStage('error');
        setErr(body.error ?? `Request failed: ${res.status}`);
        return;
      }
      setStage('sharing');
      if (body.url) {
        setStage('opening');
        window.open(body.url, '_blank');
      }
      setStage('done');
      setSuccess(`Sheet ready — ${body.row_count} rows.${body.warning ? ' ' + body.warning : ''}`);
    }
  }

  const isBusy = ['claiming', 'creating', 'sharing', 'opening'].includes(stage);
  const progressPct = ({ claiming: 25, creating: 50, sharing: 75, opening: 95 } as Record<string, number>)[stage] ?? 0;

  return (
    <div className="space-y-3">
      <Button
        onClick={pull}
        disabled={isBusy}
        className="rounded-full px-6 py-2.5 bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
      >
        {isBusy ? STAGE_LABEL[stage] : 'Get my sheet (300 rows)'}
      </Button>
      {isBusy && (
        <div className="space-y-1">
          <Progress value={progressPct} />
          <p className="text-xs text-muted-foreground italic">
            This can take 5–10 seconds — we&apos;re claiming rows atomically, creating a sheet in the admin&apos;s Drive, and sharing it with you.
          </p>
        </div>
      )}
      {success && (
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <AlertDescription className="text-amber-300 text-sm">{success}</AlertDescription>
        </Alert>
      )}
      {err && (
        <Alert className={
          err.includes('Pool empty')
            ? 'border-destructive/50 bg-destructive/5'
            : 'border-destructive/50 bg-destructive/5'
        }>
          <AlertDescription className="text-destructive text-sm">{err}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
