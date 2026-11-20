import Login from '@/components/admin/Login';
import { configured } from '@/lib/supabase';
export default function LoginPage() {
  return <Login ready={configured()} />;
}
