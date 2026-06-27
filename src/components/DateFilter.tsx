"use client"

import { CalendarDays, ChevronDown } from "lucide-react"

interface DateFilterProps {
  label?: string
}

export function DateFilter({ label = "Last 7 days" }: DateFilterProps) {
  return (
    <button
      className="
        flex items-center gap-2.5 px-4 py-2
        rounded-lg border border-[#222] bg-[#111]
        text-sm text-white/40
        hover:bg-[#161616] hover:text-white/70 hover:border-[#333]
        transition-all duration-200
        cursor-pointer select-none
        group
      "
    >
      <CalendarDays className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />
      <span className="font-medium">{label}</span>
      <ChevronDown className="w-3.5 h-3.5 opacity-50" />
    </button>
  )
}
