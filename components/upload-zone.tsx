'use client';
import { useState, useRef, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

type Stage = 'idle' | 'reading' | 'parsing' | 'uploading' | 'processing' | 'done' | 'error';

interface Summary {
  uploadId: string;
  raw: number; admitted: number; enrichedInstantly: number; pending: number;
  archived: number; alreadyInPool: number; rejected: number;
}

const STAGE_LABEL: Record<Stage, string> = {
  idle: '',
  reading: 'Reading file...',
  parsing: 'Parsing CSV...',
  uploading: 'Uploading to server...',
  processing: 'Enriching contacts via Icypeas (emails arriving live)...',
  done: 'Done',
  error: 'Error',
};

export function UploadZone() {
  const [stage, setStage] = useState<Stage>('idle');
  const [msg, setMsg] = useState<string>('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [enriched, setEnriched] = useState<number>(0);
  const [pending, setPending] = useState<number>(0);
  const [error, setError] = useState<string>('');
  const [submitTime, setSubmitTime] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Poll upload status while pending > 0
  useEffect(() => {
    if (stage !== 'processing' || !summary) return;
    const started = Date.now();
    const tick = async () => {
      const res = await fetch(`/api/uploads/${summary.uploadId}`);
      if (!res.ok) return;
      const body = await res.json();
      setEnriched(body.enriched ?? 0);
      setPending(body.pending ?? 0);
      if ((body.pending ?? 0) === 0) {
        setStage('done');
        return;
      }
      if (Date.now() - started > 5 * 60_000) {
        setStage('done');
        return;
      }
    };
    tick(); // immediate tick
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [stage, summary]);

  async function handleFile(file: File) {
    setError(''); setSummary(null); setEnriched(0); setPending(0);

    setStage('reading');
    setMsg('Reading file...');
    const text = await file.text();

    setStage('parsing');
    // Quick count — real parsing happens server-side
    const approxRows = Math.max(0, text.split('\n').filter(l => l.trim()).length - 1);
    setMsg(`Parsing CSV — ${approxRows} rows detected...`);

    setStage('uploading');
    setMsg(`Uploading ${approxRows} rows to server...`);
    const res = await fetch('/api/uploads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: file.name, csv: text }),
    });
    const body = await res.json();
    if (!res.ok) {
      setStage('error');
      setError(body.error === 'column_mapping_failed'
        ? `Could not auto-map CSV columns. Headers found: ${(body.headers ?? []).join(', ')}. Use headers like "first_name", "last_name", "company".`
        : `Upload failed: ${body.error ?? res.statusText}`);
      return;
    }
    setSummary(body);
    setSubmitTime(Date.now());
    setEnriched(body.enrichedInstantly ?? 0);
    setPending(body.pending ?? 0);
    if ((body.pending ?? 0) === 0) {
      setStage('done');
    } else {
      setStage('processing');
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  const total = summary ? summary.admitted : 0;
  const progressPct = total > 0 ? Math.round((enriched / total) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="border-2 border-dashed rounded-lg p-8 text-center">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          disabled={['reading', 'parsing', 'uploading'].includes(stage)}
          onClick={() => inputRef.current?.click()}
        >
          {stage === 'idle' || stage === 'done' || stage === 'error' ? 'Choose CSV file' : STAGE_LABEL[stage]}
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          Columns: first name, last name (optional), company
        </p>
      </div>

      {(stage === 'reading' || stage === 'parsing' || stage === 'uploading') && (
        <Alert>
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      )}

      {summary && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Raw rows: <span className="text-foreground font-medium">{summary.raw}</span></span>
            <span>Admitted: <span className="text-foreground font-medium">{summary.admitted}</span></span>
            <span>Rejected (bad data): <span className="text-foreground font-medium">{summary.rejected}</span></span>
            <span>Already in pool: <span className="text-foreground font-medium">{summary.alreadyInPool}</span></span>
            <span>Previously emailed: <span className="text-foreground font-medium">{summary.archived}</span></span>
            <span>Enriched instantly: <span className="text-foreground font-medium">{summary.enrichedInstantly}</span></span>
          </div>

          {(stage === 'processing' || stage === 'done') && summary.admitted > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {stage === 'processing'
                    ? `Enriching via Icypeas: ${enriched} of ${total} done, ${pending} pending...`
                    : `Enrichment complete: ${enriched} of ${total} enriched${total - enriched > 0 ? `, ${total - enriched} failed or deleted` : ''}`}
                </span>
                <span>{progressPct}%</span>
              </div>
              <Progress value={progressPct} />
              {stage === 'processing' && (
                <p className="text-xs text-muted-foreground italic">
                  Rows get deleted if Icypeas can&apos;t find a verified email for them — that&apos;s expected.
                </p>
              )}
              {stage === 'processing' && pending > 0 && Date.now() - (submitTime ?? 0) > 60_000 && (
                <p className="text-xs text-amber-600">
                  Enrichment seems slow — if this is local dev, trigger the worker:
                  <code className="bg-muted px-1 mx-1 text-xs">curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; http://localhost:3010/api/cron/enrich</code>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
