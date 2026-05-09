'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface Props {
  kind: 'upload' | 'company';
  id: string;
  label: string;            // e.g. "23 contacts from Stripe"
  count: number;            // for confirmation message
  size?: 'sm' | 'default';
}

export function BulkDeleteButton({ kind, id, label, count, size = 'sm' }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    if (count === 0) return;
    const ok = window.confirm(
      `Delete ${count} contact${count === 1 ? '' : 's'} (${label})?\n\n` +
      `This removes them from the pool but keeps the Icypeas-spent samples and ` +
      `learned company template (so future uploads benefit from those credits).`
    );
    if (!ok) return;
    setBusy(true);
    const body = kind === 'upload' ? { kind, upload_id: id } : { kind, company_id: id };
    const res = await fetch('/api/admin/pool/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { alert(`Failed: ${j.error ?? res.status}`); return; }
    alert(`Deleted ${j.deleted ?? '?'} contacts.`);
    router.refresh();
  }

  return (
    <Button onClick={go} disabled={busy || count === 0} variant="destructive" size={size}>
      {busy ? 'Deleting…' : `Delete ${count}`}
    </Button>
  );
}
