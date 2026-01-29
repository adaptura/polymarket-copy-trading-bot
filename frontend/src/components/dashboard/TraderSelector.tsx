"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Trader } from "@/types";
import { formatCurrency } from "@/lib/mock-data";

interface TraderSelectorProps {
  traders: Trader[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function TraderSelector({
  traders,
  selectedIds,
  onSelectionChange,
}: TraderSelectorProps) {
  const handleToggle = (traderId: string) => {
    if (selectedIds.includes(traderId)) {
      onSelectionChange(selectedIds.filter((id) => id !== traderId));
    } else {
      onSelectionChange([...selectedIds, traderId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === traders.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(traders.map((t) => t.id));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Traders
        </span>
        <button
          onClick={handleSelectAll}
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {selectedIds.length === traders.length ? "Clear all" : "Select all"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {traders.map((trader) => {
          const isSelected = selectedIds.includes(trader.id);
          const pnlColor = trader.totalPnL >= 0 ? "text-profit" : "text-loss";

          return (
            <label
              key={trader.id}
              className={`
                group relative flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer
                transition-all duration-200 border
                ${
                  isSelected
                    ? "bg-secondary/80 border-primary/30"
                    : "bg-secondary/30 border-transparent hover:bg-secondary/50"
                }
              `}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => handleToggle(trader.id)}
                className="sr-only"
              />

              {/* Color indicator */}
              <div
                className="w-2.5 h-2.5 rounded-full transition-transform duration-200"
                style={{
                  backgroundColor: trader.color,
                  boxShadow: isSelected
                    ? `0 0 8px ${trader.color}`
                    : "none",
                  transform: isSelected ? "scale(1.2)" : "scale(1)",
                }}
              />

              {/* Trader info */}
              <div className="flex flex-col">
                <span
                  className={`text-sm font-medium transition-colors ${
                    isSelected ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {trader.name}
                </span>
                <span className={`text-xs font-mono ${pnlColor}`}>
                  {formatCurrency(trader.totalPnL, true)}
                </span>
              </div>

              {/* Selection indicator */}
              {isSelected && (
                <div
                  className="absolute inset-0 rounded-lg pointer-events-none"
                  style={{
                    boxShadow: `inset 0 0 0 1px ${trader.color}40`,
                  }}
                />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
