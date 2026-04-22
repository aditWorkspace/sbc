import { redirect } from 'next/navigation';
import { currentConsultant } from '@/lib/auth/current';
import { NavAdmin } from '@/components/nav-admin';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const c = await currentConsultant();
  if (!c) redirect('/sign-in');
  if (!c.is_approved) redirect('/pending');
  if (!c.is_admin) redirect('/dashboard');
  return (
    <div>
      <NavAdmin name={c.display_name ?? c.email} />
      <main className="max-w-6xl mx-auto p-6">{children}</main>
    </div>
  );
}
