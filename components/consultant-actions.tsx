'use client';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';

interface Props {
  id: string;
  isApproved: boolean;
  isAdmin: boolean;
  isDeactivated: boolean;
}

export function ConsultantActions({ id, isApproved, isAdmin, isDeactivated }: Props) {
  const router = useRouter();

  async function call(endpoint: string, body: any = {}) {
    await fetch(`/api/admin/consultants/${id}/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    router.refresh();
  }
  function confirmDelete() {
    const ans = prompt('Type DELETE to confirm hard-delete of this consultant');
    if (ans === 'DELETE') call('delete');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">Actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!isApproved && <DropdownMenuItem onClick={() => call('approve')}>Approve</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => call('signout')}>Force sign-out</DropdownMenuItem>
        {!isDeactivated && <DropdownMenuItem onClick={() => call('deactivate')}>Deactivate</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => call('promote', { make_admin: !isAdmin })}>
          {isAdmin ? 'Demote to consultant' : 'Promote to admin'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={confirmDelete} className="text-destructive">
          Delete account
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
