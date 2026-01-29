"use client";

import { cn } from "@/lib/utils";
import type { TimeRange } from "@/types";

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "1D", label: "1D" },
  { value: "7D", label: "7D" },
  { value: "30D", label: "30D" },
  { value: "90D", label: "90D" },
  { value: "1Y", label: "1Y" },
  { value: "All", label: "All" },
];

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
}

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-secondary/50">
      {TIME_RANGES.map((range) => {
        const isActive = value === range.value;

        return (
          <button
            key={range.value}
            onClick={() => onChange(range.value)}
            className={cn(
              "relative px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
              isActive
                ? "text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {/* Background for active state */}
            {isActive && (
              <div
                className="absolute inset-0 rounded-md bg-primary"
                style={{
                  boxShadow: "0 0 12px oklch(0.75 0.18 195 / 0.4)",
                }}
              />
            )}
            <span className="relative z-10">{range.label}</span>
          </button>
        );
      })}
    </div>
  );
}
