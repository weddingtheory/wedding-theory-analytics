import { getCloudflareData } from "@/lib/cloudflare"
import { getSearchConsoleData } from "@/lib/search-console"
import { getBingData } from "@/lib/bing"
import type {
  DayGroup, CountryEntry, StatusEntry, ContentEntry,
  BrowserEntry, SSLEntry, HTTPVerEntry, IPClassEntry,
} from "@/lib/cloudflare"

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
// RUM time values come in microseconds → convert to ms then format
function fmtUs(us: number) {
  const ms = us / 1000
  return ms >= 1000 ? (ms / 1000).toFixed(2) + "s" : Math.round(ms) + "ms"
}
function pct(part: number, total: number) {
  return total > 0 ? ((part / total) * 100).toFixed(1) + "%" : "—"
}
function flag(code: string) {
  if (!code || code.length !== 2) return "🌍"
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join("")
}

// ─── HTTP map aggregation ─────────────────────────────────────────────────────

function aggMap<T>(
  days: DayGroup[], field: keyof DayGroup["sum"], keyField: keyof T, valueField: keyof T,
): { key: string; value: number }[] {
  const m = new Map<string, number>()
  for (const day of days)
    for (const e of (day.sum[field] as unknown as T[]))
      m.set(String(e[keyField]), (m.get(String(e[keyField])) ?? 0) + Number(e[valueField]))
  return [...m.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value)
}

function aggCountries(days: DayGroup[]) {
  const m = new Map<string, { requests: number; threats: number; bytes: number }>()
  for (const day of days)
    for (const e of day.sum.countryMap) {
      const x = m.get(e.clientCountryName) ?? { requests: 0, threats: 0, bytes: 0 }
      m.set(e.clientCountryName, { requests: x.requests + e.requests, threats: x.threats + e.threats, bytes: x.bytes + e.bytes })
    }
  return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.requests - a.requests)
}

// ─── Status code helpers ──────────────────────────────────────────────────────

function statusBg(s: number)    { return s < 300 ? "bg-green-500" : s < 400 ? "bg-blue-500" : s < 500 ? "bg-amber-500" : "bg-red-500" }
function statusBadge(s: number) { return s < 300 ? "text-green-700 bg-green-50 ring-green-200" : s < 400 ? "text-blue-700 bg-blue-50 ring-blue-200" : s < 500 ? "text-amber-700 bg-amber-50 ring-amber-200" : "text-red-700 bg-red-50 ring-red-200" }

// ─── Core Web Vitals scoring (thresholds from web.dev) ───────────────────────
// All time values from API are in microseconds

function vitalsScore(metric: string, usValue: number): "good" | "needs" | "poor" {
  // CLS is a raw ratio (not time), everything else is microseconds
  const msValue = metric === "cls" ? usValue : usValue / 1000
  const thresholds: Record<string, [number, number]> = {
    lcp:  [2500, 4000],
    fcp:  [1800, 3000],
    ttfb: [800,  1800],
    inp:  [200,  500],
    fid:  [100,  300],
    cls:  [0.1,  0.25],
    plt:  [2500, 5000],
  }
  const [good, poor] = thresholds[metric] ?? [0, Infinity]
  return msValue <= good ? "good" : msValue <= poor ? "needs" : "poor"
}
function scoreCls(s: "good"|"needs"|"poor") {
  return s === "good" ? "text-green-600 bg-green-50 border-green-200" : s === "needs" ? "text-amber-600 bg-amber-50 border-amber-200" : "text-red-600 bg-red-50 border-red-200"
}
function scoreDot(s: "good"|"needs"|"poor") {
  return s === "good" ? "bg-green-500" : s === "needs" ? "bg-amber-500" : "bg-red-500"
}

// ─── UI Primitives ────────────────────────────────────────────────────────────

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-baseline gap-2">
        <h2 className="text-xs font-semibold text-gray-800 uppercase tracking-wider">{title}</h2>
        {sub && <span className="text-xs text-gray-600">{sub}</span>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Bar({ label, value, max, note, color = "bg-blue-500" }: {
  label: string; value: number; max: number; note?: string; color?: string
}) {
  const w = max > 0 ? Math.max((value / max) * 100, 1) : 0
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-900 truncate max-w-[65%]" title={label}>{label || "Unknown"}</span>
        <span className="text-gray-700 text-xs shrink-0 font-medium">{note ?? fmtNum(value)}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full">
        {/* eslint-disable-next-line react/forbid-dom-props */}
        <div className={`h-full ${color} rounded-full`} style={{ width: `${w}%` }} />
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, color = "text-gray-900" }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-700 mt-0.5">{sub}</p>}
    </div>
  )
}

