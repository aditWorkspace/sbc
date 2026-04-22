import Link from 'next/link';

export function NavAdmin({ name }: { name: string }) {
  return (
    <nav className="border-b">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-14">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="font-semibold">SBC Admin</Link>
          <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">Overview</Link>
          <Link href="/admin/consultants" className="text-sm text-muted-foreground hover:text-foreground">Consultants</Link>
          <Link href="/admin/templates" className="text-sm text-muted-foreground hover:text-foreground">Templates</Link>
          <Link href="/admin/pool" className="text-sm text-muted-foreground hover:text-foreground">Pool</Link>
          <Link href="/admin/settings" className="text-sm text-muted-foreground hover:text-foreground">Settings</Link>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">← Consultant view</Link>
        </div>
        <span className="text-sm text-muted-foreground">{name}</span>
      </div>
    </nav>
  );
}
