"use client";

import { useState } from "react";
import { Loader2, Beaker, DollarSign, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CreatePortfolioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (portfolio: {
    id: string;
    name: string;
    startingCapital: number;
    currentBalance: number;
    isActive: boolean;
    totalEquity: number;
    totalPnl: number;
    totalPnlPercent: number;
    openPositions: number;
    tradeCount: number;
    trackedTradersCount: number;
  }) => void;
}

const presetCapitals = [
  { label: "$1K", value: 1000 },
  { label: "$5K", value: 5000 },
  { label: "$10K", value: 10000 },
  { label: "$50K", value: 50000 },
  { label: "$100K", value: 100000 },
];

export function CreatePortfolioDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreatePortfolioDialogProps) {
  const [name, setName] = useState("");
  const [startingCapital, setStartingCapital] = useState("10000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !startingCapital) return;

    const capital = parseFloat(startingCapital);
    if (isNaN(capital) || capital <= 0) {
      setError("Starting capital must be a positive number");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/paper-trading/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          startingCapital: capital,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create portfolio");
      }

      const data = await response.json();

      // Reset form
      setName("");
      setStartingCapital("10000");

      onSuccess({
        ...data.portfolio,
        totalEquity: data.portfolio.startingCapital,
        totalPnl: 0,
        totalPnlPercent: 0,
        openPositions: 0,
        tradeCount: 0,
        trackedTradersCount: 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create portfolio");
    } finally {
      setLoading(false);
    }
  };

  const selectPreset = (value: number) => {
    setStartingCapital(value.toString());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} className="sm:max-w-md">
        <DialogHeader className="text-left">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan/20 to-primary/10 flex items-center justify-center border border-cyan/20">
              <Beaker className="w-5 h-5 text-cyan" />
            </div>
            <div>
              <DialogTitle className="text-lg">New Paper Portfolio</DialogTitle>
              <DialogDescription className="text-sm">
                Create a simulation to test strategies
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          {/* Portfolio Name */}
          <div className="space-y-2">
            <Label
              htmlFor="portfolio-name"
              className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
            >
              Portfolio Name
            </Label>
            <Input
              id="portfolio-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Conservative Strategy"
              className="h-11 bg-surface-2 border-border/50"
              autoFocus
            />
          </div>

          {/* Starting Capital */}
          <div className="space-y-3">
            <Label
              htmlFor="starting-capital"
              className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
            >
              Starting Capital (Virtual USDC)
            </Label>

            {/* Preset buttons */}
            <div className="flex gap-2">
              {presetCapitals.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => selectPreset(preset.value)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all border",
                    parseFloat(startingCapital) === preset.value
                      ? "bg-cyan/10 border-cyan/40 text-cyan"
                      : "bg-surface-2 border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom input */}
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="starting-capital"
                type="number"
                value={startingCapital}
                onChange={(e) => setStartingCapital(e.target.value)}
                placeholder="10000"
                min="100"
                max="10000000"
                step="100"
                className="h-11 bg-surface-2 border-border/50 pl-9 font-mono"
              />
            </div>

            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              Virtual money for risk-free simulation
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-loss/10 border border-loss/20">
              <p className="text-sm text-loss">{error}</p>
            </div>
          )}

          <DialogFooter className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim() || !startingCapital}
              className="flex-1 bg-gradient-to-r from-cyan to-primary hover:from-cyan/90 hover:to-primary/90"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Portfolio"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