function VitalCard({ name, metric, p50, p75, p90, isCls = false }: {
  name: string; metric: string; p50: number; p75: number; p90: number; isCls?: boolean
}) {
  const fmt = isCls ? (v: number) => v.toFixed(3) : fmtUs
  const score = vitalsScore(metric, p75)
  const borderCls = score === "good" ? "border-green-300" : score === "needs" ? "border-amber-300" : "border-red-300"
  const bgCls     = score === "good" ? "bg-green-50"     : score === "needs" ? "bg-amber-50"     : "bg-red-50"
  const labelCls  = score === "good" ? "text-green-800"  : score === "needs" ? "text-amber-800"  : "text-red-800"
  const badgeCls  = score === "good"
    ? "text-green-800 bg-green-100 border-green-300"
    : score === "needs"
    ? "text-amber-800 bg-amber-100 border-amber-300"
    : "text-red-800 bg-red-100 border-red-300"
  return (
    <div className={`rounded-xl border p-4 ${bgCls} ${borderCls}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-bold uppercase tracking-wide ${labelCls}`}>{name}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${badgeCls}`}>
          {score === "good" ? "Good" : score === "needs" ? "Needs work" : "Poor"}
        </span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{fmt(p75)}</p>
      <p className="text-xs text-gray-600 mb-3">p75 (last 7 days)</p>
      <div className="space-y-1.5 text-xs text-gray-700">
        {([["p50", p50], ["p75", p75], ["p90", p90]] as [string, number][]).map(([label, val]) => (
          <div key={label} className="flex justify-between">
            <span className="font-medium">{label}</span>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${scoreDot(vitalsScore(metric, val))}`} />
              <span className="font-semibold text-gray-900">{fmt(val)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function Home() {
  const [data, sc, bing] = await Promise.all([getCloudflareData(), getSearchConsoleData(), getBingData()])
  if (!data) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-red-500">Failed to fetch. Check API credentials in .env</p>
    </div>
  )

  const {
    days, topPaths, topDevices,
    rumDays, rumPerfDays, rumVitalsDays,
    rumCountries, rumBrowsers, rumOS, rumDevices, rumPaths, rumReferers,
    errors, siteTag,
  } = data

  // ── HTTP totals ──────────────────────────────────────────────────────────────
  const H = days.reduce((a, d) => ({
    requests:       a.requests       + d.sum.requests,
    pageViews:      a.pageViews      + d.sum.pageViews,
    bytes:          a.bytes          + d.sum.bytes,
    cachedBytes:    a.cachedBytes    + d.sum.cachedBytes,
    cachedRequests: a.cachedRequests + d.sum.cachedRequests,
    encReq:         a.encReq         + d.sum.encryptedRequests,
    encBytes:       a.encBytes       + d.sum.encryptedBytes,
    threats:        a.threats        + d.sum.threats,
    uniques:        a.uniques        + d.uniq.uniques,
  }), { requests: 0, pageViews: 0, bytes: 0, cachedBytes: 0, cachedRequests: 0, encReq: 0, encBytes: 0, threats: 0, uniques: 0 })

  // ── RUM totals ───────────────────────────────────────────────────────────────
  const R = rumDays.reduce((a, d) => ({ visits: a.visits + d.sum.visits, pageViews: a.pageViews + d.count }),
    { visits: 0, pageViews: 0 })

  // ── Aggregated HTTP maps ─────────────────────────────────────────────────────
  const countries = aggCountries(days)
  const statuses  = aggMap<StatusEntry>(days, "responseStatusMap", "edgeResponseStatus", "requests")
  const content   = aggMap<ContentEntry>(days, "contentTypeMap", "edgeResponseContentTypeName", "requests")
  const browsers  = aggMap<BrowserEntry>(days, "browserMap", "uaBrowserFamily", "pageViews")
  const ssl       = aggMap<SSLEntry>(days, "clientSSLMap", "clientSSLProtocol", "requests")
  const httpVer   = aggMap<HTTPVerEntry>(days, "clientHTTPVersionMap", "clientHTTPProtocol", "requests")
  const ipClass   = aggMap<IPClassEntry>(days, "ipClassMap", "ipType", "requests")

  const maxReq  = Math.max(...days.map(d => d.sum.requests), 1)
  const hasRUM  = rumDays.length > 0
  const hasPerf = rumPerfDays.length > 0
  const hasVitals = rumVitalsDays.length > 0

  // Use latest day with data for vitals cards
  const latestPerf   = rumPerfDays[rumPerfDays.length - 1]
  const latestVitals = rumVitalsDays[rumVitalsDays.length - 1]

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-8 py-5 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">weddingtheory.co.in</h1>
            <p className="text-sm text-gray-900">Cloudflare Analytics — last 7 days · siteTag: {siteTag ?? "not found"}</p>
          </div>
          {errors.length > 0 && (
            <details className="text-xs text-amber-600">
              <summary className="cursor-pointer bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                ⚠ {errors.length} API error(s)
              </summary>
              <pre className="mt-2 bg-gray-900 text-red-400 p-3 rounded text-xs max-w-xl overflow-auto">
                {JSON.stringify(errors, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">

        {/* ── HTTP Overview ── */}
        <div>
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">HTTP Traffic (CDN layer — 7 days)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Requests"    value={fmtNum(H.requests)} />
            <StatCard label="Page Views (CDN)"  value={fmtNum(H.pageViews)} />
            <StatCard label="Bandwidth"         value={fmtBytes(H.bytes)} />
            <StatCard label="Threats Blocked"   value={fmtNum(H.threats)} color={H.threats > 0 ? "text-red-600" : "text-gray-900"} />
            <StatCard label="Cache Hit Rate"    value={pct(H.cachedRequests, H.requests)} sub={fmtBytes(H.cachedBytes) + " saved"} />
            <StatCard label="HTTPS Rate"        value={pct(H.encReq, H.requests)} sub={fmtBytes(H.encBytes) + " encrypted"} />
            <StatCard label="Cached Bandwidth"  value={pct(H.cachedBytes, H.bytes)} />
            <StatCard label="CDN Unique Visits" value={fmtNum(H.uniques)} sub="Per-day estimate, not deduplicated" />
          </div>
        </div>

        {/* ── Web Analytics (RUM) Overview ── */}
        {hasRUM ? (
          <div>
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">Web Analytics (Real User Monitoring — 7 days)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Visits (sessions)"  value={fmtNum(R.visits)}    sub="Deduplicated user sessions" />
              <StatCard label="Page Views (RUM)"   value={fmtNum(R.pageViews)} sub="JS beacon page loads" />
              <StatCard label="Pages / Visit"      value={R.visits > 0 ? (R.pageViews / R.visits).toFixed(1) : "—"} />
              <StatCard label="RUM Sample Events"  value={fmtNum(rumDays.reduce((a, d) => a + d.count, 0))} />
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
            Web Analytics beacon not returning data yet. Beacon is auto-injected — data typically appears within a few hours of traffic.
          </div>
        )}

        {/* ── Performance Vitals ── */}
        {hasPerf && latestPerf && (
          <div>
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">Page Load Performance</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <VitalCard name="Page Load Time" metric="plt"
                p50={latestPerf.quantiles.pageLoadTimeP50}
                p75={latestPerf.quantiles.pageLoadTimeP75}
                p90={latestPerf.quantiles.pageLoadTimeP90} />
              <VitalCard name="First Contentful Paint" metric="fcp"
                p50={latestPerf.quantiles.firstContentfulPaintP50}
                p75={latestPerf.quantiles.firstContentfulPaintP75}
                p90={latestPerf.quantiles.firstContentfulPaintP90} />
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Connection Time</p>
                <p className="text-2xl font-bold text-gray-900">{fmtUs(latestPerf.quantiles.connectionTimeP50)}</p>
                <p className="text-xs text-gray-600 mb-3">p50</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-700">DNS</span><span className="font-semibold text-gray-900">{fmtUs(latestPerf.quantiles.dnsTimeP50)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-700">Request</span><span className="font-semibold text-gray-900">{fmtUs(latestPerf.quantiles.requestTimeP50)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-700">Response</span><span className="font-semibold text-gray-900">{fmtUs(latestPerf.quantiles.responseTimeP50)}</span></div>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Daily Trend</p>
                <div className="flex items-end gap-1 h-16">
                  {rumPerfDays.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col justify-end" title={`${d.dimensions.date}: ${fmtUs(d.quantiles.pageLoadTimeP50)}`}>
                      {/* eslint-disable-next-line react/forbid-dom-props */}
                      <div className="w-full bg-indigo-400 rounded-t-sm"
                        style={{ height: `${(d.quantiles.pageLoadTimeP50 / Math.max(...rumPerfDays.map(x => x.quantiles.pageLoadTimeP50), 1)) * 100}%` }} />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-1">Page load p50</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Core Web Vitals ── */}
        {hasVitals && latestVitals && (
          <div>
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">Core Web Vitals</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <VitalCard name="LCP" metric="lcp"
                p50={latestVitals.quantiles.largestContentfulPaintP50}
                p75={latestVitals.quantiles.largestContentfulPaintP75}
                p90={latestVitals.quantiles.largestContentfulPaintP90} />
              <VitalCard name="FCP" metric="fcp"
                p50={latestVitals.quantiles.firstContentfulPaintP50}
                p75={latestVitals.quantiles.firstContentfulPaintP75}
                p90={latestVitals.quantiles.firstContentfulPaintP90} />
              <VitalCard name="TTFB" metric="ttfb"
                p50={latestVitals.quantiles.timeToFirstByteP50}
                p75={latestVitals.quantiles.timeToFirstByteP75}
                p90={latestVitals.quantiles.timeToFirstByteP90} />
              <VitalCard name="INP" metric="inp"
                p50={latestVitals.quantiles.interactionToNextPaintP50}
                p75={latestVitals.quantiles.interactionToNextPaintP75}
                p90={latestVitals.quantiles.interactionToNextPaintP90} />
              <VitalCard name="FID" metric="fid"
                p50={latestVitals.quantiles.firstInputDelayP50}
                p75={latestVitals.quantiles.firstInputDelayP75}
                p90={latestVitals.quantiles.firstInputDelayP90} />
              <VitalCard name="CLS" metric="cls" isCls
                p50={latestVitals.quantiles.cumulativeLayoutShiftP50}
                p75={latestVitals.quantiles.cumulativeLayoutShiftP75}
                p90={latestVitals.quantiles.cumulativeLayoutShiftP90} />
            </div>
          </div>
        )}

        {/* ── Daily Traffic ── */}
        <Section title="Daily HTTP Traffic (7 days)">
          {/* eslint-disable-next-line react/forbid-dom-props */}
          <div className="flex items-end gap-2 mb-3" style={{ height: "60px" }}>
            {days.map(d => (
              <div key={d.dimensions.date} className="flex-1 flex flex-col justify-end"
                title={`${d.dimensions.date}: ${fmtNum(d.sum.requests)} requests`}>
                {/* eslint-disable-next-line react/forbid-dom-props */}
                <div className="w-full bg-blue-500 rounded-t-sm" style={{ height: `${(d.sum.requests / maxReq) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mb-4">
            {days.map(d => <div key={d.dimensions.date} className="flex-1 text-center text-xs text-gray-600 font-medium">{d.dimensions.date.slice(5)}</div>)}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-600 font-semibold uppercase border-b border-gray-200">
                {["Date","Requests","Page Views","Unique*","Bandwidth","Cache%","HTTPS%","Threats"].map(h => (
                  <th key={h} className={`pb-2 ${h === "Date" ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map(d => (
                <tr key={d.dimensions.date} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 text-gray-800">{d.dimensions.date}</td>
                  <td className="py-2 text-right font-medium">{fmtNum(d.sum.requests)}</td>
                  <td className="py-2 text-right text-gray-800">{fmtNum(d.sum.pageViews)}</td>
                  <td className="py-2 text-right text-gray-800">{fmtNum(d.uniq.uniques)}</td>
                  <td className="py-2 text-right text-gray-800">{fmtBytes(d.sum.bytes)}</td>
                  <td className="py-2 text-right text-gray-800">{pct(d.sum.cachedRequests, d.sum.requests)}</td>
                  <td className="py-2 text-right text-gray-800">{pct(d.sum.encryptedRequests, d.sum.requests)}</td>
                  <td className="py-2 text-right">{d.sum.threats > 0
                    ? <span className="text-red-500 font-medium">{d.sum.threats}</span>
                    : <span className="text-gray-500">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* ── RUM Daily Visits ── */}
        {hasRUM && (
          <Section title="Daily Visits (Web Analytics — Real Users)">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-600 font-semibold uppercase border-b border-gray-200">
                  {["Date","Visits (sessions)","Page Views","Avg Pages/Visit"].map(h => (
                    <th key={h} className={`pb-2 ${h === "Date" ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rumDays.map(d => (
                  <tr key={d.dimensions.date} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 text-gray-800">{d.dimensions.date}</td>
                    <td className="py-2 text-right font-medium">{fmtNum(d.sum.visits)}</td>
                    <td className="py-2 text-right text-gray-800">{fmtNum(d.count)}</td>
                    <td className="py-2 text-right text-gray-700">
                      {d.sum.visits > 0 ? (d.count / d.sum.visits).toFixed(1) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* ── Countries: HTTP + RUM ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title="Top Countries (HTTP requests)">
            <div className="overflow-auto max-h-80">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-600 font-semibold uppercase border-b border-gray-200">
                    <th className="text-left pb-2">Country</th>
                    <th className="text-right pb-2">Requests</th>
                    <th className="text-right pb-2">Bandwidth</th>
                    <th className="text-right pb-2">Threats</th>
                  </tr>
                </thead>
                <tbody>
                  {countries.slice(0, 20).map(c => (
                    <tr key={c.name} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-1.5"><span className="mr-2">{flag(c.name)}</span><span className="text-gray-700">{c.name}</span></td>
                      <td className="py-1.5 text-right">{fmtNum(c.requests)}</td>
                      <td className="py-1.5 text-right text-gray-700">{fmtBytes(c.bytes)}</td>
                      <td className="py-1.5 text-right">{c.threats > 0 ? <span className="text-red-500">{c.threats}</span> : <span className="text-gray-500">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {hasRUM ? (
            <Section title="Top Countries (Real Visits — RUM)">
              <div className="overflow-auto max-h-80">
                {rumCountries.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                    <span>{flag(c.dimensions.countryName)}</span>
                    <span className="flex-1 text-sm text-gray-900">{c.dimensions.countryName || "Unknown"}</span>
                    <span className="font-medium text-sm">{fmtNum(c.sum.visits)}</span>
                    <span className="text-xs text-gray-600">visits</span>
                    <span className="text-xs text-gray-600">/ {fmtNum(c.count)} views</span>
                  </div>
                ))}
              </div>
            </Section>
          ) : (
            <Section title="Top Paths (HTTP — today)">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-600 font-semibold uppercase border-b border-gray-200">
                  <th className="text-left pb-2">Path</th><th className="text-right pb-2">Method</th><th className="text-right pb-2">Requests</th>
                </tr></thead>
                <tbody>
                  {topPaths.map((p, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-1.5 font-mono text-xs text-gray-900 truncate max-w-xs" title={p.dimensions.clientRequestPath}>{p.dimensions.clientRequestPath || "/"}</td>
                      <td className="py-1.5 text-right"><span className="text-xs bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded font-medium">{p.dimensions.clientRequestHTTPMethodName}</span></td>
                      <td className="py-1.5 text-right font-medium">{fmtNum(p.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
        </div>

        {/* ── RUM: Pages + Referers ── */}
        {hasRUM && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Top Pages (Real Visits — RUM)">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-600 font-semibold uppercase border-b border-gray-200">
                  <th className="text-left pb-2">Path</th><th className="text-right pb-2">Visits</th><th className="text-right pb-2">Views</th>
                </tr></thead>
                <tbody>
                  {rumPaths.map((p, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-1.5 font-mono text-xs text-gray-900 truncate max-w-xs" title={p.dimensions.requestPath}>{p.dimensions.requestPath || "/"}</td>
                      <td className="py-1.5 text-right font-medium">{fmtNum(p.sum.visits)}</td>
                      <td className="py-1.5 text-right text-gray-700">{fmtNum(p.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="Top Referers (Real Visits — RUM)">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-600 font-semibold uppercase border-b border-gray-200">
                  <th className="text-left pb-2">Referer Domain</th><th className="text-right pb-2">Visits</th>
                </tr></thead>
                <tbody>
                  {rumReferers.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-1.5 text-sm text-gray-900">{r.dimensions.refererHost || "(direct / none)"}</td>
                      <td className="py-1.5 text-right font-medium">{fmtNum(r.sum.visits)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </div>
        )}

        {/* ── RUM: Browsers + Devices + OS ── */}
        {hasRUM && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Section title="Browsers (Real Visits)">
              {rumBrowsers.map((b, i) => (
                <Bar key={i} label={b.dimensions.userAgentBrowser} value={b.sum.visits}
                  max={rumBrowsers[0]?.sum.visits ?? 1} color="bg-purple-500" />
              ))}
            </Section>
            <Section title="Devices (Real Visits)">
              {rumDevices.map((d, i) => (
                <Bar key={i} label={d.dimensions.deviceType} value={d.sum.visits}
                  max={rumDevices[0]?.sum.visits ?? 1} color="bg-orange-500" />
              ))}
            </Section>
            <Section title="Operating Systems (Real Visits)">
              {rumOS.map((o, i) => (
                <Bar key={i} label={o.dimensions.userAgentOS} value={o.sum.visits}
                  max={rumOS[0]?.sum.visits ?? 1} color="bg-cyan-500" />
              ))}
            </Section>
          </div>
        )}

        {/* ── HTTP: Status Codes + Browsers + Content Types ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Section title="HTTP Status Codes">
            {statuses.map(s => (
              <div key={s.key} className="flex items-center gap-3 mb-2.5 last:mb-0">
                <span className={`text-xs font-mono px-2 py-0.5 rounded-full font-semibold ring-1 ${statusBadge(Number(s.key))}`}>{s.key}</span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full">
                  {/* eslint-disable-next-line react/forbid-dom-props */}
                  <div className={`h-full ${statusBg(Number(s.key))} rounded-full`}
                    style={{ width: `${H.requests > 0 ? (s.value / H.requests) * 100 : 0}%` }} />
                </div>
                <span className="text-xs text-gray-700 w-14 text-right">{fmtNum(s.value)}</span>
              </div>
            ))}
          </Section>
          <Section title="Browsers (HTTP layer)">
            {browsers.slice(0, 10).map(b => (
              <Bar key={b.key} label={b.key || "Unknown"} value={b.value} max={browsers[0]?.value ?? 1} color="bg-violet-500" />
            ))}
          </Section>
          <Section title="Content Types">
            {content.slice(0, 10).map(c => (
              <Bar key={c.key} label={c.key || "other"} value={c.value} max={content[0]?.value ?? 1} color="bg-teal-500" />
            ))}
          </Section>
        </div>

        {/* ── Protocol / SSL / Devices / IP ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <Section title="HTTP Version">
            {httpVer.map(h => <Bar key={h.key} label={h.key} value={h.value} max={H.requests} note={pct(h.value, H.requests)} color="bg-indigo-500" />)}
          </Section>
          <Section title="TLS Protocols">
            {ssl.map(s => <Bar key={s.key} label={s.key || "None"} value={s.value} max={H.requests} note={pct(s.value, H.requests)} color="bg-green-500" />)}
          </Section>
          <Section title="Devices (HTTP today)">
            {topDevices.length === 0
              ? <p className="text-sm text-gray-400">No data today.</p>
              : topDevices.map((d, i) => (
                <Bar key={i} label={d.dimensions.clientDeviceType || "Unknown"}
                  value={d.count} max={topDevices[0]?.count ?? 1} color="bg-orange-500" />
              ))}
          </Section>
          <Section title="Traffic Source (IP Class)">
            {ipClass.map(c => <Bar key={c.key} label={c.key} value={c.value} max={H.requests} note={pct(c.value, H.requests)} color="bg-gray-500" />)}
          </Section>
        </div>

        {/* ── HTTP Top Paths (today) ── */}
        <Section title="Top Paths — HTTP (today)">
          {topPaths.length === 0
            ? <p className="text-sm text-gray-400">No data for today yet.</p>
            : (
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-600 font-semibold uppercase border-b border-gray-200">
                  <th className="text-left pb-2">Path</th><th className="text-right pb-2">Method</th><th className="text-right pb-2">Requests</th>
                </tr></thead>
                <tbody>
                  {topPaths.map((p, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-1.5 font-mono text-xs text-gray-900 truncate max-w-xl" title={p.dimensions.clientRequestPath}>{p.dimensions.clientRequestPath || "/"}</td>
                      <td className="py-1.5 text-right"><span className="text-xs bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded font-medium">{p.dimensions.clientRequestHTTPMethodName}</span></td>
                      <td className="py-1.5 text-right font-medium">{fmtNum(p.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </Section>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── Google Search Console ───────────────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <div className="border-t-2 border-gray-300 pt-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">G</span>
            </div>
            <h2 className="text-lg font-bold text-gray-900">Google Search Console</h2>
            {sc && <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{sc.startDate} → {sc.endDate} (28 days)</span>}
          </div>

          {!sc && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              Search Console env vars not set. Add <code className="bg-red-100 px-1 rounded">GOOGLE_SITE_URL</code> to .env
            </div>
          )}

          {sc && !sc.ok && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              <strong>Error:</strong> {sc.error}
            </div>
          )}

          {sc?.ok && (() => {
            const noData = (d: import("@/lib/search-console").SCTypeData) => d.totalClicks === 0 && d.totalImpressions === 0

            const PerfSection = ({ data, title, sub }: { data: import("@/lib/search-console").SCTypeData; title: string; sub: string }) => (
              <Section title={title} sub={sub}>
                {/* Overview row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: "Total Clicks",      main: fmtNum(data.totalClicks),      sub2: `${fmtNum(data.clicks7d)} last 7d` },
                    { label: "Total Impressions", main: fmtNum(data.totalImpressions), sub2: `${fmtNum(data.impressions7d)} last 7d` },
                    { label: "Avg CTR",           main: data.totalImpressions > 0 ? (data.avgCtr * 100).toFixed(2) + "%" : "—", sub2: "click-through rate" },
                    { label: "Avg Position",      main: data.avgPosition > 0 ? data.avgPosition.toFixed(1) : "—", sub2: data.avgPosition > 0 && data.avgPosition <= 10 ? "Top 10 ✓" : data.avgPosition > 0 ? `Position ${Math.round(data.avgPosition)}` : "no data", color: data.avgPosition > 0 && data.avgPosition <= 10 ? "text-green-600" : data.avgPosition > 0 ? "text-amber-600" : "text-gray-900" },
                  ].map(c => (
                    <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="text-xs text-gray-600 uppercase font-semibold tracking-wide mb-1">{c.label}</p>
                      <p className={`text-2xl font-semibold ${"color" in c ? c.color : "text-gray-900"}`}>{c.main}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{c.sub2}</p>
                    </div>
                  ))}
                </div>

                {/* Daily chart */}
                {data.byDate.length > 0 && (() => {
                  const maxC = Math.max(...data.byDate.map(r => r.clicks), 1)
                  const maxI = Math.max(...data.byDate.map(r => r.impressions), 1)
                  return (
                    <div className="mb-5">
                      <div className="flex items-end gap-1 mb-1" style={{ height: "56px" }}>
                        {data.byDate.map((r, i) => (
                          <div key={i} className="flex-1 flex flex-col justify-end gap-px"
                            title={`${r.keys[0]}: ${r.clicks} clicks, ${r.impressions} impressions`}>
                            {/* eslint-disable-next-line react/forbid-dom-props */}
                            <div className="w-full bg-purple-300 rounded-t-sm" style={{ height: `${(r.impressions / maxI) * 40}%` }} />
                            {/* eslint-disable-next-line react/forbid-dom-props */}
                            <div className="w-full bg-blue-600 rounded-t-sm" style={{ height: `${(r.clicks / maxC) * 60}%` }} />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-4 text-xs text-gray-600 mb-3">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-600 inline-block" /> Clicks</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-purple-300 inline-block" /> Impressions</span>
                        <span className="ml-auto">{data.byDate[0]?.keys[0]} → {data.byDate[data.byDate.length-1]?.keys[0]}</span>
                      </div>
                    </div>
                  )
                })()}

                {/* Queries + Pages side by side */}
                {(data.topQueries.length > 0 || data.topPages.length > 0) && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                    {data.topQueries.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Top Queries</p>
                        <table className="w-full text-sm">
                          <thead><tr className="text-xs text-gray-600 font-semibold border-b border-gray-200">
                            <th className="text-left pb-1.5">Query</th>
                            <th className="text-right pb-1.5">Clicks</th>
                            <th className="text-right pb-1.5">Impr.</th>
                            <th className="text-right pb-1.5">CTR</th>
                            <th className="text-right pb-1.5">Pos.</th>
                          </tr></thead>
                          <tbody>
                            {data.topQueries.map((r, i) => (
                              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                                <td className="py-1.5 text-gray-900 max-w-[180px] truncate font-medium" title={r.keys[0]}>{r.keys[0]}</td>
                                <td className="py-1.5 text-right font-semibold text-gray-900">{fmtNum(r.clicks)}</td>
                                <td className="py-1.5 text-right text-gray-700">{fmtNum(r.impressions)}</td>
                                <td className="py-1.5 text-right text-gray-700">{(r.ctr*100).toFixed(1)}%</td>
                                <td className="py-1.5 text-right font-semibold">
                                  <span className={r.position<=3?"text-green-700":r.position<=10?"text-green-600":r.position<=20?"text-amber-600":"text-gray-700"}>{r.position.toFixed(1)}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {data.topPages.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Top Pages</p>
                        <table className="w-full text-sm">
                          <thead><tr className="text-xs text-gray-600 font-semibold border-b border-gray-200">
                            <th className="text-left pb-1.5">Page</th>
                            <th className="text-right pb-1.5">Clicks</th>
                            <th className="text-right pb-1.5">Impr.</th>
                            <th className="text-right pb-1.5">CTR</th>
                            <th className="text-right pb-1.5">Pos.</th>
                          </tr></thead>
                          <tbody>
                            {data.topPages.map((r, i) => (
                              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                                <td className="py-1.5 font-mono text-xs text-gray-900 max-w-[180px] truncate" title={r.keys[0]}>{r.keys[0].replace(/^https?:\/\/[^/]+/,"") || "/"}</td>
                                <td className="py-1.5 text-right font-semibold text-gray-900">{fmtNum(r.clicks)}</td>
                                <td className="py-1.5 text-right text-gray-700">{fmtNum(r.impressions)}</td>
                                <td className="py-1.5 text-right text-gray-700">{(r.ctr*100).toFixed(1)}%</td>
                                <td className="py-1.5 text-right font-semibold">
                                  <span className={r.position<=3?"text-green-700":r.position<=10?"text-green-600":r.position<=20?"text-amber-600":"text-gray-700"}>{r.position.toFixed(1)}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Countries + Devices */}
                {(data.byCountry.length > 0 || data.byDevice.length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {data.byCountry.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Countries</p>
                        {data.byCountry.slice(0,10).map((r,i) => (
                          <Bar key={i} label={`${flag(r.keys[0])} ${r.keys[0]}`} value={r.clicks}
                            max={data.byCountry[0]?.clicks??1}
                            note={`${fmtNum(r.clicks)} clicks · pos ${r.position.toFixed(1)}`}
                            color="bg-blue-600" />
                        ))}
                      </div>
                    )}
                    {data.byDevice.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Devices</p>
                        <table className="w-full text-sm">
                          <thead><tr className="text-xs text-gray-600 font-semibold border-b border-gray-200">
                            <th className="text-left pb-1.5">Device</th>
                            <th className="text-right pb-1.5">Clicks</th>
                            <th className="text-right pb-1.5">Impr.</th>
                            <th className="text-right pb-1.5">CTR</th>
                            <th className="text-right pb-1.5">Pos.</th>
                          </tr></thead>
                          <tbody>
                            {data.byDevice.map((r,i) => (
                              <tr key={i} className="border-b border-gray-50">
                                <td className="py-1.5 font-semibold text-gray-900 capitalize">{r.keys[0].toLowerCase()}</td>
                                <td className="py-1.5 text-right font-semibold text-gray-900">{fmtNum(r.clicks)}</td>
                                <td className="py-1.5 text-right text-gray-700">{fmtNum(r.impressions)}</td>
                                <td className="py-1.5 text-right text-gray-700">{(r.ctr*100).toFixed(1)}%</td>
                                <td className="py-1.5 text-right font-semibold">
                                  <span className={r.position<=10?"text-green-600":r.position<=20?"text-amber-600":"text-gray-700"}>{r.position.toFixed(1)}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {noData(data) && (
                  <div className="text-center py-6 text-gray-500">
                    <p className="text-sm">No {title.toLowerCase()} data yet in this 28-day window.</p>
                    <p className="text-xs mt-1">Data appears once Google starts recording impressions for your pages.</p>
                  </div>
                )}
              </Section>
            )

            const verdictBadge = (v: string) => {
              if (v === "PASS")    return "text-green-800 bg-green-100 border border-green-300"
              if (v === "FAIL")    return "text-red-800 bg-red-100 border border-red-300"
              if (v === "NEUTRAL") return "text-amber-800 bg-amber-100 border border-amber-300"
              return "text-gray-700 bg-gray-100 border border-gray-200"
            }

            const indexed   = sc.pageInspections.filter(p => p.verdict === "PASS").length
            const notIndexed = sc.pageInspections.filter(p => p.verdict !== "PASS").length

            return (
              <div className="space-y-6">

                {/* ── Web Search Performance ── */}
                <PerfSection data={sc.web} title="Performance — Web Search" sub={`${sc.startDate} → ${sc.endDate} · 28 days`} />

                {/* ── Image / Video / News ── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <PerfSection data={sc.image} title="Image Search" sub="28 days" />
                  <PerfSection data={sc.video} title="Video Search" sub="28 days" />
                  <PerfSection data={sc.news}  title="Google News"  sub="28 days" />
                </div>

                {/* ── Core Web Vitals (field data from Search Console) ── */}
                <Section title="Core Web Vitals (Field Data)" sub="Based on real Chrome user data · Experience tab">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {["Mobile","Desktop"].map(device => (
                      <div key={device} className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-center">
                        <p className="text-sm font-semibold text-gray-800 mb-2">{device}</p>
                        <p className="text-xs text-gray-600">Not enough usage data in the last 90 days.</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Search Console needs ~100 real Chrome users visiting your site before it reports CWV field data.
                          Once you get consistent traffic, this will show LCP / FID / CLS scores.
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-600 mt-3">
                    Note: Lab data (Cloudflare RUM) is already shown above in the Cloudflare section.
                    The CWV here is Google&apos;s field data from the Chrome UX Report — different dataset, same metrics.
                  </p>
                </Section>

                {/* ── Sitemaps ── */}
                {sc.sitemaps.length > 0 && (
                  <Section title="Sitemaps" sub="Indexing → Sitemaps">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-600 font-semibold uppercase border-b border-gray-200">
                          <th className="text-left pb-2">Sitemap URL</th>
                          <th className="text-right pb-2">Submitted URLs</th>
                          <th className="text-right pb-2">Indexed</th>
                          <th className="text-right pb-2">Warnings</th>
                          <th className="text-right pb-2">Errors</th>
                          <th className="text-right pb-2">Last Downloaded</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sc.sitemaps.map((s, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-2 font-mono text-xs text-gray-900 max-w-xs truncate" title={s.path}>{s.path}</td>
                            <td className="py-2 text-right text-gray-800 font-medium">{s.submitted}</td>
                            <td className="py-2 text-right">
                              <span className={s.indexed > 0 ? "text-green-700 font-semibold" : "text-amber-700 font-semibold"}>{s.indexed}</span>
                            </td>
                            <td className="py-2 text-right">{s.warnings > 0 ? <span className="text-amber-700 font-semibold">{s.warnings}</span> : <span className="text-gray-700">0</span>}</td>
                            <td className="py-2 text-right">{s.errors > 0 ? <span className="text-red-700 font-semibold">{s.errors}</span> : <span className="text-gray-700">0</span>}</td>
                            <td className="py-2 text-right text-gray-800">{s.lastDownloaded ? s.lastDownloaded.slice(0,10) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Section>
                )}

                {/* ── Indexing / Pages ── */}
                {sc.pageInspections.length > 0 && (
                  <Section title="Indexing — Pages" sub="Indexing → Pages · live URL Inspection per sitemap entry">
                    {/* Summary badges */}
                    <div className="flex gap-3 mb-4">
                      <span className="text-sm font-semibold text-green-800 bg-green-100 border border-green-300 px-3 py-1 rounded-full">
                        {indexed} Indexed
                      </span>
                      {notIndexed > 0 && (
                        <span className="text-sm font-semibold text-amber-800 bg-amber-100 border border-amber-300 px-3 py-1 rounded-full">
                          {notIndexed} Not yet indexed
                        </span>
                      )}
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-600 font-semibold uppercase border-b border-gray-200">
                          <th className="text-left pb-2">Page URL</th>
                          <th className="text-center pb-2">Status</th>
                          <th className="text-left pb-2">Coverage State</th>
                          <th className="text-right pb-2">Last Crawled</th>
                          <th className="text-center pb-2">Crawled As</th>
                          <th className="text-center pb-2">Mobile</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sc.pageInspections.map((p, i) => {
                          const pagePath = p.url.replace(/^https?:\/\/[^/]+/, "") || "/"
                          const mob    = p.mobileVerdict === "PASS" ? "✓" : p.mobileVerdict === "FAIL" ? "✗" : "—"
                          const mobCls = p.mobileVerdict === "PASS" ? "text-green-700 font-bold" : p.mobileVerdict === "FAIL" ? "text-red-700 font-bold" : "text-gray-500"
                          return (
                            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="py-2 font-mono text-xs text-gray-900 max-w-[220px] truncate" title={p.url}>{pagePath}</td>
                              <td className="py-2 text-center">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${verdictBadge(p.verdict)}`}>
                                  {p.verdict === "PASS" ? "Indexed" : p.verdict === "FAIL" ? "Error" : "Not indexed"}
                                </span>
                              </td>
                              <td className="py-2 text-xs text-gray-800">{p.coverageState}</td>
                              <td className="py-2 text-right text-gray-800">{p.lastCrawlTime ? p.lastCrawlTime.slice(0,10) : <span className="text-gray-400">Never</span>}</td>
                              <td className="py-2 text-center text-xs text-gray-700 capitalize">{p.crawledAs?.toLowerCase() || "—"}</td>
                              <td className={`py-2 text-center text-sm ${mobCls}`}>{mob}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </Section>
                )}

              </div>
            )
          })()}
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── Bing Webmaster Tools ────────────────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}

        <div className="border-t-2 border-gray-300 pt-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-6 h-6 rounded-full bg-[#008373] flex items-center justify-center">
              <span className="text-white text-xs font-bold">B</span>
            </div>
            <h2 className="text-lg font-bold text-gray-900">Bing Webmaster Tools</h2>
            {bing && (
              <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                {bing.startDate} → {bing.endDate} · 90 days
              </span>
            )}
          </div>

          {!bing && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              Bing API key not set. Add <code className="bg-red-100 px-1 rounded">Bing_api</code> to .env
            </div>
          )}

          {bing && (() => {
            const totalClicks      = bing.queryStats.reduce((a, r) => a + r.clicks, 0)
            const totalImpressions = bing.queryStats.reduce((a, r) => a + r.impressions, 0)
            const avgPos           = bing.queryStats.length > 0
              ? bing.queryStats.reduce((a, r) => a + r.avgPosition, 0) / bing.queryStats.length
              : 0

            const crawledPages = bing.pageInfo.filter(p => p.lastCrawled).length
            const largeSizeThreshold = 500 * 1024 // 500 KB

            const sizeColor = (bytes: number) =>
              bytes >= 1_000_000 ? "text-red-700 font-semibold" :
              bytes >= largeSizeThreshold ? "text-amber-700 font-semibold" : "text-gray-800"

            return (
              <div className="space-y-6">

                {/* ── Overview stats ── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard label="Bing Clicks (90d)"      value={fmtNum(totalClicks)}
                    sub={totalClicks === 0 ? "No Bing traffic yet" : undefined} />
                  <StatCard label="Bing Impressions (90d)" value={fmtNum(totalImpressions)}
                    sub={totalImpressions === 0 ? "No impressions yet" : undefined} />
                  <StatCard label="Avg Position (Bing)"    value={avgPos > 0 ? avgPos.toFixed(1) : "—"}
                    sub="When Bing shows your site" />
                  <StatCard label="Pages Crawled by Bing"  value={`${crawledPages} / ${bing.pageInfo.length}`}
                    sub="From sitemap" color={crawledPages === bing.pageInfo.length ? "text-green-700" : "text-amber-700"} />
                </div>

                {/* ── Crawl status per page ── */}
                {bing.pageInfo.length > 0 && (
                  <Section title="Bing Crawl Status" sub="Per-page — discovery date, last crawl, document size, inbound anchor links">
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                      Pages highlighted in red are very large (&gt;1 MB) and may be slow to crawl. Amber pages are &gt;500 KB.
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-600 font-semibold uppercase border-b border-gray-200">
                          <th className="text-left pb-2">Page</th>
                          <th className="text-right pb-2">Discovered</th>
                          <th className="text-right pb-2">Last Crawled</th>
                          <th className="text-right pb-2">Doc Size</th>
                          <th className="text-right pb-2">Inbound Links</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bing.pageInfo.map((p, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-2 font-mono text-xs text-gray-900 max-w-[240px] truncate" title={p.url}>{p.path}</td>
                            <td className="py-2 text-right text-gray-700">{p.discoveryDate || <span className="text-gray-400">—</span>}</td>
                            <td className="py-2 text-right">
                              {p.lastCrawled
                                ? <span className="text-gray-800">{p.lastCrawled}</span>
                                : <span className="text-amber-600 font-medium">Not yet</span>}
                            </td>
                            <td className={`py-2 text-right ${sizeColor(p.documentSizeBytes)}`}>
                              {p.documentSizeBytes > 0 ? fmtBytes(p.documentSizeBytes) : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="py-2 text-right">
                              {p.anchorCount > 0
                                ? <span className="text-blue-700 font-semibold">{p.anchorCount}</span>
                                : <span className="text-gray-400">0</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Section>
                )}

                {/* ── Traffic / Queries (when data exists) ── */}
                {bing.queryStats.length > 0 ? (
                  <Section title="Bing Search Traffic" sub="Clicks, impressions and position over 90 days">
                    <div className="mb-4">
                      {(() => {
                        const maxC = Math.max(...bing.queryStats.map(r => r.clicks), 1)
                        const maxI = Math.max(...bing.queryStats.map(r => r.impressions), 1)
                        return (
                          <>
                            {/* eslint-disable-next-line react/forbid-dom-props */}
                            <div className="flex items-end gap-0.5 mb-1" style={{ height: "56px" }}>
                              {bing.queryStats.map((r, i) => (
                                <div key={i} className="flex-1 flex flex-col justify-end gap-px"
                                  title={`${r.date}: ${r.clicks} clicks, ${r.impressions} impressions`}>
                                  {/* eslint-disable-next-line react/forbid-dom-props */}
                                  <div className="w-full bg-[#008373]/40 rounded-t-sm" style={{ height: `${(r.impressions / maxI) * 40}%` }} />
                                  {/* eslint-disable-next-line react/forbid-dom-props */}
                                  <div className="w-full bg-[#008373] rounded-t-sm" style={{ height: `${(r.clicks / maxC) * 60}%` }} />
                                </div>
                              ))}
                            </div>
                            <div className="flex gap-4 text-xs text-gray-600 mb-3">
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#008373] inline-block" /> Clicks</span>
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#008373]/40 inline-block" /> Impressions</span>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-600 font-semibold uppercase border-b border-gray-200">
                          <th className="text-left pb-2">Date</th>
                          <th className="text-right pb-2">Clicks</th>
                          <th className="text-right pb-2">Impressions</th>
                          <th className="text-right pb-2">Avg Position</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bing.queryStats.map((r, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-1.5 text-gray-800">{r.date}</td>
                            <td className="py-1.5 text-right font-semibold text-gray-900">{fmtNum(r.clicks)}</td>
                            <td className="py-1.5 text-right text-gray-700">{fmtNum(r.impressions)}</td>
                            <td className="py-1.5 text-right">
                              <span className={r.avgPosition > 0 && r.avgPosition <= 10 ? "text-green-700 font-semibold" : r.avgPosition > 0 && r.avgPosition <= 20 ? "text-amber-700" : "text-gray-700"}>
                                {r.avgPosition > 0 ? r.avgPosition.toFixed(1) : "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Section>
                ) : (
                  <Section title="Bing Search Traffic" sub="90 days">
                    <div className="text-center py-6 text-gray-500">
                      <p className="text-sm font-medium text-gray-700 mb-1">No Bing organic search traffic yet</p>
                      <p className="text-xs text-gray-600">
                        Bing has low market share in India (&lt;1%). Your pages are being crawled (see above),
                        but Bing has not sent any organic visits. Data will appear here once Bing users click your results.
                      </p>
                    </div>
                  </Section>
                )}

                {/* ── Crawl Issues + Blocked URLs ── */}
                {(bing.crawlIssues.length > 0 || bing.blockedUrls.length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {bing.crawlIssues.length > 0 && (
                      <Section title="Crawl Issues">
                        <pre className="text-xs text-gray-800 overflow-auto max-h-40">
                          {JSON.stringify(bing.crawlIssues, null, 2)}
                        </pre>
                      </Section>
                    )}
                    {bing.blockedUrls.length > 0 && (
                      <Section title="Blocked URLs">
                        {bing.blockedUrls.map((u, i) => (
                          <p key={i} className="text-xs font-mono text-gray-800 py-0.5 border-b border-gray-100 last:border-0">{u}</p>
                        ))}
                      </Section>
                    )}
                  </div>
                )}

              </div>
            )
          })()}
        </div>

        <p className="text-xs text-gray-700 text-center pb-4">
          * CDN unique visits are estimated per day and not deduplicated across days. Use RUM visits for accurate user counts.
          Search Console data updates daily. Page indexing is live via URL Inspection API.
          Bing crawl data is live via Bing Webmaster Tools API.
        </p>
      </div>
    </div>
  )
}
