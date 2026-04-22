import { redirect } from 'next/navigation';
import { currentConsultant } from '@/lib/auth/current';

export default async function Home() {
  const c = await currentConsultant();
  if (!c) redirect('/sign-in');
  if (!c.is_approved) redirect('/pending');
  if (c.is_admin) redirect('/admin');
  redirect('/dashboard');
}
