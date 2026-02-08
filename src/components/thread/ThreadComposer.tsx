import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ThreadComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  disabled,
  pending,
  placeholder,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  disabled?: boolean;
  pending?: boolean;
  placeholder?: string;
  compact?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? "Write a reply..."}
        className={compact ? "min-h-[88px] resize-y" : "min-h-[120px] resize-y"}
        disabled={disabled || pending}
      />
      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={disabled || pending}
          >
            Cancel
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          onClick={onSubmit}
          disabled={disabled || pending || value.trim().length === 0}
          className="min-w-24"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span className="ml-1">Reply</span>
        </Button>
      </div>
    </div>
  );
}
