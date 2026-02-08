export default function LoadingSettings() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="h-8 w-56 animate-pulse rounded bg-muted" />
        <div className="h-52 animate-pulse rounded-lg border bg-muted/40" />
        <div className="h-44 animate-pulse rounded-lg border bg-muted/40" />
      </div>
    </div>
  );
}
