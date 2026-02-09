"use client";

import { Suspense } from "react";
import AuthPage from "@/views/Auth";

function LoadingAuthPage() {
  return (
    <div className="min-h-screen bg-background p-4" aria-busy="true" aria-live="polite">
      <div className="mx-auto mt-20 w-full max-w-md space-y-4">
        <p className="text-sm text-muted-foreground">Loading sign-in...</p>
        <div className="h-10 w-40 animate-pulse rounded bg-muted" />
        <div className="h-56 w-full animate-pulse rounded-lg border bg-muted/40" />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingAuthPage />}>
      <AuthPage />
    </Suspense>
  );
}
