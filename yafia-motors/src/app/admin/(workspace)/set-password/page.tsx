import { redirect } from 'next/navigation';
import Login from '@/components/admin/Login';
import { authorize } from '@/lib/supabase';
export default async function PasswordPage() {
  try {
    await authorize();
  } catch {
    redirect('/admin/login/');
  }
  return <Login ready password />;
}
