'use client';
import { useState, useRef, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';

type Stage = 'idle' | 'reading' | 'parsing' | 'uploading' | 'processing' | 'done' | 'error';

interface Summary {
  uploadId: string;
  raw: number; admitted: number; enrichedInstantly: number; pending: number;
  archived: number; alreadyInPool: number; previouslyAttempted: number; rejected: number;
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

const STAT_ROWS: { key: keyof Summary; label: string }[] = [
  { key: 'raw',               label: 'RAW ROWS' },
  { key: 'admitted',          label: 'ADMITTED' },
  { key: 'rejected',          label: 'REJECTED' },
  { key: 'alreadyInPool',     label: 'ALREADY IN POOL' },
  { key: 'archived',          label: 'PREV. EMAILED' },
  { key: 'previouslyAttempted', label: 'CREDIT SAVED' },
  { key: 'enrichedInstantly', label: 'ENRICHED' },
];

// Keep polling for 30 minutes — large CSVs (200+ rows) can take 15-20 min to
// fully drain via the minute-cron at BATCH=5/company/tick. Showing "done"
// before pending=0 misleads consultants into thinking enrichment failed.
const POLL_TIMEOUT_MS = 30 * 60_000;

export function UploadZone() {
  const [stage, setStage] = useState<Stage>('idle');
  const [msg, setMsg] = useState<string>('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [enriched, setEnriched] = useState<number>(0);
  const [pending, setPending] = useState<number>(0);
  const [error, setError] = useState<string>('');
  const [pollTimedOut, setPollTimedOut] = useState<boolean>(false);
  const [notFoundCompanies, setNotFoundCompanies] = useState<string[]>([]);
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
      setNotFoundCompanies(Array.isArray(body.not_found_companies) ? body.not_found_companies : []);
      if ((body.pending ?? 0) === 0) {
        setStage('done');
        return;
      }
      if (Date.now() - started > POLL_TIMEOUT_MS) {
        // Stop polling but stay in 'processing' state — work is still happening
        // server-side via the cron, we just stop watching from this tab.
        setPollTimedOut(true);
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [stage, summary]);

  async function handleFile(file: File) {
    setError(''); setSummary(null); setEnriched(0); setPending(0); setPollTimedOut(false); setNotFoundCompanies([]);

    setStage('reading');
    setMsg('Reading file...');
    const text = await file.text();

    setStage('parsing');
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
  // Show progress as enriched + (admitted - enriched - pending) deletes.
  // i.e., everything that's been DECIDED about, vs everything still pending.
  const decided = total - pending;
  const progressPct = total > 0 ? Math.round((decided / total) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/40 transition-colors">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          className="hidden"
        />
        <Button
          type="button"
          className="rounded-full px-6 py-2.5 bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          disabled={['reading', 'parsing', 'uploading'].includes(stage)}
          onClick={() => inputRef.current?.click()}
        >
          {stage === 'idle' || stage === 'done' || stage === 'error' ? 'Choose CSV file' : STAGE_LABEL[stage]}
        </Button>
        <p className="font-mono text-[11px] uppercase tracking-[1.2px] text-muted-foreground mt-3">
          Columns: first name, last name, company (all required)
        </p>
      </div>

      {(stage === 'reading' || stage === 'parsing' || stage === 'uploading') && (
        <Alert className="border-border bg-card">
          <AlertDescription className="text-sm text-muted-foreground">{msg}</AlertDescription>
        </Alert>
      )}

      {summary && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5">
            {STAT_ROWS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-muted-foreground">
                  {label}:
                </span>
                <span className="text-sm font-medium text-foreground">
                  {summary[key] as number}
                </span>
              </div>
            ))}
          </div>

          {(stage === 'processing' || stage === 'done') && summary.admitted > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {stage === 'processing'
                    ? `Enriching via Icypeas: ${enriched} added to pool, ${pending} still being processed...`
                    : `Done — ${enriched} added to pool${total - enriched > 0 ? `, ${total - enriched} couldn't be matched` : ''}`}
                </span>
                <span className="font-mono">{progressPct}%</span>
              </div>
              <Progress value={progressPct} />
              {stage === 'processing' && !pollTimedOut && (
                <p className="text-xs text-muted-foreground italic">
                  Icypeas can take a few minutes for large lists. You can leave this page open or come back later — enrichment continues server-side either way. Rows that can&apos;t be matched are skipped automatically.
                </p>
              )}
              {stage === 'processing' && pollTimedOut && (
                <p className="text-xs text-amber-400">
                  Still processing in the background. Refresh this page or check the History tab in a few minutes to see final results.
                </p>
              )}
              {stage === 'done' && notFoundCompanies.length > 0 && (
                <Alert className="border-amber-500/40 bg-amber-500/5 mt-2">
                  <AlertDescription className="text-xs text-amber-300">
                    Icypeas couldn&apos;t find anyone at:{' '}
                    <span className="font-medium">{notFoundCompanies.join(', ')}</span>.
                    Possible typo in the company column — double-check the spelling and re-upload.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/5">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
