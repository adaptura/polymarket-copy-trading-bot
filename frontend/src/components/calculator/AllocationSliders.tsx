"use client";

import { Slider } from "@/components/ui/slider";
import type { TraderAllocation } from "@/types";
import { formatCurrency } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface AllocationSlidersProps {
  allocations: TraderAllocation[];
  onChange: (allocations: TraderAllocation[]) => void;
  totalCapital?: number;
}

export function AllocationSliders({
  allocations,
  onChange,
  totalCapital = 100000,
}: AllocationSlidersProps) {
  const totalPercentage = allocations.reduce((sum, a) => sum + a.percentage, 0);
  const isValid = Math.abs(totalPercentage - 100) < 0.1;

  const handleChange = (traderId: string, newValue: number) => {
    const updated = allocations.map((a) =>
      a.traderId === traderId ? { ...a, percentage: newValue } : a
    );
    onChange(updated);
  };

  const handleNormalize = () => {
    if (totalPercentage === 0) return;
    const normalized = allocations.map((a) => ({
      ...a,
      percentage: Math.round((a.percentage / totalPercentage) * 100),
    }));
    // Ensure exactly 100
    const diff = 100 - normalized.reduce((sum, a) => sum + a.percentage, 0);
    if (normalized.length > 0 && diff !== 0) {
      normalized[0].percentage += diff;
    }
    onChange(normalized);
  };

  const handleEqualSplit = () => {
    const activeCount =
      allocations.filter((a) => a.percentage > 0).length || allocations.length;
    const equalShare = Math.floor(100 / activeCount);
    const remainder = 100 - equalShare * activeCount;

    let remainderDistributed = 0;
    const equalized = allocations.map((a) => ({
      ...a,
      percentage:
        a.percentage > 0 || activeCount === allocations.length
          ? equalShare + (remainderDistributed++ < remainder ? 1 : 0)
          : 0,
    }));
    onChange(equalized);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Portfolio Allocation</h3>
          <p className="text-sm text-muted-foreground">
            Distribute capital across traders
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEqualSplit}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-secondary/50 hover:bg-secondary transition-colors"
          >
            Equal Split
          </button>
          <button
            onClick={handleNormalize}
            disabled={isValid}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Normalize to 100%
          </button>
        </div>
      </div>

      {/* Total indicator */}
      <div
        className={`flex items-center justify-between p-3 rounded-lg ${
          isValid
            ? "bg-profit/10 border border-profit/20"
            : "bg-loss/10 border border-loss/20"
        }`}
      >
        <span className="text-sm font-medium">Total Allocation</span>
        <span
          className={`font-mono font-bold ${
            isValid ? "text-profit" : "text-loss"
          }`}
        >
          {totalPercentage.toFixed(1)}%
        </span>
      </div>

      {/* Sliders */}
      <div className="space-y-5">
        {allocations.map((allocation) => {
          const capitalAmount = (allocation.percentage / 100) * totalCapital;
          const traderPnl = allocation.totalPnl ?? 0;

          return (
            <div key={allocation.traderId} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: allocation.color,
                      boxShadow: `0 0 8px ${allocation.color}`,
                    }}
                  />
                  <span className="font-medium">{allocation.traderName}</span>
                  <span
                    className={cn(
                      "text-xs font-mono",
                      traderPnl >= 0 ? "text-profit" : "text-loss"
                    )}
                  >
                    ({formatCurrency(traderPnl, true)})
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground font-mono">
                    {formatCurrency(capitalAmount, true)}
                  </span>
                  <span className="w-12 text-right font-mono font-bold">
                    {allocation.percentage}%
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Slider
                  value={[allocation.percentage]}
                  onValueChange={([value]) =>
                    handleChange(allocation.traderId, value)
                  }
                  max={100}
                  step={1}
                  className="flex-1"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
