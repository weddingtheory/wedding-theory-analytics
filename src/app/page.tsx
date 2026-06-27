import { Suspense } from "react"
import { unstable_cache } from "next/cache"
import { getCloudflareData } from "@/lib/cloudflare"
import { getSearchConsoleData, getPageInspections } from "@/lib/search-console"
import { getBingData } from "@/lib/bing"
import { DateFilter } from "@/components/DateFilter"
import { UserMenu } from "@/components/UserMenu"
import { SparklineCard } from "@/components/SparklineCard"
import { SingleLineChart, SCChart } from "@/components/TrafficChart"
import { DonutChartsRow, DonutChart } from "@/components/DonutCharts"
import { WorldMap } from "@/components/WorldMap"

function cachedCloudflare(days: number) {
  return unstable_cache(getCloudflareData, ["cloudflare", String(days)], { revalidate: 3600 })(days)
}
function cachedSC(days: number) {
  return unstable_cache(getSearchConsoleData, ["search-console", String(days)], { revalidate: 3600 })(days)
}
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
  "mng":"MN","mmr":"MM","lbn":"LB","cri":"CR","pry":"PY","bol":"BO",
  "ecu":"EC","dom":"DO","hnk":"HK","twn":"TW","aze":"AZ","geo":"GE",
  "arm":"AM","kaz":"KZ","uzb":"UZ","bih":"BA","srb":"RS","mkd":"MK","alg":"DZ",
  "mac":"MO","lao":"LA",
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

