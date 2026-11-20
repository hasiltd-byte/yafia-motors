import { redirect } from 'next/navigation';
import { authorize } from '@/lib/supabase';
import Dashboard from '@/components/admin/Dashboard';
export default async function AdminPage() {
  let identity;
  try {
    const { role, user } = await authorize();
    identity = { role, email: user.email || '' };
  } catch {
    redirect('/admin/login/');
  }
  return <Dashboard identity={identity} />;
}
