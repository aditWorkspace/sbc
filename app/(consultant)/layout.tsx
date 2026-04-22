import { redirect } from 'next/navigation';
import { currentConsultant } from '@/lib/auth/current';
import { NavConsultant } from '@/components/nav-consultant';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const c = await currentConsultant();
  if (!c) redirect('/sign-in');
  if (!c.is_approved) redirect('/pending');
  return (
    <div>
      <NavConsultant name={c.display_name ?? c.email} isAdmin={c.is_admin} />
      <main className="max-w-4xl mx-auto p-6">{children}</main>
    </div>
  );
}
