'use client';
import { useState, useRef } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

interface Summary {
  raw: number; admitted: number; enrichedInstantly: number; pending: number;
  archived: number; alreadyInPool: number; rejected: number;
}

export function UploadZone() {
  const [state, setState] = useState<'idle'|'uploading'|'done'|'error'>('idle');
  const [msg, setMsg] = useState<string>('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setState('uploading'); setMsg('Uploading...'); setSummary(null);
    const text = await file.text();
    const res = await fetch('/api/uploads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: file.name, csv: text }),
    });
    const body = await res.json();
    if (!res.ok) {
      setState('error');
      setMsg(body.error === 'column_mapping_failed'
        ? `Could not map CSV columns. Headers: ${(body.headers ?? []).join(', ')}`
        : `Upload failed: ${body.error ?? res.statusText}`);
      return;
    }
    setState('done');
    setSummary(body);
    setMsg(`${body.admitted} rows admitted. ${body.enrichedInstantly} enriched instantly, ${body.pending} pending.`);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-3">
      <div className="border-2 border-dashed rounded-lg p-8 text-center">
        <input ref={inputRef} type="file" accept=".csv,text/csv"
               onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
               className="hidden" id="csv-input" />
        <label htmlFor="csv-input">
          <Button asChild variant="outline">
            <span>Choose CSV file</span>
          </Button>
        </label>
        <p className="text-xs text-muted-foreground mt-2">
          Columns: first name, last name (optional), company
        </p>
      </div>
      {state === 'uploading' && <Progress className="w-full" />}
      {msg && (
        <Alert variant={state === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      )}
      {summary && (
        <div className="text-xs text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1">
          <span>Raw rows: {summary.raw}</span>
          <span>Admitted: {summary.admitted}</span>
          <span>Rejected: {summary.rejected}</span>
          <span>Already in pool: {summary.alreadyInPool}</span>
          <span>Previously emailed: {summary.archived}</span>
          <span>Enriched now: {summary.enrichedInstantly}</span>
        </div>
      )}
    </div>
  );
}
