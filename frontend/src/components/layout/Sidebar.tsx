"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calculator,
  Users,
  TrendingUp,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

const navigation = [
  {
    name: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    name: "Traders",
    href: "/traders",
    icon: Users,
  },
  {
    name: "Import",
    href: "/import",
    icon: Download,
  },
  {
    name: "Calculator",
    href: "/calculator",
    icon: Calculator,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-[72px] border-r border-sidebar-border bg-sidebar">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-center border-b border-sidebar-border">
          <Link href="/" className="group">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 transition-all duration-200 group-hover:bg-primary/20 group-hover:scale-105">
              <TrendingUp className="h-5 w-5 text-primary" />
              <div className="absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100 glow-cyan" />
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200",
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />

                {/* Active indicator */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 h-5 w-1 -translate-x-1.5 -translate-y-1/2 rounded-r-full bg-primary" />
                )}

                {/* Tooltip */}
                <div className="pointer-events-none absolute left-full ml-3 flex items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <div className="whitespace-nowrap rounded-md bg-popover px-3 py-1.5 text-sm font-medium text-popover-foreground shadow-lg border border-border">
                    {item.name}
                  </div>
                </div>

                {/* Glow effect on active */}
                {isActive && (
                  <div
                    className="absolute inset-0 rounded-xl pointer-events-none"
                    style={{
                      boxShadow: "0 0 15px var(--primary)",
                      opacity: 0.15,
                    }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-sidebar-border p-3 space-y-2">
          {/* Theme toggle */}
          <ThemeToggle />

          {/* Status indicator */}
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2">
            <div className="h-2 w-2 rounded-full bg-profit pulse-live" />
          </div>
        </div>
      </div>
    </aside>
  );
}
