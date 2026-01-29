"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CandlestickChart, PriceLineChart } from "@/components/charts";
import type { OHLCData, VolumeData, PriceData } from "@/components/charts";

// Sample OHLC data (would come from TimescaleDB in production)
const generateSampleOHLC = (): OHLCData[] => {
  const data: OHLCData[] = [];
  let basePrice = 100;
  const startDate = new Date("2024-01-01");

  for (let i = 0; i < 90; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    const volatility = Math.random() * 5;
    const open = basePrice + (Math.random() - 0.5) * volatility;
    const close = open + (Math.random() - 0.5) * volatility;
    const high = Math.max(open, close) + Math.random() * 2;
    const low = Math.min(open, close) - Math.random() * 2;

    data.push({
      time: date.toISOString().split("T")[0] as unknown as import("lightweight-charts").Time,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
    });

    basePrice = close;
  }

  return data;
};

const generateSampleVolume = (ohlcData: OHLCData[]): VolumeData[] => {
  return ohlcData.map((d) => ({
    time: d.time,
    value: Math.floor(Math.random() * 1000000) + 100000,
  }));
};

const generatePnLData = (): PriceData[] => {
  const data: PriceData[] = [];
  let pnl = 0;
  const startDate = new Date("2024-01-01");

  for (let i = 0; i < 90; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    pnl += (Math.random() - 0.45) * 500; // Slightly positive drift

    data.push({
      time: date.toISOString().split("T")[0] as unknown as import("lightweight-charts").Time,
      value: parseFloat(pnl.toFixed(2)),
    });
  }

  return data;
};

export default function Home() {
  const ohlcData = generateSampleOHLC();
  const volumeData = generateSampleVolume(ohlcData);
  const pnlData = generatePnLData();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <main className="max-w-7xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Polymarket Copy Trading</h1>
          <p className="text-zinc-400">Trading Dashboard</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">
                Total P&L
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">
                +${pnlData[pnlData.length - 1]?.value.toLocaleString() ?? 0}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">
                Active Positions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">12</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400">
                Win Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">67.3%</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="price" className="w-full">
          <TabsList className="bg-zinc-900 border-zinc-800">
            <TabsTrigger value="price">Price Chart</TabsTrigger>
            <TabsTrigger value="pnl">P&L Curve</TabsTrigger>
          </TabsList>
          <TabsContent value="price" className="mt-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle>Market Price</CardTitle>
              </CardHeader>
              <CardContent>
                <CandlestickChart
                  data={ohlcData}
                  volumeData={volumeData}
                  height={500}
                />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="pnl" className="mt-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle>Portfolio Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <PriceLineChart
                  data={pnlData}
                  height={500}
                  lineColor="#22c55e"
                  areaTopColor="rgba(34, 197, 94, 0.3)"
                  areaBottomColor="rgba(34, 197, 94, 0.0)"
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
