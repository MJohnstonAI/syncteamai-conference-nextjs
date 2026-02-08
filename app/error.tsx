"use client";

import { useEffect } from "react";
import { HomeIcon } from "@/components/HomeIcon";
import { Button } from "@/components/ui/button";

export default function Error({
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
      <div className="fixed top-6 left-6 z-50">
        <HomeIcon />
      </div>
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <h2 className="text-2xl font-semibold">Something went wrong</h2>
        <p className="mt-2 text-muted-foreground">Please retry the last action.</p>
        <Button className="mt-6 w-full" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
