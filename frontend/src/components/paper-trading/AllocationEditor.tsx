"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, User } from "lucide-react";
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add new allocation */}
      <div className="glass-card rounded-xl p-4 border border-border/50">
        <h3 className="text-sm font-medium mb-4">Add Trader to Portfolio</h3>

        {unallocatedTraders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            All tracked traders are already allocated to this portfolio
          </p>
        ) : (
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-2">
              <Label>Trader</Label>
              <Select value={selectedTrader} onValueChange={setSelectedTrader}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a trader" />
                </SelectTrigger>
                <SelectContent>
                  {unallocatedTraders.map((trader) => (
                    <SelectItem key={trader.address} value={trader.address}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: trader.color }}
                        />
                        {trader.alias}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-32 space-y-2">
              <Label>Allocation %</Label>
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
              />
            </div>

            <Button
              onClick={handleAddAllocation}
              disabled={!selectedTrader || saving}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Current allocations */}
      {allocations.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center border border-border/50">
          <User className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">No allocations yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Add traders above to start tracking their trades in this portfolio
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {allocations
            .filter((a) => a.isActive)
            .map((allocation) => (
              <div
                key={allocation.id}
                className="glass-card rounded-xl p-4 border border-border/50"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                      style={{
                        backgroundColor: allocation.traderColor || "#666",
                      }}
                    >
                      {(allocation.traderAlias || "?")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {allocation.traderAlias ||
                          `${allocation.traderAddress.slice(0, 8)}...`}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {allocation.traderAddress.slice(0, 10)}...
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="w-48">
                      <Slider
                        value={[allocation.allocationPercent]}
                        onValueChange={([value]) =>
                          handleUpdateAllocation(allocation.traderAddress, value)
                        }
                        min={0}
                        max={100}
                        step={1}
                        disabled={saving}
                      />
                    </div>
                    <span
                      className={cn(
                        "w-12 text-right font-mono text-sm",
                        allocation.allocationPercent === 0 && "text-muted-foreground"
                      )}
                    >
                      {allocation.allocationPercent}%
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        handleRemoveAllocation(allocation.traderAddress)
                      }
                      disabled={saving}
                      className="text-muted-foreground hover:text-loss"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
