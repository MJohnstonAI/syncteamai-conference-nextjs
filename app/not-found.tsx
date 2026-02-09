"use client";

import { Suspense } from "react";
import NotFoundPage from "@/views/NotFound";

function LoadingNotFoundPage() {
  return (
    <div className="min-h-screen bg-background p-6" aria-busy="true" aria-live="polite">
      <div className="mx-auto mt-20 w-full max-w-md space-y-4 rounded-lg border bg-card p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">Loading page status...</p>
        <div className="h-10 w-20 animate-pulse rounded bg-muted" />
        <div className="h-6 w-56 animate-pulse rounded bg-muted" />
        <div className="h-5 w-36 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

export default function NotFound() {
  return (
    <Suspense fallback={<LoadingNotFoundPage />}>
      <NotFoundPage />
    </Suspense>
  );
}
