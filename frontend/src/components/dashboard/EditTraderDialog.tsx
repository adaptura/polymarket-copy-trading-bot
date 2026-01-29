"use client";

import { useState, useEffect } from "react";
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
import { useUpdateTrader } from "@/lib/hooks/use-api";
import { TRADER_COLORS } from "@/lib/mock-data";

interface EditTraderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trader: {
    id: string;
    name: string;
    color: string;
  } | null;
  onSuccess?: () => void;
}

export function EditTraderDialog({
  open,
  onOpenChange,
  trader,
  onSuccess,
}: EditTraderDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const { updateTrader, loading, error } = useUpdateTrader();

  useEffect(() => {
    if (trader) {
      setName(trader.name);
      setColor(trader.color);
    }
  }, [trader]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trader || !name.trim()) return;

    try {
      await updateTrader(trader.id, {
        alias: name.trim(),
        color: color,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch {
      // Error is handled by the hook
    }
  };

  if (!trader) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Edit Trader</DialogTitle>
          <DialogDescription>
            Update the trader&apos;s display name and color
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trader-name">Name</Label>
              <Input
                id="trader-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter trader name"
                className="bg-secondary/50"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {TRADER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-lg transition-all ${
                      color === c
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-110"
                        : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Address</Label>
              <p className="text-xs font-mono text-muted-foreground break-all bg-secondary/30 p-2 rounded-lg">
                {trader.id}
              </p>
            </div>

            {error && (
              <p className="text-sm text-loss">{error.message}</p>
            )}
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
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
