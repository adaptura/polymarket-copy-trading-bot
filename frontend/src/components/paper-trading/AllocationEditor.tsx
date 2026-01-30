"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Users, Zap, Percent, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Allocation {
  id: string;
  traderAddress: string;
  traderAlias: string | null;
  traderColor: string | null;
  allocationPercent: number;
  maxPositionUsd: number | null;
  isActive: boolean;
}

interface Trader {
  address: string;
  alias: string;
  color: string;
}

interface AllocationEditorProps {
  portfolioId: string;
  onUpdate?: () => void;
}

export function AllocationEditor({
  portfolioId,
  onUpdate,
}: AllocationEditorProps) {
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [availableTraders, setAvailableTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTrader, setSelectedTrader] = useState<string>("");
  const [newAllocationPercent, setNewAllocationPercent] = useState(100);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [allocResponse, tradersResponse] = await Promise.all([
          fetch(`/api/paper-trading/portfolios/${portfolioId}/allocations`),
          fetch("/api/traders"),
        ]);

        if (allocResponse.ok) {
          const allocData = await allocResponse.json();
          setAllocations(allocData.allocations);
        }

        if (tradersResponse.ok) {
          const tradersData = await tradersResponse.json();
          setAvailableTraders(tradersData.traders || []);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [portfolioId]);

  const handleAddAllocation = async () => {
    if (!selectedTrader) return;

    setSaving(true);
    try {
      const response = await fetch(
        `/api/paper-trading/portfolios/${portfolioId}/allocations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            traderAddress: selectedTrader,
            allocationPercent: newAllocationPercent,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add allocation");
      }

      const data = await response.json();
      const trader = availableTraders.find((t) => t.address === selectedTrader);

      setAllocations((prev) => [
        ...prev.filter((a) => a.traderAddress !== selectedTrader),
        {
          ...data.allocation,
          traderAlias: trader?.alias || null,
          traderColor: trader?.color || null,
        },
      ]);

      setSelectedTrader("");
      setNewAllocationPercent(100);
      onUpdate?.();
    } catch (error) {
      console.error("Error adding allocation:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateAllocation = async (
    traderAddress: string,
    percent: number
  ) => {
    setSaving(true);
    try {
      await fetch(
        `/api/paper-trading/portfolios/${portfolioId}/allocations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            traderAddress,
            allocationPercent: percent,
          }),
        }
      );

      setAllocations((prev) =>
        prev.map((a) =>
          a.traderAddress === traderAddress
            ? { ...a, allocationPercent: percent }
            : a
        )
      );
      onUpdate?.();
    } catch (error) {
      console.error("Error updating allocation:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAllocation = async (traderAddress: string) => {
    setSaving(true);
    try {
      await fetch(
        `/api/paper-trading/portfolios/${portfolioId}/allocations?traderAddress=${traderAddress}`,
        { method: "DELETE" }
      );

      setAllocations((prev) =>
        prev.filter((a) => a.traderAddress !== traderAddress)
      );
      onUpdate?.();
    } catch (error) {
      console.error("Error removing allocation:", error);
    } finally {
      setSaving(false);
    }
  };

  // Filter out already allocated traders
  const unallocatedTraders = availableTraders.filter(
    (t) => !allocations.some((a) => a.traderAddress === t.address && a.isActive)
  );

  // Calculate total allocation
  const totalAllocation = allocations
    .filter((a) => a.isActive)
    .reduce((sum, a) => sum + a.allocationPercent, 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-12 h-12 rounded-xl bg-surface-2 flex items-center justify-center mb-3">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">Loading allocations...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add new allocation card */}
      <div className="relative rounded-2xl overflow-hidden border border-border/50 bg-card">
        {/* Header accent */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/50 via-cyan/30 to-transparent" />

        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Plus className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Add Trader</h3>
              <p className="text-xs text-muted-foreground">
                Track a new trader's trades in this portfolio
              </p>
            </div>
          </div>

          {unallocatedTraders.length === 0 ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-surface-2 border border-border/50">
              <Users className="w-5 h-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                All tracked traders are already allocated to this portfolio
              </p>
            </div>
          ) : (
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Select Trader
                </Label>
                <Select value={selectedTrader} onValueChange={setSelectedTrader}>
                  <SelectTrigger className="h-11 bg-surface-2 border-border/50">
                    <SelectValue placeholder="Choose a trader to add..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unallocatedTraders.map((trader) => (
                      <SelectItem key={trader.address} value={trader.address}>
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full ring-2 ring-offset-2 ring-offset-background"
                            style={{
                              backgroundColor: trader.color,
                              boxShadow: `0 0 8px ${trader.color}`,
                            }}
                          />
                          <span className="font-medium">{trader.alias}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-28 space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Allocation
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={newAllocationPercent}
                    onChange={(e) =>
                      setNewAllocationPercent(
                        Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                      )
                    }
                    min={0}
                    max={100}
                    className="h-11 bg-surface-2 border-border/50 pr-8 font-mono"
                  />
                  <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                </div>
              </div>

              <Button
                onClick={handleAddAllocation}
                disabled={!selectedTrader || saving}
                className="h-11 px-5 bg-gradient-to-r from-primary to-cyan hover:from-primary/90 hover:to-cyan/90"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Summary bar */}
      {allocations.filter((a) => a.isActive).length > 0 && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Total Allocation:{" "}
              <span
                className={cn(
                  "font-mono font-semibold",
                  totalAllocation > 100 ? "text-loss" : "text-foreground"
                )}
              >
                {totalAllocation}%
              </span>
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {allocations.filter((a) => a.isActive).length} traders tracked
          </span>
        </div>
      )}

      {/* Current allocations */}
      {allocations.length === 0 ? (
        <div className="relative rounded-2xl overflow-hidden border border-border/50 border-dashed">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-cyan/5" />
          <div className="relative p-12 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4 border border-primary/20">
              <Zap className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No Allocations Yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Add traders above to start tracking their trades in this portfolio
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {allocations
            .filter((a) => a.isActive)
            .map((allocation, index) => (
              <div
                key={allocation.id}
                className={cn(
                  "group relative rounded-xl border border-border/50 bg-card overflow-hidden transition-all duration-200 hover:border-border/80 animate-slide-up"
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Color accent bar */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                  style={{ backgroundColor: allocation.traderColor || "#666" }}
                />

                <div className="pl-5 pr-4 py-4">
                  <div className="flex items-center gap-4">
                    {/* Trader avatar */}
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-base font-bold shadow-lg transition-transform group-hover:scale-105"
                      style={{
                        backgroundColor: allocation.traderColor || "#666",
                        boxShadow: `0 4px 14px ${allocation.traderColor || "#666"}40`,
                      }}
                    >
                      {(allocation.traderAlias || "?")[0].toUpperCase()}
                    </div>

                    {/* Trader info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">
                        {allocation.traderAlias ||
                          `${allocation.traderAddress.slice(0, 8)}...`}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {allocation.traderAddress.slice(0, 10)}...
                        {allocation.traderAddress.slice(-6)}
                      </p>
                    </div>

                    {/* Allocation slider */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="w-48 space-y-1">
                        <Slider
                          value={[allocation.allocationPercent]}
                          onValueChange={([value]) =>
                            handleUpdateAllocation(allocation.traderAddress, value)
                          }
                          min={0}
                          max={100}
                          step={1}
                          disabled={saving}
                          className="cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>0%</span>
                          <span>50%</span>
                          <span>100%</span>
                        </div>
                      </div>

                      {/* Allocation value */}
                      <div
                        className={cn(
                          "w-16 h-9 rounded-lg flex items-center justify-center font-mono font-semibold text-sm",
                          allocation.allocationPercent === 0
                            ? "bg-surface-2 text-muted-foreground"
                            : allocation.allocationPercent === 100
                              ? "bg-profit/10 text-profit"
                              : "bg-primary/10 text-primary"
                        )}
                      >
                        {allocation.allocationPercent}%
                      </div>

                      {/* Delete button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleRemoveAllocation(allocation.traderAddress)
                        }
                        disabled={saving}
                        className="h-9 w-9 p-0 text-muted-foreground hover:text-loss hover:bg-loss/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
