"use client"

import { useState, useRef, useMemo } from "react"
import { AreaChart, Area, ResponsiveContainer } from "recharts"
import { TrendingUp, TrendingDown, Search, X, ChevronRight } from "lucide-react"
import { getDomain } from "@/lib/geo"
import type { GeoRunResult, GeoScoreSnapshot, ModelKey, PromptResult } from "@/lib/geo"

const MODEL_META: Record<ModelKey, { label: string; color: string; dim: string; gradientId: string }> = {
  chatgpt: { label: "ChatGPT", color: "#10a37f", dim: "rgba(16,163,127,0.12)", gradientId: "geo-chatgpt" },
  gemini:  { label: "Gemini",  color: "#4285f4", dim: "rgba(66,133,244,0.12)", gradientId: "geo-gemini"  },
  claude:  { label: "Claude",  color: "#d97706", dim: "rgba(217,119,6,0.12)",  gradientId: "geo-claude"  },
}

// ── Brand logos ───────────────────────────────────────────────────────────────

function ChatGPTLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.843-3.387 2.02-1.168a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.402-.663zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  )
}

function GeminiLogo({ size = 20 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/gemini.svg" width={size} height={size} alt="Gemini" style={{ objectFit: "contain" }} />
  )
}

function ClaudeLogo({ size = 20 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/calude.svg" width={size} height={size} alt="Claude" style={{ objectFit: "contain" }} />
  )
}

function ModelLogo({ model, size = 20 }: { model: ModelKey; size?: number }) {
  if (model === "chatgpt") return <ChatGPTLogo size={size} />
  if (model === "gemini")  return <GeminiLogo size={size} />
  return <ClaudeLogo size={size} />
}

function CopilotLogo({ size = 20 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/copilot.svg" width={size} height={size} alt="Copilot" style={{ objectFit: "contain" }} />
  )
}

// ── Primitives ────────────────────────────────────────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-[#222] bg-[#111] ${className}`}>{children}</div>
}

function CardHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="px-5 pt-5 pb-4 border-b border-[#1a1a1a] flex items-baseline gap-2">
      <h3 className="text-xs font-semibold text-white/55 uppercase tracking-[0.1em]">{title}</h3>
      {sub && <span className="text-xs text-white/30">{sub}</span>}
    </div>
  )
}

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="text-xs font-bold font-mono px-2 py-1 rounded bg-white/[0.06] border border-white/[0.08] text-white/50 tracking-widest">
        {number}
      </span>
      <h2 className="text-sm font-semibold text-white/60 uppercase tracking-[0.14em]">{title}</h2>
      <div className="flex-1 h-px bg-[#222]" />
    </div>
  )
}

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <th className={`pb-3 text-xs font-medium text-white/35 uppercase tracking-[0.08em] ${center ? "text-center" : "text-left"}`}>
      {children}
    </th>
  )
}

function PosBadge({ pos }: { pos: number | null }) {
  if (pos === null) return <span className="text-white/25 font-mono text-sm tabular-nums">—</span>
  const cls =
    pos <= 5  ? "text-emerald-400" :
    pos <= 10 ? "text-green-400"   :
    pos <= 15 ? "text-amber-400"   : "text-orange-400"
  return <span className={`font-bold tabular-nums text-sm ${cls}`}>{pos}</span>
}

// ── Model Card ────────────────────────────────────────────────────────────────
// Score + sparkline come from score history (across runs in the selected range).

