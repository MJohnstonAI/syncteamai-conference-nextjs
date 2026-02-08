import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Settings, Battery, BatteryWarning, BatteryFull } from "lucide-react";

interface TokenLimitWidgetProps {
  currentTokens: number;
  limitTokens: number;
  onLimitChange: (newLimit: number) => void;
  isAdjourned: boolean;
  userTier?: string;
}

const PRESETS = [
  { label: "1K", value: 1000 },
  { label: "5K", value: 5000 },
  { label: "10K", value: 10000 },
  { label: "25K", value: 25000 },
  { label: "50K", value: 50000 },
  { label: "∞", value: 999999 },
];

export function TokenLimitWidget({
  currentTokens,
  limitTokens,
  onLimitChange,
  isAdjourned,
}: TokenLimitWidgetProps) {
  const [tempLimit, setTempLimit] = useState(limitTokens);
  const [isOpen, setIsOpen] = useState(false);

  const percentUsed = limitTokens > 0 ? (currentTokens / limitTokens) * 100 : 0;

  const getColorVariant = (percent: number): "default" | "secondary" | "destructive" => {
    if (percent >= 90) return "destructive";
    if (percent >= 70) return "secondary";
    return "default";
  };

  const getBatteryIcon = (percent: number) => {
    if (percent >= 90) return BatteryWarning;
    if (percent >= 70) return Battery;
    return BatteryFull;
  };

  const formatNumber = (n: number) => {
    if (n >= 999999) return "∞";
    if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
    return n.toString();
  };

  const handleApply = () => {
    onLimitChange(tempLimit);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setTempLimit(limitTokens);
    setIsOpen(false);
  };

  const adjustLimit = (delta: number) => {
    setTempLimit((prev) => Math.max(1000, Math.min(100000, prev + delta)));
  };

  const BatteryIcon = getBatteryIcon(percentUsed);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Badge variant={getColorVariant(percentUsed)} className="gap-1.5 font-mono">
            <BatteryIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {currentTokens.toLocaleString()} / {formatNumber(limitTokens)}
            </span>
            <span className="sm:hidden">
              {formatNumber(currentTokens)}/{formatNumber(limitTokens)}
            </span>
          </Badge>
          <Settings className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          {/* Header */}
          <div className="space-y-1">
            <h4 className="font-semibold text-sm">Token Limit Settings</h4>
            <p className="text-xs text-muted-foreground">
              Set a maximum token budget for this conference session
            </p>
          </div>

          {/* Current Usage */}
          <div className="rounded-lg bg-muted p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Current usage</span>
              <span className="font-mono font-semibold">{currentTokens.toLocaleString()}</span>
            </div>
            <div className="h-2 bg-background rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  percentUsed >= 90
                    ? "bg-destructive"
                    : percentUsed >= 70
                    ? "bg-yellow-500"
                    : "bg-primary"
                }`}
                style={{ width: `${Math.min(100, percentUsed)}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground text-right">
              {percentUsed.toFixed(1)}% of limit
            </div>
          </div>

          {/* Presets */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Quick Presets
            </label>
            <div className="grid grid-cols-6 gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  size="sm"
                  variant={tempLimit === preset.value ? "default" : "outline"}
                  onClick={() => setTempLimit(preset.value)}
                  className="text-xs h-8"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Slider */}
          {tempLimit < 999999 && (
            <div className="space-y-3">
              <label className="text-xs font-medium text-muted-foreground">
                Custom Limit
              </label>
              <Slider
                min={1000}
                max={100000}
                step={1000}
                value={[tempLimit]}
                onValueChange={([v]) => setTempLimit(v)}
                className="py-2"
              />
              <div className="text-center font-mono text-lg font-semibold">
                {tempLimit.toLocaleString()} tokens
              </div>
            </div>
          )}

          {/* Fine-tune buttons */}
          {tempLimit < 999999 && (
            <div className="flex gap-2 justify-center">
              <Button
                size="sm"
                variant="outline"
                onClick={() => adjustLimit(-1000)}
                disabled={tempLimit <= 1000}
              >
                −1K
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => adjustLimit(1000)}
                disabled={tempLimit >= 100000}
              >
                +1K
              </Button>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t">
            <Button variant="outline" onClick={handleCancel} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleApply} className="flex-1">
              Apply Limit
            </Button>
          </div>

          {/* Warning if adjourned */}
          {isAdjourned && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-xs text-destructive font-medium">
                ⚠️ Conference adjourned due to token limit
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
