import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function RoundPill({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("h-6 rounded-full px-2 text-[11px] font-medium", className)}
    >
      {label}
    </Badge>
  );
}
