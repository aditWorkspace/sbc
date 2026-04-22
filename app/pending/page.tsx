export default function Pending() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-2">
        <h1 className="text-xl font-semibold">Waiting for admin approval</h1>
        <p className="text-sm text-muted-foreground">
          Your account is created but not yet approved. An admin will approve you shortly.
        </p>
      </div>
    </main>
  );
}
