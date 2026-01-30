"use client";

import { cn } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Beaker,
} from "lucide-react";

interface Portfolio {
  id: string;
  name: string;
  totalEquity: number;
  totalPnl: number;
  totalPnlPercent: number;
  openPositions: number;
  tradeCount: number;
}

interface PortfolioSelectorProps {
  portfolios: Portfolio[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function PortfolioSelector({
  portfolios,
  selectedId,
  onSelect,
}: PortfolioSelectorProps) {
  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
    if (Math.abs(value) >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="relative">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-4 rounded-full bg-gradient-to-b from-cyan to-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Portfolios
        </span>
        <span className="text-xs text-muted-foreground/60">
          ({portfolios.length})
        </span>
      </div>

      {/* Portfolio cards carousel */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {portfolios.map((portfolio, index) => {
          const isSelected = portfolio.id === selectedId;
          const isPositive = portfolio.totalPnl >= 0;

          return (
            <button
              key={portfolio.id}
              onClick={() => onSelect(portfolio.id)}
              className={cn(
                "group relative flex-shrink-0 w-[260px] rounded-xl border transition-all duration-300",
                "animate-slide-up",
                isSelected
                  ? "border-cyan/40 shadow-lg shadow-cyan/5"
                  : "border-border/50 hover:border-border/80"
              )}
              style={{
                animationDelay: `${index * 50}ms`,
                background: isSelected
                  ? 'linear-gradient(135deg, var(--card) 0%, color-mix(in oklch, var(--cyan) 5%, var(--card)) 100%)'
                  : 'var(--card)'
              }}
            >
              {/* Selected indicator glow */}
              {isSelected && (
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan/5 to-transparent pointer-events-none" />
              )}

              <div className="relative p-4">
                {/* Header with icon and name */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "relative w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                        isSelected
                          ? "bg-gradient-to-br from-cyan/20 to-primary/10 border border-cyan/20"
                          : "bg-surface-2 group-hover:bg-surface-3"
                      )}
                    >
                      <Beaker
                        className={cn(
                          "w-5 h-5 transition-colors",
                          isSelected ? "text-cyan" : "text-muted-foreground group-hover:text-foreground"
                        )}
                      />
                      {isSelected && (
                        <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-cyan animate-pulse" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <span
                        className={cn(
                          "block font-semibold truncate max-w-[140px] transition-colors",
                          isSelected ? "text-foreground" : "text-foreground/80 group-hover:text-foreground"
                        )}
                      >
                        {portfolio.name}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {portfolio.tradeCount} trades
                      </span>
                    </div>
                  </div>

                  <ChevronRight
                    className={cn(
                      "w-4 h-4 transition-all",
                      isSelected
                        ? "text-cyan opacity-100"
                        : "text-muted-foreground opacity-0 group-hover:opacity-100 translate-x-0 group-hover:translate-x-0.5"
                    )}
                  />
                </div>

                {/* Equity and P&L */}
                <div className="space-y-2">
                  <div className="flex items-end justify-between">
                    <span className="text-2xl font-bold font-mono tracking-tight">
                      {formatCurrency(portfolio.totalEquity)}
                    </span>
                    <div
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium font-mono",
                        isPositive
                          ? "bg-profit/10 text-profit"
                          : "bg-loss/10 text-loss"
                      )}
                    >
                      {isPositive ? (
                        <TrendingUp className="w-3.5 h-3.5" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {isPositive ? "+" : ""}
                        {portfolio.totalPnlPercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Mini stats bar */}
                  <div className="flex items-center gap-4 pt-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-violet-500/60" />
                      <span className="text-xs text-muted-foreground">
                        {portfolio.openPositions} positions
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          isPositive ? "bg-profit/60" : "bg-loss/60"
                        )}
                      />
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(portfolio.totalPnl)} P&L
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom accent line */}
                <div
                  className={cn(
                    "absolute bottom-0 left-4 right-4 h-[2px] rounded-full transition-all duration-300",
                    isSelected
                      ? "bg-gradient-to-r from-cyan/60 via-primary/40 to-transparent"
                      : "bg-transparent group-hover:bg-border/50"
                  )}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
