'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { Range } from '@/lib/admin/queries';

const RANGES: Range[] = ['day','week','month','all'];

export function TimeRangeToggle({ current }: { current: Range }) {
  const router = useRouter();
  const params = useSearchParams();
  function set(r: Range) {
    const sp = new URLSearchParams(params.toString());
    sp.set('range', r);
    router.push(`?${sp.toString()}`);
  }
  return (
    <div className="flex gap-1 border rounded-lg p-1">
      {RANGES.map(r => (
        <Button key={r} size="sm" variant={r === current ? 'default' : 'ghost'} onClick={() => set(r)}>
          {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
        </Button>
      ))}
    </div>
  );
}
