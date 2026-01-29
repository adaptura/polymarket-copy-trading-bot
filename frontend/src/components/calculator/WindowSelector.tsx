"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { RollingWindow } from "@/types";

const ROLLING_WINDOWS: { value: RollingWindow; label: string; group: string }[] = [
  { value: "7d", label: "7 days", group: "short" },
  { value: "14d", label: "14 days", group: "short" },
  { value: "30d", label: "30 days", group: "medium" },
  { value: "60d", label: "60 days", group: "medium" },
  { value: "90d", label: "90 days", group: "medium" },
  { value: "180d", label: "180 days", group: "long" },
  { value: "1y", label: "1 year", group: "long" },
  { value: "2y", label: "2 years", group: "long" },
];

interface WindowSelectorProps {
  selected: RollingWindow[];
  onChange: (windows: RollingWindow[]) => void;
}

export function WindowSelector({ selected, onChange }: WindowSelectorProps) {
  const handleToggle = (window: RollingWindow) => {
    if (selected.includes(window)) {
      onChange(selected.filter((w) => w !== window));
    } else {
      onChange([...selected, window]);
    }
  };

  const handleSelectAll = () => {
    if (selected.length === ROLLING_WINDOWS.length) {
      onChange([]);
    } else {
      onChange(ROLLING_WINDOWS.map((w) => w.value));
    }
  };

  const handleSelectGroup = (group: string) => {
    const groupWindows = ROLLING_WINDOWS.filter((w) => w.group === group).map(
      (w) => w.value
    );
    const allSelected = groupWindows.every((w) => selected.includes(w));

    if (allSelected) {
      onChange(selected.filter((w) => !groupWindows.includes(w)));
    } else {
      const newSelection = new Set([...selected, ...groupWindows]);
      onChange(Array.from(newSelection));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Analysis Windows</h3>
          <p className="text-sm text-muted-foreground">
            Select time periods to analyze
          </p>
        </div>
        <button
          onClick={handleSelectAll}
          className="text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {selected.length === ROLLING_WINDOWS.length
            ? "Clear all"
            : "Select all"}
        </button>
      </div>

      {/* Quick group selectors */}
      <div className="flex gap-2">
        {[
          { key: "short", label: "Short-term" },
          { key: "medium", label: "Medium-term" },
          { key: "long", label: "Long-term" },
        ].map(({ key, label }) => {
          const groupWindows = ROLLING_WINDOWS.filter((w) => w.group === key);
          const selectedInGroup = groupWindows.filter((w) =>
            selected.includes(w.value)
          ).length;
          const isFullySelected = selectedInGroup === groupWindows.length;

          return (
            <button
              key={key}
              onClick={() => handleSelectGroup(key)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                isFullySelected
                  ? "bg-primary/20 text-primary"
                  : selectedInGroup > 0
                  ? "bg-secondary text-foreground"
                  : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Window grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ROLLING_WINDOWS.map((window) => {
          const isSelected = selected.includes(window.value);

          return (
            <label
              key={window.value}
              className={cn(
                "relative flex items-center justify-center px-4 py-2.5 rounded-lg cursor-pointer",
                "transition-all duration-200 border text-center",
                isSelected
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-secondary/30 border-transparent text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => handleToggle(window.value)}
                className="sr-only"
              />
              <span className="text-sm font-medium">{window.label}</span>
            </label>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {selected.length} window{selected.length !== 1 ? "s" : ""} selected
      </p>
    </div>
  );
}