function ModelCard({
  model,
  scoreHistory,
}: {
  model:        ModelKey
  scoreHistory: GeoScoreSnapshot[]   // runs within the selected date range, oldest first
}) {
  const m = MODEL_META[model]

  // Score = latest entry in history for this model
  const latestSnap = scoreHistory[scoreHistory.length - 1]
  const score      = latestSnap?.scores[model] ?? 0

  // Trend = latest score vs second-to-latest (positive = improving)
  const prevSnap = scoreHistory.length >= 2 ? scoreHistory[scoreHistory.length - 2] : null
  const trend    = prevSnap !== null ? score - prevSnap.scores[model] : null
  const improved = trend !== null && trend > 0

  // Sparkline = score over time; prepend 0 baseline if only one point so line renders
  const rawSpark  = scoreHistory.map((s, i) => ({ i, v: s.scores[model] }))
  const sparkData = rawSpark.length < 2 ? [{ i: -1, v: 0 }, ...rawSpark] : rawSpark

  const scoreColor =
    score >= 60 ? "#10b981" :
    score >= 35 ? "#f59e0b" :
    score >= 10 ? "#f97316" : "#ef4444"

  return (
    <div className="rounded-xl border border-[#222] bg-[#111] flex flex-col overflow-hidden hover:border-[#333] transition-colors">
      <div className="px-5 pt-5 pb-3 flex-1">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
            style={{ background: m.dim, color: m.color }}>
            <ModelLogo model={model} size={15} />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: m.color }}>
            {m.label}
          </p>
        </div>

        <p className="text-3xl font-bold tabular-nums tracking-tight" style={{ color: scoreColor }}>
          {score}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mt-0.5">GEO Score</p>

        {trend !== null && (
          <div className="flex items-center gap-1.5 mt-2.5">
            <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
              improved ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
            }`}>
              {improved ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {improved ? "↑" : "↓"} {Math.abs(trend).toFixed(0)} pts
            </span>
            <span className="text-[11px] text-white/30">vs prev run</span>
          </div>
        )}
      </div>

      {/* Sparkline — score over time across runs in selected range */}
      <div className="h-14 -mx-px">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={m.gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={m.color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={m.color} stopOpacity={0}    />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v" stroke={m.color} strokeWidth={1.5}
              fill={`url(#${m.gradientId})`} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Copilot Card ──────────────────────────────────────────────────────────────
// Copilot answers are grounded in Bing's index, so % of sitemap pages Bing has
// crawled is used as a proxy for Copilot visibility readiness.

const COPILOT_COLOR = "#8b5cf6"

function CopilotCard({ crawlPct }: { crawlPct: number | null }) {
  const scoreColor =
    crawlPct === null ? "#666" :
    crawlPct >= 60 ? "#10b981" :
    crawlPct >= 35 ? "#f59e0b" :
    crawlPct >= 10 ? "#f97316" : "#ef4444"

  return (
    <div className="rounded-xl border border-[#222] bg-[#111] flex flex-col overflow-hidden hover:border-[#333] transition-colors">
      <div className="px-5 pt-5 pb-3 flex-1">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
            style={{ background: "rgba(139,92,246,0.12)", color: COPILOT_COLOR }}>
            <CopilotLogo size={15} />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: COPILOT_COLOR }}>
            Copilot
          </p>
        </div>

        <p className="text-3xl font-bold tabular-nums tracking-tight" style={{ color: scoreColor }}>
          {crawlPct !== null ? `${crawlPct.toFixed(0)}%` : "—"}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mt-0.5">Bing Score</p>
      </div>
    </div>
  )
}

// ── Unified Sources Table ─────────────────────────────────────────────────────
// Aggregates raw citations (every prompt × every model, undeduped) by domain,
// so "count" reflects how many times a domain was actually cited overall —
// not capped at the number of AI tools.

type ModelCounts = Record<ModelKey, number>

interface ArticleAgg {
  url:      string
  title:    string
  total:    number
  perModel: ModelCounts
}

interface DomainAgg {
  domain:   string
  total:    number
  perModel: ModelCounts
  articles: ArticleAgg[]
}

function emptyCounts(): ModelCounts {
  return { chatgpt: 0, gemini: 0, claude: 0 }
}

function aggregateSources(prompts: PromptResult[]): DomainAgg[] {
  const domains = new Map<string, { perModel: ModelCounts; articles: Map<string, { title: string; perModel: ModelCounts }> }>()

  for (const prompt of prompts) {
    for (const model of MODELS) {
      for (const s of prompt.models[model].sources) {
        const domain = getDomain(s.url)
        if (!domains.has(domain)) domains.set(domain, { perModel: emptyCounts(), articles: new Map() })
        const d = domains.get(domain)!
        d.perModel[model]++

        if (!d.articles.has(s.url)) d.articles.set(s.url, { title: s.title, perModel: emptyCounts() })
        d.articles.get(s.url)!.perModel[model]++
      }
    }
  }

  const result: DomainAgg[] = Array.from(domains.entries()).map(([domain, d]) => {
    const total = d.perModel.chatgpt + d.perModel.gemini + d.perModel.claude
    const articles: ArticleAgg[] = Array.from(d.articles.entries())
      .map(([url, a]) => ({
        url, title: a.title, perModel: a.perModel,
        total: a.perModel.chatgpt + a.perModel.gemini + a.perModel.claude,
      }))
      .sort((a, b) => b.total - a.total)
    return { domain, total, perModel: d.perModel, articles }
  })

  return result.sort((a, b) => b.total - a.total)
}

