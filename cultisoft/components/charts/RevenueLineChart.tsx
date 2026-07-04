"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCLP } from "@/lib/format";

interface Datum {
  day: string;
  total: number;
  count: number;
}

function formatDayShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}

export default function RevenueLineChart({ data }: { data: Datum[] }) {
  const chartData = data.map((d) => ({ ...d, total: Number(d.total), label: formatDayShort(d.day) }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#E5DFD0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#5A5E5C" }}
            axisLine={{ stroke: "#E5DFD0" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#5A5E5C" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
            width={40}
          />
          <Tooltip
            formatter={(value: any) => formatCLP(Number(value))}
            labelFormatter={(label: any) => label}
            contentStyle={{ background: "#FAF6EE", border: "1px solid #E5DFD0", borderRadius: 8, fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="total"
            stroke="#1F3A2D"
            strokeWidth={2}
            dot={{ r: 3, fill: "#1F3A2D", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            animationDuration={800}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
