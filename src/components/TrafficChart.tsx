"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

export interface TrafficDataPoint {
  date: string
  requests: number
  visits: number
}

function fmt(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return String(v)
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#161616] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-xs shadow-2xl">
      <p className="text-white/50 mb-2 font-medium">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-1 last:mb-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-white/50">{p.name}:</span>
          <span className="font-semibold text-white/90">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

function ChartLegend({ payload }: { payload?: Array<{ value: string; color: string }> }) {
  if (!payload) return null
  return (
    <div className="flex items-center justify-center gap-6 mt-2">
      {payload.map((p) => (
        <div key={p.value} className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-xs text-white/50">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

const AXIS_STYLE = { fill: "#888", fontSize: 12 }

export function SingleLineChart({
  data,
  dataKey,
  name,
  color,
}: {
  data: TrafficDataPoint[]
  dataKey: "requests" | "visits"
  name: string
  color: string
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal vertical={false} />
        <XAxis
          dataKey="date"
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => v.slice(5)}
          dy={6}
        />
        <YAxis
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmt}
          width={38}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.07)", strokeWidth: 1 }} />
        <Line
          type="monotone"
          dataKey={dataKey}
          name={name}
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export interface SCChartDataPoint {
  date: string
  clicks: number
  impressions: number
}

export function SCChart({ data }: { data: SCChartDataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal vertical={false} />
        <XAxis
          dataKey="date"
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => v.slice(5)}
          dy={6}
          interval="preserveStartEnd"
        />
        <YAxis tick={AXIS_STYLE} axisLine={false} tickLine={false} tickFormatter={fmt} width={38} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.07)", strokeWidth: 1 }} />
        <Legend content={<ChartLegend />} />
        <Line type="monotone" dataKey="impressions" name="Impressions" stroke="#a78bfa" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#a78bfa", strokeWidth: 0 }} />
        <Line type="monotone" dataKey="clicks" name="Clicks" stroke="#60a5fa" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#60a5fa", strokeWidth: 0 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
