"use client";

import { useMemo } from "react";
import type { ActivityDataPoint } from "@/types";

interface ActivityHeatmapProps {
  data: ActivityDataPoint[];
  color?: string;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function ActivityHeatmap({
  data,
  color = "oklch(0.75 0.18 195)",
}: ActivityHeatmapProps) {
  const { grid, maxCount } = useMemo(() => {
    const grid: Map<string, number> = new Map();
    let maxCount = 0;

    data.forEach((point) => {
      const key = `${point.dayOfWeek}-${point.hour}`;
      grid.set(key, point.tradeCount);
      if (point.tradeCount > maxCount) {
        maxCount = point.tradeCount;
      }
    });

    return { grid, maxCount };
  }, [data]);

  const getIntensity = (day: number, hour: number): number => {
    const key = `${day}-${hour}`;
    const count = grid.get(key) || 0;
    return maxCount > 0 ? count / maxCount : 0;
  };

  const getCellColor = (intensity: number): string => {
    if (intensity === 0) return "oklch(0.15 0.01 260)";
    // Interpolate between base dark and accent color
    const alpha = 0.2 + intensity * 0.8;
    return `oklch(0.75 0.18 195 / ${alpha})`;
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Hour labels */}
          <div className="flex items-center gap-1 ml-12 mb-2">
            {HOURS.filter((h) => h % 3 === 0).map((hour) => (
              <div
                key={hour}
                className="text-xs text-muted-foreground font-mono"
                style={{ width: "calc((100% - 48px) / 8)", minWidth: "40px" }}
              >
                {hour.toString().padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="space-y-1">
            {DAYS.map((day, dayIndex) => (
              <div key={day} className="flex items-center gap-2">
                <span className="w-10 text-xs text-muted-foreground font-medium">
                  {day}
                </span>
                <div className="flex-1 flex gap-0.5">
                  {HOURS.map((hour) => {
                    const intensity = getIntensity(dayIndex, hour);
                    const count = grid.get(`${dayIndex}-${hour}`) || 0;

                    return (
                      <div
                        key={`${day}-${hour}`}
                        className="flex-1 aspect-square rounded-sm transition-all duration-200 hover:scale-110 hover:z-10 relative group cursor-default"
                        style={{
                          backgroundColor: getCellColor(intensity),
                          boxShadow:
                            intensity > 0.5
                              ? `0 0 ${intensity * 10}px ${color}40`
                              : "none",
                        }}
                      >
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                          <div className="glass-card px-2 py-1 rounded text-xs whitespace-nowrap">
                            <span className="font-medium">{day}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              {hour.toString().padStart(2, "0")}:00
                            </span>
                            <span className="text-primary font-mono ml-2">
                              {count} trades
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <span>Less</span>
        <div className="flex gap-0.5">
          {[0, 0.25, 0.5, 0.75, 1].map((intensity) => (
            <div
              key={intensity}
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: getCellColor(intensity) }}
            />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
