'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';

export function AddConsultantForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(undefined);
    const res = await fetch('/api/admin/consultants', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.ok) { setEmail(''); router.refresh(); }
    else {
      const body = await res.json().catch(() => ({}));
      setError(body?.detail ?? body?.error ?? 'Failed to add');
    }
    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="flex gap-2 items-start">
      <Input placeholder="name@berkeley.edu" value={email}
             onChange={e => setEmail(e.target.value)} className="max-w-sm" />
      <Button type="submit" disabled={loading || !email}>Add consultant</Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