async function CloudflareSection({ days }: { days: number }) {
  const data = await cachedCloudflare(days)
  if (!data) return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
      Failed to fetch Cloudflare data. Check API credentials in .env
    </div>
  )

  const { rumBrowsers, rumOS, rumDevices, rumPaths, rumReferers, errors } = data
  const allDays    = data.days
  const allRumDays = data.rumDays

  const currDays    = allDays.length >= days    ? allDays.slice(-days)    : allDays
  const prevDays    = allDays.length >= days * 2 ? allDays.slice(0, days)  : []
  const currRumDays = allRumDays.length >= days    ? allRumDays.slice(-days) : allRumDays
  const prevRumDays = allRumDays.length >= days * 2 ? allRumDays.slice(0, days) : []

  const H = currDays.reduce((a, d) => ({
    requests:       a.requests       + d.sum.requests,
    cachedRequests: a.cachedRequests + d.sum.cachedRequests,
    uniques:        a.uniques        + d.uniq.uniques,
  }), { requests: 0, cachedRequests: 0, uniques: 0 })

  const Hprev = prevDays.reduce((a, d) => ({
    requests: a.requests + d.sum.requests,
    uniques:  a.uniques  + d.uniq.uniques,
  }), { requests: 0, uniques: 0 })

  const rumCurr = { visits: currRumDays.reduce((a, d) => a + d.sum.visits, 0), pageViews: currRumDays.reduce((a, d) => a + d.count, 0) }
  const rumPrev = { visits: prevRumDays.reduce((a, d) => a + d.sum.visits, 0), pageViews: prevRumDays.reduce((a, d) => a + d.count, 0) }

  const hasRUM  = currRumDays.length > 0
  const currPPV = rumCurr.visits > 0 ? rumCurr.pageViews / rumCurr.visits : 0
  const prevPPV = rumPrev.visits  > 0 ? rumPrev.pageViews / rumPrev.visits : 0

  const reqSpark   = currDays.map(d => d.sum.requests)
  const visitSpark = currRumDays.map(d => d.sum.visits)
  const ppvSpark   = currRumDays.map(d => d.sum.visits > 0 ? d.count / d.sum.visits : 0)
  const periodLabel = `${days}d`

  // Join by date, not by index — RUM skips days with 0 visits so array lengths can differ
  const rumByDate = new Map(currRumDays.map(d => [d.dimensions.date, d.sum.visits]))
  const trafficData = currDays.map(d => ({
    date:     d.dimensions.date,
    requests: d.sum.requests,
    visits:   rumByDate.get(d.dimensions.date) ?? 0,
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
          change={prevRumDays.length ? changePct(H.requests, Hprev.requests) : undefined}
          data={reqSpark} color="#818cf8" gradientId="grad-req"
          sub={`CDN layer · ${days} days`} periodLabel={periodLabel} />
        <SparklineCard label="Unique Visitors"
          value={hasRUM ? fmtNum(rumCurr.visits) : fmtNum(H.uniques)}
          change={hasRUM && prevRumDays.length ? changePct(rumCurr.visits, rumPrev.visits) : undefined}
          data={hasRUM ? visitSpark : currDays.map(d => d.uniq.uniques)}
          color="#34d399" gradientId="grad-vis"
          sub={hasRUM ? `RUM sessions · ${days} days` : `CDN estimate · ${days} days`}
          periodLabel={periodLabel} />
        <SparklineCard label="Pages Per Visit"
          value={hasRUM ? currPPV.toFixed(2) : "—"}
          change={hasRUM && prevPPV > 0 ? changePct(currPPV, prevPPV) : undefined}
          data={hasRUM ? ppvSpark : []} color="#fbbf24" gradientId="grad-ppv"
          sub={hasRUM ? "Avg page views per session" : "Requires RUM beacon"}
          periodLabel={periodLabel} />
      </div>

      {/* Data-age note — shown when the site is newer than the selected window */}
      {currDays.length < days && currDays.length > 0 && (
        <p className="text-[11px] text-white/25 -mt-1">
          Only {currDays.length}d of traffic data available · more will accumulate over time
        </p>
      )}

      {/* Requests + Visitors — separate charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Total Requests" sub={`CDN · ${days} days`} />
          <div className="p-5 h-52">
            <SingleLineChart data={trafficData} dataKey="requests" name="Requests" color="#818cf8" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Unique Visitors" sub={`RUM sessions · ${days} days`} />
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
        <CardHeader title="Daily Breakdown" sub={`${days} days`} />
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
              {currDays.map((d, i) => (
                <tr key={d.dimensions.date} className="hover:bg-white/[0.02] transition-colors">
                  <Td><span className="text-white/65">{d.dimensions.date}</span></Td>
                  <Td right><span className="font-semibold tabular-nums text-white/85">{fmtNum(d.sum.requests)}</span></Td>
                  {hasRUM && (
                    <Td right>
                      <span className="tabular-nums text-white/65">{currRumDays[i] ? fmtNum(currRumDays[i].sum.visits) : "—"}</span>
                    </Td>
                  )}
                  {hasRUM && (
                    <Td right>
                      <span className="tabular-nums text-white/65">
                        {currRumDays[i] && currRumDays[i].sum.visits > 0 ? (currRumDays[i].count / currRumDays[i].sum.visits).toFixed(2) : "—"}
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

async function SearchConsoleSection({ days }: { days: number }) {
  const sc = await cachedSC(days)
  const periodLabel = `${days}d`

  if (!sc) return (
    <section className="space-y-5">
      <SectionHeader number="02" title="Google Search Performance" />
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
        Search Console not configured. Add <code className="bg-red-500/20 px-1 rounded">GOOGLE_SITE_URL</code> to .env
      </div>
    </section>
  )

  if (!sc.ok) return (
    <section className="space-y-5">
      <SectionHeader number="02" title="Google Search Performance" />
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
        <strong>Error:</strong> {sc.error}
      </div>
    </section>
  )

  const web   = sc.web
  const image = sc.image

  const chartData = web.byDate.map(r => ({
    date:        r.keys[0],
    clicks:      r.clicks,
    impressions: Math.round(r.impressions / 10),
  }))

  const byDate     = web.byDate
  const clickSpark = byDate.map(r => r.clicks)
  const imprSpark  = byDate.map(r => r.impressions)
  const posSpark   = byDate.map(r => r.position)
  const ctrSpark   = byDate.map(r => r.ctr * 100)

  // SC country map — convert alpha-3 ("ind") → alpha-2 ("IN") for WorldMap
  const totalSCClicks    = web.byCountry.reduce((s, r) => s + r.clicks, 0)
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

  // Only compare against prior period when we have enough current data.
  // If we only have 7d of data but the user picks 90D, the prior-period query
  // returns old domain/content history which produces fake decrease badges.
  const scHasSufficientData = web.byDate.length >= Math.ceil(days / 2)

  return (
    <section className="space-y-5">
      <SectionHeader number="02" title="Google Search Performance" />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SparklineCard label="Avg Position"
          value={web.avgPosition > 0 ? web.avgPosition.toFixed(1) : "—"}
          change={scHasSufficientData && web.positionPrev > 0 ? -(changePct(web.avgPosition, web.positionPrev)) : web.totalImpressions > 0 ? null : undefined}
          data={posSpark.map(v => 100 - v)} color="#a78bfa" gradientId="grad-pos"
          sub={`${days} days · lower = better`} periodLabel={periodLabel} />
        <SparklineCard label="Total Clicks" value={fmtNum(web.totalClicks)}
          change={scHasSufficientData && web.clicksPrev > 0 ? changePct(web.totalClicks, web.clicksPrev) : web.totalClicks > 0 ? null : undefined}
          data={clickSpark} color="#60a5fa" gradientId="grad-clicks"
          sub={`${days} days`} periodLabel={periodLabel} />
        <SparklineCard label="Total Impressions" value={fmtNum(web.totalImpressions)}
          change={scHasSufficientData && web.impressionsPrev > 0 ? changePct(web.totalImpressions, web.impressionsPrev) : web.totalImpressions > 0 ? null : undefined}
          data={imprSpark} color="#34d399" gradientId="grad-impr"
          sub={`${days} days`} periodLabel={periodLabel} />
        <SparklineCard label="Avg CTR"
          value={web.totalImpressions > 0 ? (web.avgCtr * 100).toFixed(2) + "%" : "—"}
          change={scHasSufficientData && web.ctrPrev > 0 ? changePct(web.avgCtr, web.ctrPrev) : web.totalImpressions > 0 ? null : undefined}
          data={ctrSpark} color="#fbbf24" gradientId="grad-ctr"
          sub="click-through rate" periodLabel={periodLabel} />
      </div>

      {/* Data-age note — shown when SC history is shorter than the selected window */}
      {web.byDate.length > 0 && web.byDate.length < days - 2 && (
        <p className="text-[11px] text-white/25 -mt-1">
          Only {web.byDate.length}d of search data available · earlier dates show no activity yet
        </p>
      )}

      {/* Chart + Search Queries */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader title="Clicks & Impressions" sub={`${days} days`} />
            <div className="p-5 h-56">
              <SCChart data={chartData} />
            </div>
            <div className="px-5 pb-4">
              <p className="text-xs text-white/30">* Impressions scaled ÷10 for chart legibility</p>
            </div>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader title="Search Queries" sub={`Top 25 · ${days} days`} />
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
        <CardHeader title="Clicks by Country" sub={`Google Search · ${days} days`} />
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
          <Card className="lg:col-span-2">
            <CardHeader title="Image Search Performance" sub={`${days} days`} />
            <div className="p-5 grid grid-cols-3 gap-3 mb-1">
              {[
                { label: "Avg Position",  value: image.avgPosition > 0 ? image.avgPosition.toFixed(1) : "—" },
                { label: "Impressions",   value: fmtNum(image.totalImpressions) },
                { label: "CTR",           value: image.totalImpressions > 0 ? (image.avgCtr * 100).toFixed(2) + "%" : "—" },
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

          {deviceDonutData.length > 0 && (
            <DonutChart data={deviceDonutData} title="Device Breakdown" />
          )}
        </div>
      )}

      {image.totalImpressions === 0 && deviceDonutData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <DonutChart data={deviceDonutData} title="Device Breakdown" />
        </div>
      )}

      {/* Top Pages */}
      <Card>
        <CardHeader title="Top Pages" sub={`Web search · ${days} days`} />
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
    </section>
  )
}

// ─── Section 3: Bing ──────────────────────────────────────────────────────────

async function BingSection({ days }: { days: number }) {
  const bing = await cachedBing()
  const periodLabel = `${days}d`

  // Bing API always returns 90 days; slice to selected window + prior window for change %
  const cappedDays = Math.min(days, 90)
  const sorted  = bing ? [...bing.queryStats].sort((a, b) => a.date.localeCompare(b.date)) : []
  const currSlice = sorted.slice(-cappedDays)
  const prevSlice = sorted.slice(-cappedDays * 2, -cappedDays)

  const currClicks = currSlice.reduce((a, r) => a + r.clicks, 0)
  const prevClicks = prevSlice.reduce((a, r) => a + r.clicks, 0)
  const currImpr   = currSlice.reduce((a, r) => a + r.impressions, 0)
  const prevImpr   = prevSlice.reduce((a, r) => a + r.impressions, 0)

  const currPosDays = currSlice.filter(r => r.avgPosition > 0)
  const prevPosDays = prevSlice.filter(r => r.avgPosition > 0)
  const currPos = currPosDays.length > 0 ? currPosDays.reduce((a, r) => a + r.avgPosition, 0) / currPosDays.length : 0
  const prevPos = prevPosDays.length > 0 ? prevPosDays.reduce((a, r) => a + r.avgPosition, 0) / prevPosDays.length : 0

  const crawledPages = bing ? bing.pageInfo.filter(p => p.lastCrawled).length : 0

  const clickChange = changePct(currClicks, prevClicks)
  const imprChange  = changePct(currImpr, prevImpr)
  // Position: lower is better, so flip sign for badge
  const posChange   = prevPos > 0 ? -changePct(currPos, prevPos) : 0

  const clickSpark = currSlice.map(r => r.clicks)
  const imprSpark  = currSlice.map(r => r.impressions)
  const posSpark   = currSlice.map(r => r.avgPosition)

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
            change={prevClicks > 0 ? clickChange : currClicks > 0 ? null : undefined}
            data={clickSpark}
            color="#34d399"
            gradientId="bing-clicks"
            sub={`organic clicks · ${days}d`}
            periodLabel={periodLabel}
          />
          <SparklineCard
            label="Bing Impressions"
            value={fmtNum(currImpr)}
            change={prevImpr > 0 ? imprChange : currImpr > 0 ? null : undefined}
            data={imprSpark}
            color="#818cf8"
            gradientId="bing-impr"
            sub={`search impressions · ${days}d`}
            periodLabel={periodLabel}
          />
          <SparklineCard
            label="Avg Position"
            value={currPos > 0 ? currPos.toFixed(1) : "—"}
            change={prevPos > 0 ? posChange : currPos > 0 ? null : undefined}
            data={posSpark}
            color="#fbbf24"
            gradientId="bing-pos"
            sub="avg rank on Bing"
            periodLabel={periodLabel}
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

export default async function Home({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range = "7d" } = await searchParams
  const days = range === "90d" ? 90 : range === "30d" ? 30 : range === "15d" ? 15 : 7

  // Pre-warm the other three range caches so switching feels instant.
  // These are fire-and-forget: if already cached they resolve immediately; if cold
  // they populate in the background before the user clicks a different range.
  ;([7, 15, 30, 90] as const).filter(d => d !== days).forEach(d => {
    cachedCloudflare(d).catch(() => {})
    cachedSC(d).catch(() => {})
  })

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="sticky top-0 z-40 border-b border-[#1a1a1a]"
        style={{ background: "rgba(10,10,10,0.85)", backdropFilter: "blur(20px)" }}>
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 sm:py-4 grid grid-cols-3 items-center">
          <h1 className="hidden sm:block text-base font-semibold text-white/80 tracking-tight">Wedding Theory Analytics</h1>
          <div className="col-span-2 sm:col-span-1 flex justify-start sm:justify-center">
            <DateFilter current={range} />
          </div>
          <div className="flex justify-end">
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-10 sm:space-y-14">
        <Suspense fallback={<SectionSkeleton />}><CloudflareSection days={days} /></Suspense>
        <Suspense fallback={<SectionSkeleton />}><SearchConsoleSection days={days} /></Suspense>
        <Suspense fallback={<SectionSkeleton />}><BingSection days={days} /></Suspense>
        <p className="text-xs text-white/25 text-center pb-6">
          Showing {days}-day window · Bing capped at 90 days
        </p>
      </main>
    </div>
  )
}
