import { Skeleton } from "@/components/ui/skeleton";

export function ThreadSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-20 w-[92%] rounded-lg" />
      <Skeleton className="h-20 w-[86%] rounded-lg" />
    </div>
  );
}
