import { Suspense } from "react"
import { unstable_cache } from "next/cache"
import { getCloudflareData } from "@/lib/cloudflare"
import { getSearchConsoleData, getPageInspections } from "@/lib/search-console"
import { getBingData } from "@/lib/bing"
import { DateFilter } from "@/components/DateFilter"
import { SparklineCard } from "@/components/SparklineCard"
import { SingleLineChart, SCChart } from "@/components/TrafficChart"
import { DonutChartsRow, DonutChart } from "@/components/DonutCharts"
import { WorldMap } from "@/components/WorldMap"

const cachedCloudflare      = unstable_cache(getCloudflareData, ["cloudflare"], { revalidate: 3600 })
const cachedSC              = unstable_cache(getSearchConsoleData, ["search-console"], { revalidate: 3600 })
const cachedBing            = unstable_cache(getBingData, ["bing"], { revalidate: 3600 })
const cachedPageInspections = (sitemapPath: string) =>
  unstable_cache(getPageInspections, ["page-inspections", sitemapPath], { revalidate: 3600 })(sitemapPath)

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K"
  return n.toLocaleString()
}
function fmtBytes(b: number) {
  if (b >= 1_073_741_824) return (b / 1_073_741_824).toFixed(2) + " GB"
  if (b >= 1_048_576)     return (b / 1_048_576).toFixed(1) + " MB"
  if (b >= 1_024)         return (b / 1_024).toFixed(1) + " KB"
  return b + " B"
}
function pct(part: number, total: number) {
  return total > 0 ? ((part / total) * 100).toFixed(1) + "%" : "—"
}
function flag(code: string) {
  if (!code || code.length !== 2) return "🌍"
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("")
}
function changePct(curr: number, prev: number) {
  if (prev === 0) return 0
  return ((curr - prev) / prev) * 100
}

// ─── SC country alpha-3 → alpha-2 ────────────────────────────────────────────
// Google Search Console returns ISO 3166-1 alpha-3 (3-letter) codes in lowercase

const SC_A3_TO_A2: Record<string, string> = {
  "afg":"AF","alb":"AL","dza":"DZ","ago":"AO","arg":"AR","aus":"AU","aut":"AT",
  "bgd":"BD","bel":"BE","bra":"BR","bgr":"BG","khm":"KH","cmr":"CM","can":"CA",
  "lka":"LK","chl":"CL","chn":"CN","col":"CO","cod":"CD","hrv":"HR","cze":"CZ",
  "dnk":"DK","eth":"ET","fin":"FI","fra":"FR","deu":"DE","gha":"GH","grc":"GR",
  "gtm":"GT","ind":"IN","idn":"ID","irn":"IR","irq":"IQ","irl":"IE","isr":"IL",
  "ita":"IT","jpn":"JP","jor":"JO","ken":"KE","kor":"KR","kwt":"KW","lva":"LV",
  "ltu":"LT","mys":"MY","mex":"MX","mar":"MA","omn":"OM","npl":"NP","nld":"NL",
  "nzl":"NZ","nga":"NG","nor":"NO","pak":"PK","per":"PE","phl":"PH","pol":"PL",
  "prt":"PT","pri":"PR","qat":"QA","rou":"RO","rus":"RU","sau":"SA","sgp":"SG",
  "svk":"SK","svn":"SI","zaf":"ZA","zwe":"ZW","esp":"ES","swe":"SE","che":"CH",
  "tha":"TH","tun":"TN","tur":"TR","ukr":"UA","are":"AE","gbr":"GB","usa":"US",
  "ury":"UY","ven":"VE","vnm":"VN","yem":"YE","bhr":"BH","est":"EE","mlt":"MT",
  "mng":"MN","mmr":"MM","lbn":"LB","jor":"JO","cri":"CR","pry":"PY","bol":"BO",
  "ecu":"EC","dom":"DO","gtm":"GT","hnk":"HK","twn":"TW","aze":"AZ","geo":"GE",
  "arm":"AM","kaz":"KZ","uzb":"UZ","bih":"BA","srb":"RS","mkd":"MK","alg":"DZ",
  "mac":"MO","khm":"KH","lao":"LA","khm":"KH",
}

