"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ConferenceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <h2 className="text-2xl font-semibold">Conference unavailable</h2>
        <p className="mt-2 text-muted-foreground">
          Retry once the current operation finishes.
        </p>
        <Button className="mt-6 w-full" onClick={reset}>
          Retry conference
        </Button>
      </div>
    </div>
  );
}
