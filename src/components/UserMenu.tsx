"use client"

import { useState, useRef, useEffect } from "react"

const EMAIL   = "abhinav.webdj@gmail.com"
const INITIAL = EMAIL[0].toUpperCase()

export function UserMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-full bg-white/[0.1] border border-white/[0.12] flex items-center justify-center hover:bg-white/[0.16] transition-colors"
        aria-label="Account menu"
      >
        <span className="text-xs font-bold text-white/80 select-none">{INITIAL}</span>
      </button>

      <div
        className={[
          "absolute right-0 top-full mt-2 w-52 rounded-xl border border-[#222] bg-[#111] shadow-2xl overflow-hidden z-50",
          "transition-all duration-200 origin-top-right",
          open
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none",
        ].join(" ")}
      >
        <div className="px-4 py-3 border-b border-[#1a1a1a]">
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Signed in as</p>
          <p className="text-xs text-white/55 truncate">{EMAIL}</p>
        </div>
        <button
          className="w-full text-left px-4 py-3 text-sm text-white/45 hover:text-white/75 hover:bg-white/[0.04] transition-colors"
          onClick={() => setOpen(false)}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
