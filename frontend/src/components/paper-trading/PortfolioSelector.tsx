"use client";

import { cn } from "@/lib/utils";
import { Wallet, TrendingUp, TrendingDown } from "lucide-react";

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
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {portfolios.map((portfolio) => {
        const isSelected = portfolio.id === selectedId;
        const isPositive = portfolio.totalPnl >= 0;

        return (
          <button
            key={portfolio.id}
            onClick={() => onSelect(portfolio.id)}
            className={cn(
              "flex-shrink-0 min-w-[200px] p-4 rounded-xl border transition-all duration-200",
              isSelected
                ? "bg-primary/10 border-primary/50"
                : "bg-surface-2 border-border/50 hover:border-border"
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  isSelected ? "bg-primary/20" : "bg-surface-3"
                )}
              >
                <Wallet className="w-4 h-4 text-primary" />
              </div>
              <span className="font-medium truncate">{portfolio.name}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-lg font-bold font-mono">
                {formatCurrency(portfolio.totalEquity)}
              </span>
              <div
                className={cn(
                  "flex items-center gap-1 text-sm font-medium",
                  isPositive ? "text-profit" : "text-loss"
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

            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span>{portfolio.openPositions} positions</span>
              <span>{portfolio.tradeCount} trades</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
