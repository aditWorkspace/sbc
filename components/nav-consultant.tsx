import Link from 'next/link';

interface Props { name: string; isAdmin: boolean }

export function NavConsultant({ name, isAdmin }: Props) {
  return (
    <nav className="border-b">
      <div className="max-w-4xl mx-auto flex items-center justify-between px-6 h-14">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold">SBC Sourcing</Link>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">Dashboard</Link>
          <Link href="/uploads" className="text-sm text-muted-foreground hover:text-foreground">Uploads</Link>
          <Link href="/sheets" className="text-sm text-muted-foreground hover:text-foreground">Sheets</Link>
          {isAdmin && <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">Admin</Link>}
        </div>
        <span className="text-sm text-muted-foreground">{name}</span>
      </div>
    </nav>
  );
}
