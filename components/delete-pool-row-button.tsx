'use client';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export function DeletePoolRowButton({ contactId }: { contactId: string }) {
  const router = useRouter();
  async function del() {
    if (!confirm('Delete this pool row?')) return;
    await fetch(`/api/admin/pool/contacts/${contactId}`, { method: 'DELETE' });
    router.refresh();
  }
  return <Button size="sm" variant="ghost" onClick={del}>Delete</Button>;
}