// ─── UI primitives ────────────────────────────────────────────────────────────

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

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-[#222] bg-[#111] ${className}`}>
      {children}
    </div>
  )
}

function CardHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="px-5 pt-5 pb-4 border-b border-[#1a1a1a] flex items-baseline gap-2">
      <h3 className="text-xs font-semibold text-white/55 uppercase tracking-[0.1em]">{title}</h3>
      {sub && <span className="text-xs text-white/30">{sub}</span>}
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`pb-3 text-xs font-medium text-white/35 uppercase tracking-[0.08em] ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  )
}

function Td({ children, right, mono }: { children: React.ReactNode; right?: boolean; mono?: boolean }) {
  return (
    <td className={`py-3 text-sm border-b border-[#1a1a1a] ${right ? "text-right" : ""} ${mono ? "font-mono text-xs text-white/55" : ""}`}>
      {children}
    </td>
  )
}

function PositionBadge({ pos }: { pos: number }) {
  const cls = pos <= 3 ? "text-emerald-400" : pos <= 10 ? "text-green-400" : pos <= 20 ? "text-amber-400" : "text-white/50"
  return <span className={`font-bold tabular-nums text-sm ${cls}`}>{pos.toFixed(1)}</span>
}

function CountryRow({ code, pct, maxPct, color }: { code: string; pct: number; maxPct: number; color: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-5 text-center shrink-0 text-base">{flag(code)}</span>
      <span className="flex-1 text-white/65 truncate font-medium">{code}</span>
      <div className="w-20 h-[3px] bg-[#1a1a1a] rounded-full overflow-hidden shrink-0">
        <div className="h-full rounded-full" style={{ width: `${(pct / maxPct) * 100}%`, background: color }} />
      </div>
      <span className="w-11 text-right font-semibold text-white/80 tabular-nums shrink-0">{pct.toFixed(1)}%</span>
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Pulse({ className }: { className: string }) {
  return <div className={`bg-white/[0.04] rounded-lg animate-pulse ${className}`} />
}

function SectionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Pulse className="h-6 w-12" />
        <Pulse className="h-5 w-48" />
        <div className="flex-1 h-px bg-[#222]" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-[#111] rounded-xl border border-[#222] p-5 space-y-3">
            <Pulse className="h-3 w-24" />
            <Pulse className="h-8 w-32" />
            <Pulse className="h-14 w-full" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#111] rounded-xl border border-[#222] p-5">
          <Pulse className="h-4 w-40 mb-4" />
          <Pulse className="h-44 w-full" />
        </div>
        <div className="bg-[#111] rounded-xl border border-[#222] p-5">
          <Pulse className="h-4 w-32 mb-4" />
          <Pulse className="h-44 w-full" />
        </div>
      </div>
    </div>
  )
}

// ─── Section 1: Website Traffic ───────────────────────────────────────────────

async function CloudflareSection() {
  const data = await cachedCloudflare()
  if (!data) return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
      Failed to fetch Cloudflare data. Check API credentials in .env
    </div>
  )

  const { rumBrowsers, rumOS, rumDevices, rumPaths, rumReferers, errors } = data
  const allDays    = data.days
  const allRumDays = data.rumDays

  const days        = allDays.length >= 14    ? allDays.slice(-7)    : allDays
  const prevDays    = allDays.length >= 14    ? allDays.slice(0, 7)  : []
  const rumDays     = allRumDays.length >= 14 ? allRumDays.slice(-7) : allRumDays
  const prevRumDays = allRumDays.length >= 14 ? allRumDays.slice(0, 7) : []

  const H = days.reduce((a, d) => ({
    requests:       a.requests       + d.sum.requests,
    cachedRequests: a.cachedRequests + d.sum.cachedRequests,
    uniques:        a.uniques        + d.uniq.uniques,
  }), { requests: 0, cachedRequests: 0, uniques: 0 })

  const Hprev = prevDays.reduce((a, d) => ({
    requests: a.requests + d.sum.requests,
    uniques:  a.uniques  + d.uniq.uniques,
  }), { requests: 0, uniques: 0 })

  const rumCurr = { visits: rumDays.reduce((a, d) => a + d.sum.visits, 0), pageViews: rumDays.reduce((a, d) => a + d.count, 0) }
  const rumPrev = { visits: prevRumDays.reduce((a, d) => a + d.sum.visits, 0), pageViews: prevRumDays.reduce((a, d) => a + d.count, 0) }

  const hasRUM  = rumDays.length > 0
  const currPPV = rumCurr.visits > 0 ? rumCurr.pageViews / rumCurr.visits : 0
  const prevPPV = rumPrev.visits  > 0 ? rumPrev.pageViews / rumPrev.visits : 0

  const reqSpark   = days.map(d => d.sum.requests)
  const visitSpark = rumDays.map(d => d.sum.visits)
  const ppvSpark   = rumDays.map(d => d.sum.visits > 0 ? d.count / d.sum.visits : 0)

  const trafficData = days.map((d, i) => ({
    date:     d.dimensions.date,
    requests: d.sum.requests,
    visits:   rumDays[i]?.sum.visits ?? 0,
  }))

  const rumCountriesData = data.rumCountries
  const totalVisits  = rumCountriesData.reduce((s, c) => s + c.sum.visits, 0)
  const mapCountries = rumCountriesData.map(c => ({
    code:   c.dimensions.countryName,
    visits: c.sum.visits,
    pct:    totalVisits > 0 ? (c.sum.visits / totalVisits) * 100 : 0,
  }))
  const topMapCountries = mapCountries.slice(0, 8)
  const maxCountryPct   = topMapCountries[0]?.pct ?? 1

  const totalRefVisits = rumReferers.reduce((s, r) => s + r.sum.visits, 0)

  const devicesData  = rumDevices.map(d => ({ name: d.dimensions.deviceType || "Unknown",        value: d.sum.visits }))
  const browsersData = rumBrowsers.map(b => ({ name: b.dimensions.userAgentBrowser || "Unknown", value: b.sum.visits }))
  const osData       = rumOS.map(o =>        ({ name: o.dimensions.userAgentOS || "Unknown",      value: o.sum.visits }))

  return (
    <section className="space-y-5">
      <SectionHeader number="01" title="Website Traffic" />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SparklineCard label="Total Requests" value={fmtNum(H.requests)}
          change={prevDays.length ? changePct(H.requests, Hprev.requests) : undefined}
          data={reqSpark} color="#818cf8" gradientId="grad-req" sub="CDN layer · 7 days" />
        <SparklineCard label="Unique Visitors"
          value={hasRUM ? fmtNum(rumCurr.visits) : fmtNum(H.uniques)}
          change={hasRUM && prevRumDays.length ? changePct(rumCurr.visits, rumPrev.visits) : prevDays.length ? changePct(H.uniques, Hprev.uniques) : undefined}
          data={hasRUM ? visitSpark : days.map(d => d.uniq.uniques)}
          color="#34d399" gradientId="grad-vis"
          sub={hasRUM ? "RUM sessions · 7 days" : "CDN estimate · 7 days"} />
        <SparklineCard label="Pages Per Visit"
          value={hasRUM ? currPPV.toFixed(2) : "—"}
          change={hasRUM && prevPPV > 0 ? changePct(currPPV, prevPPV) : undefined}
          data={hasRUM ? ppvSpark : []} color="#fbbf24" gradientId="grad-ppv"
          sub={hasRUM ? "Avg page views per session" : "Requires RUM beacon"} />
      </div>

      {/* Requests + Visitors — separate charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Total Requests" sub="CDN · 7 days" />
          <div className="p-5 h-52">
            <SingleLineChart data={trafficData} dataKey="requests" name="Requests" color="#818cf8" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Unique Visitors" sub="RUM sessions · 7 days" />
          <div className="p-5 h-52">
            <SingleLineChart data={trafficData} dataKey="visits" name="Visitors" color="#34d399" />
          </div>
        </Card>
      </div>

      {/* World Map — full card with inline country list */}
      <Card>
        <CardHeader title="Visitors by Country" sub="RUM · 7 days" />
        <div className="grid grid-cols-1 lg:grid-cols-5">
          <div className="lg:col-span-3 p-4" style={{ height: "460px" }}>
            <WorldMap countries={mapCountries} accentColor="#818cf8" />
          </div>
          <div className="lg:col-span-2 px-5 py-5 border-t lg:border-t-0 lg:border-l border-[#1a1a1a] space-y-3">
            {topMapCountries.map((c, i) => (
              <CountryRow key={i} code={c.code} pct={c.pct} maxPct={maxCountryPct} color="#818cf8" />
            ))}
          </div>
        </div>
      </Card>

      {/* Daily Breakdown */}
      <Card>
        <CardHeader title="Daily Breakdown" sub="7 days" />
        <div className="px-5 pt-4 pb-5">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#222]">
                <Th>Date</Th>
                <Th right>Requests</Th>
                {hasRUM && <Th right>Unique Visits</Th>}
                {hasRUM && <Th right>Pages / Visit</Th>}
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => (
                <tr key={d.dimensions.date} className="hover:bg-white/[0.02] transition-colors">
                  <Td><span className="text-white/65">{d.dimensions.date}</span></Td>
                  <Td right><span className="font-semibold tabular-nums text-white/85">{fmtNum(d.sum.requests)}</span></Td>
                  {hasRUM && (
                    <Td right>
                      <span className="tabular-nums text-white/65">{rumDays[i] ? fmtNum(rumDays[i].sum.visits) : "—"}</span>
                    </Td>
                  )}
                  {hasRUM && (
                    <Td right>
                      <span className="tabular-nums text-white/65">
                        {rumDays[i] && rumDays[i].sum.visits > 0 ? (rumDays[i].count / rumDays[i].sum.visits).toFixed(2) : "—"}
                      </span>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Top Referrers */}
      {hasRUM && rumReferers.length > 0 && (
        <Card>
          <CardHeader title="Top Referrers" sub="RUM · visit %" />
          <div className="px-5 pt-4 pb-5 overflow-auto thin-scroll" style={{ maxHeight: "320px" }}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#222]">
                  <Th>Referrer</Th>
                  <Th right>%</Th>
                </tr>
              </thead>
              <tbody>
                {rumReferers.map((r, i) => {
                  const p = totalRefVisits > 0 ? (r.sum.visits / totalRefVisits) * 100 : 0
                  const maxP = totalRefVisits > 0 ? (rumReferers[0].sum.visits / totalRefVisits) * 100 : 1
                  return (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                      <Td><span className="text-white/70">{r.dimensions.refererHost || "(direct)"}</span></Td>
                      <Td right>
                        <div className="flex items-center justify-end gap-2.5">
                          <div className="w-16 h-[3px] bg-[#1a1a1a] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-[#34d399]" style={{ width: `${(p / maxP) * 100}%` }} />
                          </div>
                          <span className="text-sm font-semibold text-white/75 tabular-nums w-12 text-right">{p.toFixed(1)}%</span>
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* User Profile Donuts */}
      {(devicesData.length > 0 || browsersData.length > 0 || osData.length > 0) && (
        <div>
          <p className="text-xs font-medium text-white/40 uppercase tracking-[0.1em] mb-4">User Profile</p>
          <DonutChartsRow devices={devicesData} browsers={browsersData} os={osData} />
        </div>
      )}

      {errors.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-amber-400 hover:text-amber-300 transition-colors">
            ⚠ {errors.length} API error(s) — click to expand
          </summary>
          <pre className="mt-2 bg-[#111] border border-[#222] text-red-400 p-3 rounded-lg text-xs overflow-auto thin-scroll max-h-40">
            {JSON.stringify(errors, null, 2)}
          </pre>
        </details>
      )}
    </section>
  )
}

// ─── Section 2: Google Search Console ────────────────────────────────────────

async function SearchConsoleSection() {
  const sc = await cachedSC()

  return (
    <section className="space-y-5">
      <SectionHeader number="02" title="Google Search Performance" />

      {!sc && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
          Search Console not configured. Add <code className="bg-red-500/20 px-1 rounded">GOOGLE_SITE_URL</code> to .env
        </div>
      )}
      {sc && !sc.ok && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
          <strong>Error:</strong> {sc.error}
        </div>
      )}

      {sc?.ok && (() => {
        const web   = sc.web
        const image = sc.image

        const chartData = web.byDate.map(r => ({
          date:        r.keys[0],
          clicks:      r.clicks,
          impressions: Math.round(r.impressions / 10),
        }))

        const byDate  = web.byDate
        const recent7 = byDate.slice(-7)
        const prev7   = byDate.slice(-14, -7)

        const r7c   = recent7.reduce((s, r) => s + r.clicks, 0)
        const p7c   = prev7.reduce((s, r) => s + r.clicks, 0)
        const r7i   = recent7.reduce((s, r) => s + r.impressions, 0)
        const p7i   = prev7.reduce((s, r) => s + r.impressions, 0)
        const r7pos = recent7.length ? recent7.reduce((s, r) => s + r.position, 0) / recent7.length : 0
        const p7pos = prev7.length   ? prev7.reduce((s, r) => s + r.position, 0)  / prev7.length   : 0
        const r7ctr = recent7.length ? recent7.reduce((s, r) => s + r.ctr, 0) / recent7.length : 0
        const p7ctr = prev7.length   ? prev7.reduce((s, r) => s + r.ctr, 0)   / prev7.length   : 0

        const clickSpark = byDate.slice(-7).map(r => r.clicks)
        const imprSpark  = byDate.slice(-7).map(r => r.impressions)
        const posSpark   = byDate.slice(-7).map(r => r.position)
        const ctrSpark   = byDate.slice(-7).map(r => r.ctr * 100)

        // SC country map — convert alpha-3 ("ind") → alpha-2 ("IN") for WorldMap
        const totalSCClicks   = web.byCountry.reduce((s, r) => s + r.clicks, 0)
        const scCountryMapData = web.byCountry
          .map(r => ({
            code:   SC_A3_TO_A2[r.keys[0].toLowerCase()] ?? r.keys[0].toUpperCase().slice(0, 2),
            visits: r.clicks,
            pct:    totalSCClicks > 0 ? (r.clicks / totalSCClicks) * 100 : 0,
          }))
          .filter(c => c.code.length === 2)
        const topSCCountries = scCountryMapData.slice(0, 8)
        const maxSCPct       = topSCCountries[0]?.pct ?? 1

        // Device donut
        const deviceDonutData = web.byDevice.map(r => ({
          name:  r.keys[0].charAt(0).toUpperCase() + r.keys[0].slice(1).toLowerCase(),
          value: r.clicks,
        }))

        return (
          <div className="space-y-5">
            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SparklineCard label="Avg Position"
                value={web.avgPosition > 0 ? web.avgPosition.toFixed(1) : "—"}
                change={p7pos > 0 ? -((r7pos - p7pos) / p7pos) * 100 : undefined}
                data={posSpark.map(v => 100 - v)} color="#a78bfa" gradientId="grad-pos"
                sub="28 days · lower = better" />
              <SparklineCard label="Total Clicks" value={fmtNum(web.totalClicks)}
                change={p7c > 0 ? ((r7c - p7c) / p7c) * 100 : undefined}
                data={clickSpark} color="#60a5fa" gradientId="grad-clicks" sub="28 days" />
              <SparklineCard label="Total Impressions" value={fmtNum(web.totalImpressions)}
                change={p7i > 0 ? ((r7i - p7i) / p7i) * 100 : undefined}
                data={imprSpark} color="#34d399" gradientId="grad-impr" sub="28 days" />
              <SparklineCard label="Avg CTR"
                value={web.totalImpressions > 0 ? (web.avgCtr * 100).toFixed(2) + "%" : "—"}
                change={p7ctr > 0 ? ((r7ctr - p7ctr) / p7ctr) * 100 : undefined}
                data={ctrSpark} color="#fbbf24" gradientId="grad-ctr" sub="click-through rate" />
            </div>

            {/* Chart + Search Queries */}
            {chartData.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <Card className="lg:col-span-2">
                  <CardHeader title="Clicks & Impressions" sub="28 days" />
                  <div className="p-5 h-56">
                    <SCChart data={chartData} />
                  </div>
                  <div className="px-5 pb-4">
                    <p className="text-xs text-white/30">* Impressions scaled ÷10 for chart legibility</p>
                  </div>
                </Card>

                <Card className="lg:col-span-3">
                  <CardHeader title="Search Queries" sub="Top 25 · 28 days" />
                  <div className="px-5 pt-4 pb-5 overflow-auto thin-scroll" style={{ maxHeight: "320px" }}>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#222]">
                          <Th>Query</Th>
                          <Th right>Pos.</Th>
                          <Th right>Clicks</Th>
                          <Th right>Impr.</Th>
                          <Th right>CTR</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {web.topQueries.map((r, i) => (
                          <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                            <Td>
                              <span className="truncate block max-w-[200px] text-white/70" title={r.keys[0]}>{r.keys[0]}</span>
                            </Td>
                            <Td right><PositionBadge pos={r.position} /></Td>
                            <Td right><span className="font-semibold tabular-nums text-white/85">{fmtNum(r.clicks)}</span></Td>
                            <Td right><span className="text-white/50 tabular-nums">{fmtNum(r.impressions)}</span></Td>
                            <Td right><span className="text-white/50 tabular-nums">{(r.ctr * 100).toFixed(1)}%</span></Td>
                          </tr>
                        ))}
                        {web.topQueries.length === 0 && (
                          <tr><Td><span className="text-white/35">No query data yet</span></Td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}

            {/* Country Map */}
            <Card>
              <CardHeader title="Clicks by Country" sub="Google Search · 28 days" />
              <div className="grid grid-cols-1 lg:grid-cols-5">
                <div className="lg:col-span-3 p-4" style={{ height: "460px" }}>
                  <WorldMap countries={scCountryMapData} accentColor="#a78bfa" />
                </div>
                <div className="lg:col-span-2 px-5 py-5 border-t lg:border-t-0 lg:border-l border-[#1a1a1a] space-y-3">
                  {topSCCountries.length === 0 && (
                    <p className="text-sm text-white/35">No country data yet</p>
                  )}
                  {topSCCountries.map((c, i) => (
                    <CountryRow key={i} code={c.code} pct={c.pct} maxPct={maxSCPct} color="#a78bfa" />
                  ))}
                </div>
              </div>
            </Card>

            {/* Image Search + Device side by side */}
            {image.totalImpressions > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
                {/* Image Search Performance — colorful stat cards */}
                <Card className="lg:col-span-2">
                  <CardHeader title="Image Search Performance" sub="28 days" />
                  <div className="p-5 grid grid-cols-3 gap-3 mb-1">
                    {[
                      { label: "Avg Position",  value: image.avgPosition > 0 ? image.avgPosition.toFixed(1) : "—", color: "#a78bfa" },
                      { label: "Impressions",   value: fmtNum(image.totalImpressions),                               color: "#34d399" },
                      { label: "CTR",           value: image.totalImpressions > 0 ? (image.avgCtr * 100).toFixed(2) + "%" : "—", color: "#fbbf24" },
                    ].map(s => (
                      <div key={s.label} className="rounded-lg border border-[#222] bg-[#0d0d0d] p-4">
                        <p className="text-xs text-white/40 mb-2 uppercase tracking-wider">{s.label}</p>
                        <p className="text-2xl font-bold tabular-nums text-white">{s.value}</p>
                      </div>
                    ))}
                  </div>
                  <CardHeader title="Image Search Queries" />
                  <div className="px-5 pt-4 pb-5 overflow-auto thin-scroll" style={{ maxHeight: "240px" }}>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#222]">
                          <Th>Query</Th>
                          <Th right>Pos.</Th>
                          <Th right>Impr.</Th>
                          <Th right>CTR</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {image.topQueries.map((r, i) => (
                          <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                            <Td><span className="truncate block max-w-[180px] text-white/70" title={r.keys[0]}>{r.keys[0]}</span></Td>
                            <Td right><PositionBadge pos={r.position} /></Td>
                            <Td right><span className="text-white/50 tabular-nums">{fmtNum(r.impressions)}</span></Td>
                            <Td right><span className="text-white/50 tabular-nums">{(r.ctr * 100).toFixed(1)}%</span></Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Device Donut */}
                {deviceDonutData.length > 0 && (
                  <DonutChart data={deviceDonutData} title="Device Breakdown" />
                )}
              </div>
            )}

            {/* If no image search data, show device donut alone */}
            {image.totalImpressions === 0 && deviceDonutData.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <DonutChart data={deviceDonutData} title="Device Breakdown" />
              </div>
            )}

            {/* Top Pages */}
            <Card>
              <CardHeader title="Top Pages" sub="Web search · 28 days" />
              <div className="px-5 pt-4 pb-5 overflow-auto thin-scroll" style={{ maxHeight: "340px" }}>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#222]">
                      <Th>Page</Th>
                      <Th right>Pos.</Th>
                      <Th right>Clicks</Th>
                      <Th right>CTR</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {web.topPages.map((r, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <Td mono>{r.keys[0].replace(/^https?:\/\/[^/]+/, "") || "/"}</Td>
                        <Td right><PositionBadge pos={r.position} /></Td>
                        <Td right><span className="font-semibold tabular-nums text-white/85">{fmtNum(r.clicks)}</span></Td>
                        <Td right><span className="text-white/50 tabular-nums">{(r.ctr * 100).toFixed(1)}%</span></Td>
                      </tr>
                    ))}
                    {web.topPages.length === 0 && (
                      <tr><Td><span className="text-white/35">No page data yet</span></Td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )
      })()}
    </section>
  )
}

// ─── Section 3: Bing ──────────────────────────────────────────────────────────

async function BingSection() {
  const bing = await cachedBing()

  // Split 90d into current 30d and prior 30d for change %
  const sorted   = bing ? [...bing.queryStats].sort((a, b) => a.date.localeCompare(b.date)) : []
  const curr30   = sorted.slice(-30)
  const prev30   = sorted.slice(-60, -30)

  const currClicks = curr30.reduce((a, r) => a + r.clicks, 0)
  const prevClicks = prev30.reduce((a, r) => a + r.clicks, 0)
  const currImpr   = curr30.reduce((a, r) => a + r.impressions, 0)
  const prevImpr   = prev30.reduce((a, r) => a + r.impressions, 0)

  const currPos = curr30.filter(r => r.avgPosition > 0).length > 0
    ? curr30.filter(r => r.avgPosition > 0).reduce((a, r) => a + r.avgPosition, 0) / curr30.filter(r => r.avgPosition > 0).length : 0
  const prevPos = prev30.filter(r => r.avgPosition > 0).length > 0
    ? prev30.filter(r => r.avgPosition > 0).reduce((a, r) => a + r.avgPosition, 0) / prev30.filter(r => r.avgPosition > 0).length : 0

  const crawledPages = bing ? bing.pageInfo.filter(p => p.lastCrawled).length : 0

  const clickChange  = changePct(currClicks, prevClicks)
  const imprChange   = changePct(currImpr, prevImpr)
  // Position: lower is better, so flip sign for badge
  const posChange    = prevPos > 0 ? -changePct(currPos, prevPos) : 0

  const clickSpark = curr30.map(r => r.clicks)
  const imprSpark  = curr30.map(r => r.impressions)
  const posSpark   = curr30.map(r => r.avgPosition)

  return (
    <section className="space-y-5">
      <SectionHeader number="03" title="Bing Webmaster Tools" />

      {!bing && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
          Bing API key not set. Add <code className="bg-red-500/20 px-1 rounded">Bing_api</code> to .env
        </div>
      )}

      {bing && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SparklineCard
            label="Bing Clicks"
            value={fmtNum(currClicks)}
            change={prevClicks > 0 ? clickChange : undefined}
            data={clickSpark}
            color="#34d399"
            gradientId="bing-clicks"
            sub="organic clicks · 30d"
          />
          <SparklineCard
            label="Bing Impressions"
            value={fmtNum(currImpr)}
            change={prevImpr > 0 ? imprChange : undefined}
            data={imprSpark}
            color="#818cf8"
            gradientId="bing-impr"
            sub="search impressions · 30d"
          />
          <SparklineCard
            label="Avg Position"
            value={currPos > 0 ? currPos.toFixed(1) : "—"}
            change={prevPos > 0 ? posChange : undefined}
            data={posSpark}
            color="#fbbf24"
            gradientId="bing-pos"
            sub="avg rank on Bing"
          />
          <SparklineCard
            label="Pages Crawled"
            value={`${crawledPages} / ${bing.pageInfo.length}`}
            data={[]}
            color="#60a5fa"
            gradientId="bing-crawl"
            sub="From sitemap"
          />
        </div>
      )}

      {bing && bing.pageInfo.length > 0 && (
        <Card>
          <CardHeader title="Bing Crawl Status" sub="Per-page crawl info" />
          <div className="px-5 pt-4 pb-5 overflow-auto thin-scroll">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#222]">
                  <Th>Page</Th>
                  <Th right>Discovered</Th>
                  <Th right>Last Crawled</Th>
                </tr>
              </thead>
              <tbody>
                {bing.pageInfo.map((p, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <Td mono>{p.path}</Td>
                    <Td right><span className="text-white/50">{p.discoveryDate || "—"}</span></Td>
                    <Td right>
                      {p.lastCrawled
                        ? <span className="text-white/50">{p.lastCrawled}</span>
                        : <span className="text-amber-400 font-medium">Not yet</span>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {bing && bing.queryStats.length > 0 && (
        <Card>
          <CardHeader title="Bing Search Traffic" sub="Clicks & impressions · 90 days" />
          <div className="px-5 pt-4 pb-5 overflow-auto thin-scroll" style={{ maxHeight: "360px" }}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#222]">
                  <Th>Date</Th>
                  <Th right>Clicks</Th>
                  <Th right>Impressions</Th>
                  <Th right>Avg Position</Th>
                </tr>
              </thead>
              <tbody>
                {bing.queryStats.map((r, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <Td><span className="text-white/65">{r.date}</span></Td>
                    <Td right><span className="font-semibold tabular-nums text-white/85">{fmtNum(r.clicks)}</span></Td>
                    <Td right><span className="text-white/50 tabular-nums">{fmtNum(r.impressions)}</span></Td>
                    <Td right>
                      <span className={r.avgPosition > 0 && r.avgPosition <= 10 ? "text-emerald-400 font-semibold tabular-nums" : "text-white/50 tabular-nums"}>
                        {r.avgPosition > 0 ? r.avgPosition.toFixed(1) : "—"}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {bing && bing.queryStats.length === 0 && (
        <Card className="p-5">
          <p className="text-sm font-medium text-white/55 mb-2">No Bing organic search traffic yet</p>
          <p className="text-sm text-white/35">Pages are being crawled but Bing has not sent organic visits. Bing has very low market share in India.</p>
        </Card>
      )}
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic"

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="sticky top-0 z-40 border-b border-[#1a1a1a]"
        style={{ background: "rgba(10,10,10,0.85)", backdropFilter: "blur(20px)" }}>
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-white/[0.07] border border-white/[0.1] flex items-center justify-center">
              <span className="text-xs font-bold text-white/60">W</span>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white/80 tracking-tight leading-none">weddingtheory.co.in</h1>
              <p className="text-xs text-white/35 mt-0.5">Analytics Dashboard</p>
            </div>
          </div>
          <DateFilter label="Last 7 / 28 / 90 days" />
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-8 space-y-14">
        <Suspense fallback={<SectionSkeleton />}><CloudflareSection /></Suspense>
        <Suspense fallback={<SectionSkeleton />}><SearchConsoleSection /></Suspense>
        <Suspense fallback={<SectionSkeleton />}><BingSection /></Suspense>
        <p className="text-xs text-white/25 text-center pb-6">
          Cloudflare: 7-day window · Google Search Console: 28-day window · Bing: 90-day window
        </p>
      </main>
    </div>
  )
}
