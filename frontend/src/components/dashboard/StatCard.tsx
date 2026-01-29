"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon,
  className,
}: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;
  const changeColor = isPositive ? "text-profit" : "text-loss";
  const glowClass = isPositive ? "glow-profit" : "glow-loss";

  return (
    <div
      className={cn(
        "stat-card glass-card relative overflow-hidden rounded-xl p-5 border border-border/50",
        className
      )}
    >
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />

      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-muted-foreground">
            {title}
          </span>
          {icon && (
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              {icon}
            </div>
          )}
        </div>

        <div className="flex items-end justify-between">
          <div className="space-y-1">
            <div className="text-2xl font-bold font-mono tracking-tight">
              {value}
            </div>

            {change !== undefined && (
              <div className={cn("flex items-center gap-1.5", changeColor)}>
                {isPositive ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                <span className="text-sm font-medium font-mono">
                  {isPositive ? "+" : ""}
                  {change.toFixed(1)}%
                </span>
                {changeLabel && (
                  <span className="text-xs text-muted-foreground">
                    {changeLabel}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Accent glow on hover */}
      {change !== undefined && (
        <div
          className={cn(
            "absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100",
            glowClass
          )}
        />
      )}
    </div>
  );
}
