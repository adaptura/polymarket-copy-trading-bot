"use client";

import Link from "next/link";
import { Users, TrendingUp, TrendingDown, ExternalLink } from "lucide-react";
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
import { MOCK_TRADERS, formatCurrency } from "@/lib/mock-data";

export default function TradersPage() {
  const totalPnL = MOCK_TRADERS.reduce((sum, t) => sum + t.totalPnL, 0);
  const profitableTraders = MOCK_TRADERS.filter((t) => t.totalPnL > 0).length;
  const avgPnL = totalPnL / MOCK_TRADERS.length;

  const sortedTraders = [...MOCK_TRADERS].sort((a, b) => b.totalPnL - a.totalPnL);

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
                All tracked traders and their performance
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Traders"
            value={MOCK_TRADERS.length.toString()}
            icon={<Users className="w-4 h-4" />}
          />
          <StatCard
            title="Profitable"
            value={`${profitableTraders}/${MOCK_TRADERS.length}`}
            change={(profitableTraders / MOCK_TRADERS.length) * 100 - 50}
          />
          <StatCard
            title="Combined P&L"
            value={formatCurrency(totalPnL, true)}
            change={18.3}
          />
          <StatCard
            title="Average P&L"
            value={formatCurrency(avgPnL, true)}
            change={avgPnL > 0 ? 12.4 : -8.2}
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
                    Markets
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground font-medium">
                    Active Since
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
                      {trader.marketsTraded}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {trader.activeSince.toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      })}
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
        </div>
      </div>
    </div>
  );
}
