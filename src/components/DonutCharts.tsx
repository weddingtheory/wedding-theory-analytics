"use client"

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

const COLORS = ["#6366f1", "#34d399", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"]

export interface DonutItem {
  name: string
  value: number
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: { fill: string } }>
}) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  return (
    <div className="bg-[#161616] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs shadow-2xl">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ background: item.payload.fill }} />
        <span className="text-white/80 font-semibold">{item.name}</span>
      </div>
      <p className="text-white/50">{item.value.toFixed(1)}%</p>
    </div>
  )
}

export function DonutChart({ data, title }: { data: DonutItem[]; title: string }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const withPct = data.map((d) => ({
    ...d,
    pct: total > 0 ? (d.value / total) * 100 : 0,
  }))

  return (
    <div className="rounded-xl border border-[#222] bg-[#111] p-5 h-full flex flex-col">
      <p className="text-xs font-medium text-white/40 uppercase tracking-[0.1em] mb-4 shrink-0">
        {title}
      </p>

      {/* Donut — centered, fills available vertical space */}
      <div className="flex-1 flex items-center justify-center min-h-[160px]">
        <div className="w-full max-w-[200px] aspect-square">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={withPct}
                cx="50%"
                cy="50%"
                innerRadius="42%"
                outerRadius="68%"
                dataKey="pct"
                strokeWidth={0}
                paddingAngle={3}
              >
                {withPct.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-5 space-y-2.5 shrink-0">
        {withPct.slice(0, 5).map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span className="text-sm text-white/55 truncate">{item.name}</span>
            </div>
            <span className="text-sm font-semibold text-white/75 tabular-nums flex-shrink-0">
              {item.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DonutChartsRow({
  devices,
  browsers,
  os,
}: {
  devices: DonutItem[]
  browsers: DonutItem[]
  os: DonutItem[]
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <DonutChart data={devices} title="Device %" />
      <DonutChart data={browsers} title="Browser %" />
      <DonutChart data={os} title="OS %" />
    </div>
  )
}
