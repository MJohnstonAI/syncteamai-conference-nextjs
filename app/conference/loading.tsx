export default function LoadingConference() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="h-8 w-72 animate-pulse rounded bg-muted" />
        <div className="h-[70vh] animate-pulse rounded-lg border bg-muted/40" />
      </div>
    </div>
  );
}
