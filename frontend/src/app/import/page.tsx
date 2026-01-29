"use client";

import { useState } from "react";
import {
  Download,
  Plus,
  RefreshCw,
  Check,
  X,
  Loader2,
  Users,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { useTraders, useTakeSnapshot } from "@/lib/hooks/use-api";
import { formatCurrency } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface BackfillResult {
  address: string;
  alias: string;
  success: boolean;
  error?: string;
  backfillCount?: number;
}

export default function ImportPage() {
  const { traders, loading: tradersLoading, refetch } = useTraders();
  const { takeSnapshot, loading: snapshotLoading } = useTakeSnapshot();

  const [newTrader, setNewTrader] = useState({ address: "", alias: "" });
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [backfillResults, setBackfillResults] = useState<BackfillResult[]>([]);
  const [backfillInProgress, setBackfillInProgress] = useState<string | null>(null);

  // Add a new trader
  const handleAddTrader = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAdding(true);

    try {
      const response = await fetch("/api/traders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTrader),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add trader");
      }

      setNewTrader({ address: "", alias: "" });
      refetch();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add trader");
    } finally {
      setAdding(false);
    }
  };

  // Backfill a single trader
  const handleBackfillSingle = async (address: string) => {
    setBackfillInProgress(address);
    setBackfillResults([]);

    try {
      const result = await takeSnapshot(address, true);
      if (result?.results) {
        setBackfillResults(result.results);
      }
      refetch();
    } catch (err) {
      setBackfillResults([
        {
          address,
          alias: traders.find((t) => t.address === address)?.alias || address,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        },
      ]);
    } finally {
      setBackfillInProgress(null);
    }
  };

  // Backfill all traders
  const handleBackfillAll = async () => {
    setBackfillInProgress("all");
    setBackfillResults([]);

    try {
      const result = await takeSnapshot(undefined, true);
      if (result?.results) {
        setBackfillResults(result.results);
      }
      refetch();
    } catch (err) {
      console.error("Backfill failed:", err);
    } finally {
      setBackfillInProgress(null);
    }
  };

  // Take current snapshot for all
  const handleSnapshotAll = async () => {
    setBackfillInProgress("snapshot");
    setBackfillResults([]);

    try {
      const result = await takeSnapshot();
      if (result?.results) {
        setBackfillResults(result.results);
      }
      refetch();
    } catch (err) {
      console.error("Snapshot failed:", err);
    } finally {
      setBackfillInProgress(null);
    }
  };

  // Remove a trader
  const handleRemoveTrader = async (address: string) => {
    if (!confirm("Are you sure you want to remove this trader?")) return;

    try {
      await fetch(`/api/traders/${address}`, { method: "DELETE" });
      refetch();
    } catch (err) {
      console.error("Failed to remove trader:", err);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Download className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Import P&L Data</h1>
              <p className="text-sm text-muted-foreground">
                Add traders and import historical P&L from Polymarket
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSnapshotAll}
              disabled={backfillInProgress !== null || traders.length === 0}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={cn("w-4 h-4", backfillInProgress === "snapshot" && "animate-spin")}
              />
              Update Current P&L
            </button>
            <button
              onClick={handleBackfillAll}
              disabled={backfillInProgress !== null || traders.length === 0}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Download
                className={cn("w-4 h-4", backfillInProgress === "all" && "animate-bounce")}
              />
              {backfillInProgress === "all" ? "Importing..." : "Import All History"}
            </button>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Add Trader Form */}
        <div className="glass-card rounded-xl border border-border/50 p-6">
          <h2 className="font-semibold mb-4">Add New Trader</h2>
          <form onSubmit={handleAddTrader} className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1.5 text-muted-foreground">
                Wallet Address
              </label>
              <input
                type="text"
                value={newTrader.address}
                onChange={(e) => setNewTrader({ ...newTrader, address: e.target.value })}
                placeholder="0x..."
                className="w-full px-3 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm"
                required
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1.5 text-muted-foreground">
                Display Name
              </label>
              <input
                type="text"
                value={newTrader.alias}
                onChange={(e) => setNewTrader({ ...newTrader, alias: e.target.value })}
                placeholder="Trader name"
                className="w-full px-3 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                required
              />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {adding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add Trader
            </button>
          </form>
          {addError && <p className="mt-2 text-sm text-destructive">{addError}</p>}
        </div>

        {/* Backfill Results */}
        {backfillResults.length > 0 && (
          <div className="glass-card rounded-xl border border-border/50 p-6">
            <h2 className="font-semibold mb-4">Import Results</h2>
            <div className="space-y-2">
              {backfillResults.map((result) => (
                <div
                  key={result.address}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg",
                    result.success ? "bg-profit/10" : "bg-loss/10"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {result.success ? (
                      <Check className="w-5 h-5 text-profit" />
                    ) : (
                      <X className="w-5 h-5 text-loss" />
                    )}
                    <span className="font-medium">{result.alias}</span>
                  </div>
                  <div className="text-sm">
                    {result.success ? (
                      <span className="text-profit">
                        {result.backfillCount !== undefined
                          ? `${result.backfillCount} data points imported`
                          : "Snapshot taken"}
                      </span>
                    ) : (
                      <span className="text-loss">{result.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Traders List */}
        <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50">
            <h2 className="font-semibold">Tracked Traders</h2>
            <p className="text-sm text-muted-foreground">
              {traders.length} trader{traders.length !== 1 ? "s" : ""} configured
            </p>
          </div>

          {tradersLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : traders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Traders Yet</h3>
              <p className="text-sm text-muted-foreground">
                Add a trader above to start tracking their P&L
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {traders.map((trader) => (
                <div
                  key={trader.address}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-secondary/30 transition-colors"
                >
                  {/* Color indicator */}
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: trader.color,
                      boxShadow: `0 0 8px ${trader.color}`,
                    }}
                  />

                  {/* Trader info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{trader.alias}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {trader.address}
                    </div>
                  </div>

                  {/* Current P&L */}
                  <div className="text-right">
                    <div
                      className={cn(
                        "font-mono font-medium",
                        trader.totalPnl >= 0 ? "text-profit" : "text-loss"
                      )}
                    >
                      {formatCurrency(trader.totalPnl)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {trader.positionCount} positions
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://polymarket.com/profile/${trader.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                      title="View on Polymarket"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => handleBackfillSingle(trader.address)}
                      disabled={backfillInProgress !== null}
                      className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
                      title="Import historical P&L"
                    >
                      {backfillInProgress === trader.address ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleRemoveTrader(trader.address)}
                      className="p-2 rounded-lg hover:bg-loss/20 transition-colors text-muted-foreground hover:text-loss"
                      title="Remove trader"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Help Section */}
        <div className="glass-card rounded-xl border border-border/50 p-6">
          <h2 className="font-semibold mb-3">How It Works</h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">1. Add Traders:</strong> Enter the Polymarket
              wallet address and a display name for each trader you want to track.
            </p>
            <p>
              <strong className="text-foreground">2. Import History:</strong> Click the download
              button next to a trader to import their complete P&L history from Polymarket. This
              fetches data from Polymarket's P&L API.
            </p>
            <p>
              <strong className="text-foreground">3. Update Current P&L:</strong> Use "Update
              Current P&L" to fetch the latest realized and unrealized P&L for all traders.
            </p>
            <p>
              <strong className="text-foreground">Data Source:</strong> P&L data is fetched
              directly from Polymarket's APIs, ensuring accuracy. Historical data uses daily
              snapshots.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
