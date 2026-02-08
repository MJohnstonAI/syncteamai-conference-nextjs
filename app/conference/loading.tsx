export default function LoadingConference() {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="grid h-[calc(100vh-2rem)] gap-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <div className="hidden animate-pulse rounded-lg border bg-muted/40 lg:block" />
        <div className="space-y-3">
          <div className="h-10 w-72 animate-pulse rounded bg-muted" />
          <div className="h-36 animate-pulse rounded-lg border bg-muted/40" />
          <div className="h-20 animate-pulse rounded-lg border bg-muted/40" />
          <div className="h-20 animate-pulse rounded-lg border bg-muted/40" />
          <div className="h-20 animate-pulse rounded-lg border bg-muted/40" />
        </div>
        <div className="hidden animate-pulse rounded-lg border bg-muted/40 lg:block" />
      </div>
    </div>
  );
}
