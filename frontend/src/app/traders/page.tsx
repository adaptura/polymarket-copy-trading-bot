"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, TrendingUp, TrendingDown, ExternalLink, Loader2, Plus, RefreshCw, Download } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/dashboard/StatCard";
import { cn } from "@/lib/utils";
import { useTraders, toUITrader, useTakeSnapshot } from "@/lib/hooks/use-api";
import { formatCurrency } from "@/lib/mock-data";

export default function TradersPage() {
  const { traders, loading, error, refetch } = useTraders();
  const { takeSnapshot, loading: snapshotLoading } = useTakeSnapshot();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTrader, setNewTrader] = useState({ address: "", alias: "" });
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Convert to UI format
  const uiTraders = traders.map(toUITrader);
  const sortedTraders = [...uiTraders].sort((a, b) => b.totalPnL - a.totalPnL);

  // Calculate stats
  const totalPnL = uiTraders.reduce((sum, t) => sum + t.totalPnL, 0);
  const profitableTraders = uiTraders.filter((t) => t.totalPnL > 0).length;
  const avgPnL = uiTraders.length > 0 ? totalPnL / uiTraders.length : 0;
  const totalPositions = traders.reduce((sum, t) => sum + t.positionCount, 0);

  // Handle add trader
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

      // Backfill historical data
      await takeSnapshot(newTrader.address, true);

      setNewTrader({ address: "", alias: "" });
      setShowAddModal(false);
      refetch();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add trader");
    } finally {
      setAdding(false);
    }
  };

  // Handle refresh all
  const handleRefreshAll = async () => {
    try {
      await takeSnapshot();
      refetch();
    } catch (err) {
      console.error("Failed to refresh:", err);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-2">Failed to load traders</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Traders</h1>
              <p className="text-sm text-muted-foreground">
                Tracked traders and their P&L performance
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshAll}
              disabled={snapshotLoading}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${snapshotLoading ? "animate-spin" : ""}`} />
              {snapshotLoading ? "Updating..." : "Update All"}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Trader
            </button>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Traders"
            value={loading ? "..." : traders.length.toString()}
            icon={<Users className="w-4 h-4" />}
          />
          <StatCard
            title="Profitable"
            value={loading ? "..." : `${profitableTraders}/${traders.length}`}
            change={traders.length > 0 ? (profitableTraders / traders.length) * 100 - 50 : 0}
          />
          <StatCard
            title="Combined P&L"
            value={loading ? "..." : formatCurrency(totalPnL, true)}
            change={totalPnL > 0 ? 1 : -1}
          />
          <StatCard
            title="Total Positions"
            value={loading ? "..." : totalPositions.toString()}
            change={0}
          />
        </div>

        {/* Traders Table */}
        <div className="glass-card rounded-xl border border-border/50 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50">
            <h2 className="font-semibold">All Traders</h2>
            <p className="text-sm text-muted-foreground">
              Sorted by total P&L performance
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : sortedTraders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Traders Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add a trader to start tracking their P&L
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Trader
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="w-12 text-muted-foreground font-medium">
                      #
                    </TableHead>
                    <TableHead className="text-muted-foreground font-medium">
                      Trader
                    </TableHead>
                    <TableHead className="text-right text-muted-foreground font-medium">
                      Total P&L
                    </TableHead>
                    <TableHead className="text-right text-muted-foreground font-medium">
                      Positions
                    </TableHead>
                    <TableHead className="text-right text-muted-foreground font-medium">
                      Last Updated
                    </TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTraders.map((trader, index) => (
                    <TableRow
                      key={trader.id}
                      className="border-border/50 table-row-hover group animate-slide-up"
                      style={{ animationDelay: `${index * 30}ms` }}
                    >
                      <TableCell>
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold"
                          style={{
                            backgroundColor:
                              index === 0
                                ? "oklch(0.8 0.15 80 / 0.2)"
                                : index === 1
                                ? "oklch(0.7 0.05 260 / 0.2)"
                                : index === 2
                                ? "oklch(0.6 0.1 50 / 0.2)"
                                : "oklch(0.2 0 0)",
                            color:
                              index === 0
                                ? "oklch(0.8 0.15 80)"
                                : index === 1
                                ? "oklch(0.7 0.05 260)"
                                : index === 2
                                ? "oklch(0.6 0.1 50)"
                                : "oklch(0.5 0 0)",
                          }}
                        >
                          {index + 1}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/traders/${trader.id}`}
                          className="flex items-center gap-3 group/link"
                        >
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: trader.color,
                              boxShadow: `0 0 8px ${trader.color}`,
                            }}
                          />
                          <span className="font-medium group-hover/link:text-primary transition-colors">
                            {trader.name}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono font-medium",
                          trader.totalPnL >= 0 ? "text-profit" : "text-loss"
                        )}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          {trader.totalPnL >= 0 ? (
                            <TrendingUp className="w-3.5 h-3.5" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5" />
                          )}
                          {formatCurrency(trader.totalPnL)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {trader.positionCount}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {trader.lastUpdated
                          ? trader.lastUpdated.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "No data"}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/traders/${trader.id}`}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-secondary"
                        >
                          <ExternalLink className="w-4 h-4 text-muted-foreground" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Add Trader Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAddModal(false)}
          />
          <div className="relative bg-background border border-border rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Add Trader</h2>
            <form onSubmit={handleAddTrader} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Wallet Address
                </label>
                <input
                  type="text"
                  value={newTrader.address}
                  onChange={(e) =>
                    setNewTrader({ ...newTrader, address: e.target.value })
                  }
                  placeholder="0x..."
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  value={newTrader.alias}
                  onChange={(e) =>
                    setNewTrader({ ...newTrader, alias: e.target.value })
                  }
                  placeholder="Trader name"
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>
              {addError && (
                <p className="text-sm text-destructive">{addError}</p>
              )}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm rounded-lg hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {adding ? (
                    <>
                      <Download className="w-4 h-4 animate-bounce" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Add & Import
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
