'use client';
import { Button } from '@/components/ui/button';
import { supabaseBrowser } from '@/lib/supabase/client';

export function SignInButton() {
  const signIn = async () => {
    const supa = supabaseBrowser();
    await supa.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: 'berkeley.edu', prompt: 'select_account' },
      },
    });
  };
  return <Button onClick={signIn}>Sign in with Google</Button>;
}
