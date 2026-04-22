'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';

export function ForceRefreshButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reEnrich, setReEnrich] = useState(false);

  async function run() {
    await fetch(`/api/admin/templates/${companyId}/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reEnrich }),
    });
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Force refresh</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Force refresh template</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          Resets the pattern and domain for this company. A new sampling job will be enqueued.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={reEnrich} onChange={e => setReEnrich(e.target.checked)} />
          Also re-enrich current enriched contacts at this company
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={run}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
