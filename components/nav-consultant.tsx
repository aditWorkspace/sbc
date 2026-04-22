'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props { name: string; isAdmin: boolean }

const NAV_ITEMS = [
  { label: 'DASHBOARD', href: '/dashboard' },
  { label: 'HISTORY', href: '/history' },
];

export function NavConsultant({ name, isAdmin }: Props) {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-background sticky top-0 z-50">
      <div className="max-w-4xl mx-auto flex items-center justify-between px-6 h-14">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="font-mono text-sm font-medium tracking-widest uppercase text-foreground hover:text-primary transition-colors"
          >
            SBC SOURCING
          </Link>
          {NAV_ITEMS.map(({ label, href }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'font-mono text-xs font-medium tracking-[1.2px] uppercase transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin"
              className={[
                'font-mono text-xs font-medium tracking-[1.2px] uppercase transition-colors',
                pathname.startsWith('/admin')
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              ADMIN
            </Link>
          )}
        </div>
        <span className="font-mono text-xs text-muted-foreground tracking-wide">{name}</span>
      </div>
    </nav>
  );
}
