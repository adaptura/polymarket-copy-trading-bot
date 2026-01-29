"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200",
        "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}

      {/* Tooltip */}
      <div className="pointer-events-none absolute left-full ml-3 flex items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <div className="whitespace-nowrap rounded-md bg-popover px-3 py-1.5 text-sm font-medium text-popover-foreground shadow-lg border border-border">
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </div>
      </div>
    </button>
  );
}
