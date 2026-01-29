"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Resolution } from "@/types";

const RESOLUTIONS: { value: Resolution; label: string }[] = [
  { value: "1m", label: "1 minute" },
  { value: "5m", label: "5 minutes" },
  { value: "15m", label: "15 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "1D", label: "1 day" },
];

interface ResolutionSelectorProps {
  value: Resolution;
  onChange: (value: Resolution) => void;
}

export function ResolutionSelector({
  value,
  onChange,
}: ResolutionSelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Resolution)}>
      <SelectTrigger className="w-[130px] bg-secondary/50 border-border">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-popover border-border">
        {RESOLUTIONS.map((resolution) => (
          <SelectItem
            key={resolution.value}
            value={resolution.value}
            className="cursor-pointer"
          >
            {resolution.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
