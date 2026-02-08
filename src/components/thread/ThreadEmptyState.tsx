import { MessageCircleOff } from "lucide-react";

export function ThreadEmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-lg border border-dashed bg-card/40 p-8 text-center">
      <MessageCircleOff className="mx-auto h-8 w-8 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-semibold">No comments to show</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasFilters
          ? "Try clearing round/agent filters."
          : "Start the conference by posting a message below."}
      </p>
    </div>
  );
}
