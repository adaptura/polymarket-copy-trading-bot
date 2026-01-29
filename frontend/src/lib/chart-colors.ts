// Chart colors helper - reads from CSS variables for theme support
// These are used by lightweight-charts which needs hex/rgb values

export function getChartColors(isDark: boolean) {
  if (isDark) {
    return {
      textMuted: "#888888",
      gridLine: "#2a2a35",
      crosshair: "#555555",
      labelBg: "#252530",
      border: "#353545",
      cardBg: "#1a1a24",
      background: "transparent",
    };
  }

  // Light mode colors
  return {
    textMuted: "#555555",
    gridLine: "#e5e5e5",
    crosshair: "#999999",
    labelBg: "#f5f5f5",
    border: "#d4d4d4",
    cardBg: "#ffffff",
    background: "transparent",
  };
}

// Helper to convert hex to rgba
export function hexToRgba(hex: string, alpha: number): string {
  // Handle shorthand hex
  if (hex.length === 4) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
