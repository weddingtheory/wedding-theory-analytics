"use client"

import { AreaChart, Area, ResponsiveContainer } from "recharts"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

interface SparklineCardProps {
  label: string
  value: string
  change?: number
  data?: number[]
  color?: string
  gradientId: string
  sub?: string
}

export function SparklineCard({
  label,
  value,
  change,
  data = [],
  color = "#818cf8",
  gradientId,
  sub,
}: SparklineCardProps) {
  const sparkData = data.map((v, i) => ({ i, v }))
  const hasChange = change !== undefined
  const isPositive = (change ?? 0) > 0
  const isNegative = (change ?? 0) < 0

  return (
    <div className="rounded-xl border border-[#222] bg-[#111] flex flex-col overflow-hidden group transition-colors duration-200 hover:border-[#333]">
      <div className="px-5 pt-5 pb-3 flex-1">
        <p className="text-[11px] font-medium text-white/40 uppercase tracking-[0.12em] mb-3">
          {label}
        </p>
        <p className="text-3xl font-bold text-white tabular-nums tracking-tight">
          {value}
        </p>
        {hasChange && (
          <div className="flex items-center gap-1.5 mt-2.5">
            <span
              className={cn(
                "flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full",
                isPositive && "bg-emerald-500/15 text-emerald-400",
                isNegative && "bg-red-500/15 text-red-400",
                !isPositive && !isNegative && "bg-white/5 text-white/40"
              )}
            >
              {isPositive ? <TrendingUp className="w-3 h-3" /> : isNegative ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {isPositive ? "+" : ""}
              {change!.toFixed(1)}%
            </span>
            <span className="text-[11px] text-white/30">vs prev 7d</span>
          </div>
        )}
        {sub && !hasChange && (
          <p className="text-[11px] text-white/30 mt-1.5">{sub}</p>
        )}
      </div>

      {data.length > 0 && (
        <div className="h-14 -mx-px">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
