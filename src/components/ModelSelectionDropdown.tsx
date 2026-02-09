import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  getModelsByProvider,
  getProviderLogo,
  type OpenRouterModel,
} from '@/data/openRouterModels';

interface ModelSelectionDropdownProps {
  selectedModels: string[];
  onSelectionChange: (models: string[]) => void;
  disabled?: boolean;
  maxSelections?: number;
  openSignal?: number;
  emphasize?: boolean;
}

export function ModelSelectionDropdown({
  selectedModels,
  onSelectionChange,
  disabled = false,
  maxSelections = 6,
  openSignal,
  emphasize = false,
}: ModelSelectionDropdownProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!disabled && typeof openSignal === "number" && openSignal > 0) {
      setOpen(true);
    }
  }, [disabled, openSignal]);

  const groupedModels = useMemo(() => getModelsByProvider(), []);

  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groupedModels;
    const filtered: Record<string, OpenRouterModel[]> = {};
    Object.entries(groupedModels).forEach(([provider, models]) => {
      const matchingModels = models.filter(
        (m) =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          provider.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (matchingModels.length > 0) {
        filtered[provider] = matchingModels;
      }
    });
    return filtered;
  }, [groupedModels, searchQuery]);

  const toggleModel = (modelId: string) => {
    const isSelected = selectedModels.includes(modelId);
    if (isSelected) {
      onSelectionChange(selectedModels.filter((id) => id !== modelId));
    } else {
      if (selectedModels.length >= maxSelections) return;
      onSelectionChange([...selectedModels, modelId]);
    }
  };

  const selectedCount = selectedModels.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between",
            emphasize && "ring-1 ring-primary/40 ring-offset-1"
          )}
          disabled={disabled}
        >
          <span className="truncate">
            {selectedCount === 0
              ? 'Select models...'
              : `${selectedCount} model${selectedCount === 1 ? '' : 's'} selected`}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="max-h-[320px] overflow-y-auto p-1">
            {Object.keys(filteredGroups).length === 0 ? (
              <CommandEmpty>No models found.</CommandEmpty>
            ) : (
              Object.entries(filteredGroups).map(([provider, models]) => (
                <CommandGroup
                  key={provider}
                  heading={
                    <div className="flex items-center gap-2">
                      <span>{getProviderLogo(provider)}</span>
                      <span className="capitalize">{provider}</span>
                    </div>
                  }
                >
                  {models.map((model) => {
                    const isSelected = selectedModels.includes(model.id);
                    return (
                      <CommandItem
                        key={model.id}
                        value={model.id}
                        onSelect={() => toggleModel(model.id)}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <div
                            className={cn(
                              'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                              isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'opacity-50'
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium">{model.name}</div>
                            {model.description && (
                              <div className="text-xs text-muted-foreground truncate">
                                {model.description}
                              </div>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {model.tier}
                          </Badge>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))
            )}
          </div>
          <div className="border-t p-2 text-xs text-muted-foreground flex justify-between items-center">
            <span>Selected: {selectedCount}/{maxSelections}</span>
            {selectedCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => onSelectionChange([])}>
                Clear all
              </Button>
            )}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
