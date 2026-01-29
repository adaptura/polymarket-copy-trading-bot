"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowUpDown, ArrowUp, ArrowDown, ExternalLink } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Market } from "@/types";
import { formatCurrency, formatRelativeTime } from "@/lib/mock-data";

type SortKey = "name" | "tradeCount" | "totalVolume" | "lastActivity";
type SortDirection = "asc" | "desc";

interface MarketsTableProps {
  markets: Market[];
  searchQuery?: string;
}

export function MarketsTable({ markets, searchQuery = "" }: MarketsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("lastActivity");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const filteredAndSortedMarkets = useMemo(() => {
    let filtered = markets;

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = markets.filter((m) => m.name.toLowerCase().includes(query));
    }

    // Apply sorting
    return [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortKey) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "tradeCount":
          comparison = a.tradeCount - b.tradeCount;
          break;
        case "totalVolume":
          comparison = a.totalVolume - b.totalVolume;
          break;
        case "lastActivity":
          comparison = a.lastActivity.getTime() - b.lastActivity.getTime();
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [markets, searchQuery, sortKey, sortDirection]);

  const SortButton = ({
    column,
    children,
  }: {
    column: SortKey;
    children: React.ReactNode;
  }) => {
    const isActive = sortKey === column;

    return (
      <button
        onClick={() => handleSort(column)}
        className={cn(
          "flex items-center gap-1.5 hover:text-foreground transition-colors",
          isActive ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {children}
        {isActive ? (
          sortDirection === "asc" ? (
            <ArrowUp className="w-3.5 h-3.5" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5" />
          )
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />
        )}
      </button>
    );
  };

  if (filteredAndSortedMarkets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">No markets found</p>
        {searchQuery && (
          <p className="text-sm text-muted-foreground/70 mt-1">
            Try a different search term
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border/50 hover:bg-transparent">
            <TableHead className="w-[40%]">
              <SortButton column="name">Market</SortButton>
            </TableHead>
            <TableHead className="text-right">
              <SortButton column="tradeCount">Trades</SortButton>
            </TableHead>
            <TableHead className="text-right">
              <SortButton column="totalVolume">Volume</SortButton>
            </TableHead>
            <TableHead className="text-right">
              <SortButton column="lastActivity">Last Active</SortButton>
            </TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredAndSortedMarkets.map((market, index) => (
            <TableRow
              key={market.id}
              className="border-border/50 table-row-hover group animate-slide-up"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <TableCell>
                <Link
                  href={`/markets/${market.id}`}
                  className="flex items-center gap-3 group/link"
                >
                  {/* Price indicator */}
                  <div className="flex flex-col items-center w-12">
                    <span
                      className={cn(
                        "text-lg font-mono font-bold",
                        market.currentPrice >= 0.5 ? "text-profit" : "text-loss"
                      )}
                    >
                      {(market.currentPrice * 100).toFixed(0)}¢
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate group-hover/link:text-primary transition-colors">
                      {market.name}
                    </div>
                  </div>
                </Link>
              </TableCell>
              <TableCell className="text-right font-mono">
                {market.tradeCount.toLocaleString()}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(market.totalVolume, true)}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {formatRelativeTime(market.lastActivity)}
              </TableCell>
              <TableCell>
                <Link
                  href={`/markets/${market.id}`}
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
  );
}
