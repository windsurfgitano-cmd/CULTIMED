"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatCLP } from "@/lib/format";

const COLORS = ["#1F3A2D", "#A98B5C", "#7A2E2E", "#5A5E5C", "#3D5C4E", "#C4A678"];

const CATEGORY_LABELS: Record<string, string> = {
  flores: "Flores",
  aceite_cbd: "Aceites CBD",
  capsulas: "Cápsulas",
  topico: "Tópicos",
  farmaceutico: "Farmacéutico",
  otro: "Otro",
};

interface Datum {
  category: string;
  total: number;
}

export default function CategoryPieChart({ data }: { data: Datum[] }) {
  const chartData = data.map((d) => ({
    name: CATEGORY_LABELS[d.category] || d.category,
    value: Number(d.total),
  }));
  const grandTotal = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="w-full sm:w-1/2 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="90%"
              paddingAngle={2}
              animationDuration={700}
              animationEasing="ease-out"
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: any) => formatCLP(Number(value))}
              contentStyle={{ background: "#FAF6EE", border: "1px solid #E5DFD0", borderRadius: 8, fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full sm:w-1/2 space-y-2.5">
        {chartData.map((d, i) => {
          const pct = grandTotal > 0 ? (d.value / grandTotal) * 100 : 0;
          return (
            <li key={d.name} className="flex items-center gap-2.5 text-sm">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="flex-1 min-w-0 truncate text-on-surface">{d.name}</span>
              <span className="font-mono tabular-nums text-on-surface-variant text-xs">{pct.toFixed(0)}%</span>
              <span className="font-mono tabular-nums text-right w-24 shrink-0">{formatCLP(d.value)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
