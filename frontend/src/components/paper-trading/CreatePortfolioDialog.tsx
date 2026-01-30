"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Create Paper Portfolio</DialogTitle>
          <DialogDescription>
            Create a new portfolio to simulate copy trading strategies
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="portfolio-name">Portfolio Name</Label>
              <Input
                id="portfolio-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Conservative Strategy"
                className="bg-secondary/50"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="starting-capital">
                Starting Capital (Virtual USDC)
              </Label>
              <Input
                id="starting-capital"
                type="number"
                value={startingCapital}
                onChange={(e) => setStartingCapital(e.target.value)}
                placeholder="10000"
                min="100"
                max="10000000"
                step="100"
                className="bg-secondary/50"
              />
              <p className="text-xs text-muted-foreground">
                This is virtual money for simulation purposes
              </p>
            </div>

            {error && <p className="text-sm text-loss">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim() || !startingCapital}
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
