import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsTab() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Card>
        <CardHeader><CardTitle>Current configuration</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>Default sheet rows: <strong className="text-foreground">300</strong></p>
          <p>Sheet retention: <strong className="text-foreground">90 days</strong> (auto-delete via daily cron)</p>
          <p>Allowed sign-in domain: <strong className="text-foreground">@berkeley.edu</strong></p>
          <p>LLM daily budget: <strong className="text-foreground">~2M tokens (≈$1)</strong></p>
          <p>Apollo pattern-lock thresholds: <strong className="text-foreground">HIGH 3/3 or ≥90% at 10, MEDIUM ≥75% at 10, LOW ≥60% at 10, UNRESOLVED after 30</strong></p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Operations</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>See <code className="text-foreground">docs/runbook.md</code> for common ops (credit top-up, token rotation, template force-refresh via SQL, admin lockout recovery).</p>
        </CardContent>
      </Card>
    </div>
  );
}
