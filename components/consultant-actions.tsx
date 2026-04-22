'use client';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  consultant: 'Consultant',
  jr_consultant: 'Jr Consultant',
};

const ALL_ROLES = ['owner', 'admin', 'consultant', 'jr_consultant'] as const;
type Role = typeof ALL_ROLES[number];

interface Props {
  id: string;
  isApproved: boolean;
  isAdmin: boolean;
  isDeactivated: boolean;
  currentRole: Role;
  viewerRole: 'owner' | 'admin';
  viewerId: string;
}

export function ConsultantActions({ id, isApproved, isDeactivated, currentRole, viewerRole, viewerId }: Props) {
  const router = useRouter();

  async function call(endpoint: string, body: Record<string, unknown> = {}) {
    await fetch(`/api/admin/consultants/${id}/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    router.refresh();
  }

  async function changeRole(role: Role) {
    await fetch(`/api/admin/consultants/${id}/role`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    router.refresh();
  }

  function confirmDelete() {
    const ans = prompt('Type DELETE to confirm hard-delete of this consultant');
    if (ans === 'DELETE') call('delete');
  }

  const isOwnerViewer = viewerRole === 'owner';
  const isSelf = id === viewerId;
  const isTargetOwner = currentRole === 'owner';

  // Owner can change roles, except: not their own row, not demoting another owner
  const canChangeRole = isOwnerViewer && !isSelf && !isTargetOwner;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">Actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!isApproved && <DropdownMenuItem onClick={() => call('approve')}>Approve</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => call('signout')}>Force sign-out</DropdownMenuItem>
        {!isDeactivated && <DropdownMenuItem onClick={() => call('deactivate')}>Deactivate</DropdownMenuItem>}

        {isOwnerViewer && (
          <>
            <DropdownMenuSeparator />
            {canChangeRole ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Change role</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {ALL_ROLES.map(role => (
                    <DropdownMenuItem
                      key={role}
                      onClick={() => changeRole(role)}
                      className={role === currentRole ? 'font-semibold' : ''}
                    >
                      {ROLE_LABELS[role]}{role === currentRole ? ' (current)' : ''}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : (
              <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                {isSelf ? 'Cannot change own role' : isTargetOwner ? 'Cannot demote owner' : 'Change role'}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={confirmDelete} className="text-destructive">
              Delete account
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
