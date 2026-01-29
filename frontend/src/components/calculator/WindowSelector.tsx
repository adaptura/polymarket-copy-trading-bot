"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { RollingWindow } from "@/types";

const ROLLING_WINDOWS: { value: RollingWindow; label: string; group: string }[] = [
  { value: "10m", label: "10m", group: "minutes" },
  { value: "30m", label: "30m", group: "minutes" },
  { value: "1h", label: "1h", group: "hours" },
  { value: "6h", label: "6h", group: "hours" },
  { value: "24h", label: "24h", group: "hours" },
  { value: "2d", label: "2d", group: "days" },
  { value: "3d", label: "3d", group: "days" },
  { value: "5d", label: "5d", group: "days" },
  { value: "7d", label: "7d", group: "days" },
  { value: "14d", label: "14d", group: "weeks" },
  { value: "21d", label: "21d", group: "weeks" },
  { value: "28d", label: "28d", group: "weeks" },
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
          <h3 className="font-medium">Rolling Windows</h3>
          <p className="text-sm text-muted-foreground">
            Select windows to analyze
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
        {["minutes", "hours", "days", "weeks"].map((group) => {
          const groupWindows = ROLLING_WINDOWS.filter((w) => w.group === group);
          const selectedInGroup = groupWindows.filter((w) =>
            selected.includes(w.value)
          ).length;
          const isFullySelected = selectedInGroup === groupWindows.length;

          return (
            <button
              key={group}
              onClick={() => handleSelectGroup(group)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize",
                isFullySelected
                  ? "bg-primary/20 text-primary"
                  : selectedInGroup > 0
                  ? "bg-secondary text-foreground"
                  : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
              )}
            >
              {group}
            </button>
          );
        })}
      </div>

      {/* Window grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-2">
        {ROLLING_WINDOWS.map((window) => {
          const isSelected = selected.includes(window.value);

          return (
            <label
              key={window.value}
              className={cn(
                "relative flex items-center justify-center px-3 py-2 rounded-lg cursor-pointer",
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
              <span className="text-sm font-mono font-medium">
                {window.label}
              </span>
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
