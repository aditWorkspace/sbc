import { SignInButton } from '@/components/sign-in-button';

export default function SignIn() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-sm w-full text-center space-y-4">
        <h1 className="text-2xl font-bold">SBC Consulting — Sourcing</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with your @berkeley.edu Google account.
        </p>
        <SignInButton />
      </div>
    </main>
  );
}