function UnifiedSourcesTable({ prompts }: { prompts: PromptResult[] }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery]           = useState("")
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())
  const inputRef                    = useRef<HTMLInputElement>(null)

  const domains = useMemo(() => aggregateSources(prompts), [prompts])

  const filtered = query.trim()
    ? domains.filter(d => d.domain.toLowerCase().includes(query.trim().toLowerCase()))
    : domains

  function toggleSearch() {
    if (searchOpen) { setSearchOpen(false); setQuery("") }
    else            { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 10) }
  }

  function toggleExpand(domain: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }

  return (
    <Card className="w-full overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#1a1a1a] flex items-center gap-3 min-w-0">
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-white/55 shrink-0">Sources</span>
        <span className="text-xs text-white/30 shrink-0 truncate">{domains.length} domains</span>

        <div className="ml-auto relative flex items-center h-8 shrink-0">
          <div className={`absolute right-0 top-0 h-8 flex items-center gap-2 overflow-hidden transition-all duration-300 ease-out
            ${searchOpen
              ? "w-[calc(9rem+2rem)] sm:w-[calc(12rem+2rem)] pl-3 pr-9 bg-[#0d0d0d] border border-[#333] rounded-lg"
              : "w-8 border-0"}`}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Escape" && toggleSearch()}
              tabIndex={searchOpen ? 0 : -1}
              className={`bg-transparent text-xs text-white/65 placeholder-white/25 outline-none w-full min-w-0 transition-opacity duration-150
                ${searchOpen ? "opacity-100 delay-100" : "opacity-0"}`}
            />
            {query && searchOpen && (
              <button onClick={() => setQuery("")} className="text-white/25 hover:text-white/55 transition-colors shrink-0">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button
            onClick={toggleSearch}
            className="relative z-10 flex items-center justify-center w-8 h-8 shrink-0 text-white/40 hover:text-white/75 transition-colors"
          >
            {searchOpen ? <X className="w-4 h-4" strokeWidth={2.5} /> : <Search className="w-4 h-4" strokeWidth={2.5} />}
          </button>
        </div>
      </div>

      <div className="px-5 py-2">
        {domains.length === 0 && <p className="text-sm text-white/25 py-6 text-center">No sources returned by any model</p>}
        {domains.length > 0 && filtered.length === 0 && <p className="text-sm text-white/25 py-6 text-center">No match for &ldquo;{query}&rdquo;</p>}

        <div className="flex flex-col divide-y divide-[#1a1a1a] max-h-[29rem] overflow-y-auto thin-scroll pr-1">
          {filtered.map(d => {
            const isOpen = expanded.has(d.domain)
            return (
              <div key={d.domain} className="min-w-0">
                <button onClick={() => toggleExpand(d.domain)} className="w-full flex items-center gap-2.5 sm:gap-3 py-3 text-left group min-w-0">
                  <ChevronRight className={`w-3.5 h-3.5 text-white/25 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
                  <span className="text-sm text-white/70 group-hover:text-white/90 transition-colors font-medium truncate min-w-0">{d.domain}</span>
                  <span className="text-xs text-white/30 font-mono tabular-nums shrink-0">{d.total}×</span>
                  <div className="ml-auto flex items-center gap-1.5 shrink-0">
                    {MODELS.filter(m => d.perModel[m] > 0).map(m => (
                      <span key={m} title={`${MODEL_META[m].label}: cited ${d.perModel[m]}×`}
                        className="flex items-center justify-center w-5 h-5 rounded"
                        style={{ color: MODEL_META[m].color }}>
                        <ModelLogo model={m} size={13} />
                      </span>
                    ))}
                  </div>
                </button>

                <div className="grid transition-all duration-300 ease-in-out" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}>
                  <div className="overflow-hidden">
                    <div className={`flex flex-col gap-1.5 pl-6 pr-0 transition-opacity duration-200 ${isOpen ? "opacity-100 pb-3" : "opacity-0"}`}>
                      {d.articles.map(a => (
                        <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2.5 sm:gap-3 px-3 py-2 rounded-lg border border-[#242424] bg-[#161616] hover:bg-[#1e1e1e] hover:border-[#333] transition-colors group/article min-w-0"
                        >
                          <span className="text-xs text-white/55 group-hover/article:text-white/80 transition-colors truncate min-w-0">{a.title}</span>
                          <span className="text-[11px] text-white/25 font-mono tabular-nums shrink-0">{a.total}×</span>
                          <div className="ml-auto flex items-center gap-1 shrink-0">
                            {MODELS.filter(m => a.perModel[m] > 0).map(m => (
                              <span key={m} title={`${MODEL_META[m].label}: ${a.perModel[m]}×`}
                                className="flex items-center justify-center w-4 h-4"
                                style={{ color: MODEL_META[m].color }}>
                                <ModelLogo model={m} size={11} />
                              </span>
                            ))}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

// ── Main Section ──────────────────────────────────────────────────────────────

const MODELS: ModelKey[] = ["chatgpt", "gemini", "claude"]

export function GeoSection({
  latestRun,
  scoreHistory,
  hasAnyData = false,
  days = 7,
  bingCrawlPct = null,
}: {
  latestRun:    GeoRunResult | null
  scoreHistory: GeoScoreSnapshot[]
  hasAnyData?:  boolean
  days?:        number
  bingCrawlPct?: number | null
}) {
  // ── No data in selected range ──────────────────────────────────────────────
  if (scoreHistory.length === 0) {
    return (
      <section className="space-y-5">
        <SectionHeader number="03" title="GEO / AI Visibility" />
        <div className="rounded-xl border border-[#222] bg-[#111] flex flex-col items-center gap-4 py-14">
          {hasAnyData ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400">New</span>
                <span className="text-sm text-white/35">no GEO scan in the last {days} days</span>
              </div>
              <p className="text-xs text-white/20">Scans run every ~10 days automatically</p>
            </>
          ) : (
            <>
              <p className="text-sm text-white/35">No GEO data yet</p>
              <p className="text-xs text-white/20">First scan runs on the 1st, 11th, and 21st of each month</p>
            </>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <SectionHeader number="03" title="GEO / AI Visibility" />

      {/* Model cards — score + sparkline from history, context from latest run */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {MODELS.map(m => (
          <ModelCard key={m} model={m} scoreHistory={scoreHistory} />
        ))}
        <CopilotCard crawlPct={bingCrawlPct} />
      </div>

      {/* Prompt vs Position — always latest run */}
      {latestRun && (
        <Card className="w-full">
          <CardHeader title="Prompt vs Position" />
          <div className="px-5 pt-4 pb-5 overflow-auto thin-scroll">
            <table className="w-full">
              <colgroup>
                <col style={{ width: "40%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "20%" }} />
              </colgroup>
              <thead>
                <tr className="border-b border-[#222]">
                  <Th>Prompt</Th>
                  {MODELS.map(m => (
                    <Th key={m} center>
                      <span className="inline-flex items-center justify-center gap-1.5" style={{ color: MODEL_META[m].color }}>
                        <ModelLogo model={m} size={12} />
                        <span className="hidden sm:inline">{MODEL_META[m].label}</span>
                      </span>
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {latestRun.prompts.map((p) => (
                  <tr key={p.promptId} className="hover:bg-white/[0.02] transition-colors border-b border-[#1a1a1a] last:border-0">
                    <td className="py-4 pr-8">
                      <span className="text-sm text-white/65 leading-relaxed">{p.promptText}</span>
                    </td>
                    {MODELS.map(m => (
                      <td key={m} className="py-4 text-center">
                        <PosBadge pos={p.models[m].position} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Sources — always latest run */}
      {latestRun && <UnifiedSourcesTable prompts={latestRun.prompts} />}
    </section>
  )
}
