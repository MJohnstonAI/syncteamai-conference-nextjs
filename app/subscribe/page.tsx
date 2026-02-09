"use client";

import { Suspense } from "react";
import SubscribePage from "@/views/Subscribe";

function LoadingSubscribePage() {
  return (
    <div className="min-h-screen bg-background p-6" aria-busy="true" aria-live="polite">
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">Loading subscription options...</p>
        <div className="h-12 w-64 animate-pulse rounded bg-muted" />
        <div className="h-96 w-full animate-pulse rounded-lg border bg-muted/40" />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingSubscribePage />}>
      <SubscribePage />
    </Suspense>
  );
}
