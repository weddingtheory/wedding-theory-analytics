import { unstable_cache } from "next/cache"

const GQL  = "https://api.cloudflare.com/client/v4/graphql"
const REST = "https://api.cloudflare.com/client/v4"

async function gql(token: string, query: string, revalidate = 300) {
  const r = await fetch(GQL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    next: { revalidate },
  })
  return r.json()
}

async function rest(token: string, path: string, revalidate = 3600) {
  const r = await fetch(`${REST}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate },
  })
  return r.json()
}

function fmtDate(d: Date) { return d.toISOString().split("T")[0] }

// ─── Zone → account + siteTag lookup ─────────────────────────────────────────
// Both are effectively static (a zone's account rarely changes; siteTag is tied
// to the RUM beacon install), so this is cached independent of `days` and with a
// long TTL — it used to re-run as two sequential round-trips inside every
// getCloudflareData() call, including once per prewarmed date range.

async function lookupZoneAccountAndSiteTag(zoneId: string, token: string) {
  const today    = fmtDate(new Date())
  const past91   = new Date(); past91.setDate(past91.getDate() - 91)
  const past91Str = fmtDate(past91)

  const zoneResp = await rest(token, `/zones/${zoneId}`)
  const accountId: string | undefined = zoneResp?.result?.account?.id

  let siteTag: string | undefined
  if (accountId) {
    const disc = await gql(token, `{
      viewer {
        accounts(filter: { accountTag: "${accountId}" }) {
          rumPageloadEventsAdaptiveGroups(
            limit: 1
            filter: { AND: [{ date_geq: "${past91Str}" }, { date_leq: "${today}" }] }
            orderBy: [count_DESC]
          ) { dimensions { siteTag } }
        }
      }
    }`, 86400)
    siteTag = disc?.data?.viewer?.accounts?.[0]
      ?.rumPageloadEventsAdaptiveGroups?.[0]?.dimensions?.siteTag
  }

  return { accountId, siteTag }
}

function cachedZoneAccountAndSiteTag(zoneId: string, token: string) {
  return unstable_cache(
    () => lookupZoneAccountAndSiteTag(zoneId, token),
    ["cf-zone-account-sitetag", zoneId],
    { revalidate: 86400 }
  )()
}

// ─── Types — HTTP analytics ───────────────────────────────────────────────────

export interface CountryEntry  { clientCountryName: string; requests: number; threats: number; bytes: number }
export interface StatusEntry   { edgeResponseStatus: number; requests: number }
export interface ContentEntry  { edgeResponseContentTypeName: string; requests: number; bytes: number }
export interface BrowserEntry  { uaBrowserFamily: string; pageViews: number }
export interface SSLEntry      { clientSSLProtocol: string; requests: number }
export interface HTTPVerEntry  { clientHTTPProtocol: string; requests: number }
export interface IPClassEntry  { ipType: string; requests: number }

export interface DayGroup {
  sum: {
    requests: number; pageViews: number; bytes: number
    cachedBytes: number; cachedRequests: number
    encryptedRequests: number; encryptedBytes: number; threats: number
    countryMap: CountryEntry[]
    responseStatusMap: StatusEntry[]
    contentTypeMap: ContentEntry[]
    browserMap: BrowserEntry[]
    clientSSLMap: SSLEntry[]
    clientHTTPVersionMap: HTTPVerEntry[]
    ipClassMap: IPClassEntry[]
  }
  uniq: { uniques: number }
  dimensions: { date: string }
}

export interface AdaptivePath   { count: number; dimensions: { clientRequestPath: string; clientRequestHTTPMethodName: string } }
export interface AdaptiveDevice { count: number; dimensions: { clientDeviceType: string } }

// ─── Types — RUM ─────────────────────────────────────────────────────────────

export interface RumDay {
  count: number
  sum: { visits: number }
  dimensions: { date: string }
}

export interface RumPerfDay {
  count: number
  quantiles: {
    pageLoadTimeP50: number; pageLoadTimeP75: number; pageLoadTimeP90: number
    firstContentfulPaintP50: number; firstContentfulPaintP75: number; firstContentfulPaintP90: number
    connectionTimeP50: number; dnsTimeP50: number
    requestTimeP50: number; responseTimeP50: number
  }
  dimensions: { date: string }
}

export interface RumVitalsDay {
  count: number
  quantiles: {
    largestContentfulPaintP50: number;   largestContentfulPaintP75: number;   largestContentfulPaintP90: number
    cumulativeLayoutShiftP50: number;    cumulativeLayoutShiftP75: number;    cumulativeLayoutShiftP90: number
    interactionToNextPaintP50: number;   interactionToNextPaintP75: number;   interactionToNextPaintP90: number
    timeToFirstByteP50: number;          timeToFirstByteP75: number;          timeToFirstByteP90: number
    firstContentfulPaintP50: number;     firstContentfulPaintP75: number;     firstContentfulPaintP90: number
    firstInputDelayP50: number;          firstInputDelayP75: number;          firstInputDelayP90: number
  }
  dimensions: { date: string }
}

export interface RumCountry { count: number; sum: { visits: number }; dimensions: { countryName: string } }
export interface RumBrowser { count: number; sum: { visits: number }; dimensions: { userAgentBrowser: string } }
export interface RumOS      { count: number; sum: { visits: number }; dimensions: { userAgentOS: string } }
export interface RumDevice  { count: number; sum: { visits: number }; dimensions: { deviceType: string } }
export interface RumPath    { count: number; sum: { visits: number }; dimensions: { requestPath: string } }
export interface RumReferer { count: number; sum: { visits: number }; dimensions: { refererHost: string } }

export interface CloudflareData {
  days:       DayGroup[]
  topPaths:   AdaptivePath[]
  topDevices: AdaptiveDevice[]
  rumDays:      RumDay[]
  rumPerfDays:  RumPerfDay[]
  rumVitalsDays: RumVitalsDay[]
  rumCountries: RumCountry[]
  rumBrowsers:  RumBrowser[]
  rumOS:        RumOS[]
  rumDevices:   RumDevice[]
  rumPaths:     RumPath[]
  rumReferers:  RumReferer[]
  errors:  unknown[]
  siteTag: string | undefined
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function getCloudflareData(days: number = 7): Promise<CloudflareData | null> {
  const zoneId = process.env.Zone_ID?.trim()
  const token  = process.env.Cloudflare_api?.trim()
  if (!zoneId || !token) return null

  const today   = fmtDate(new Date())
  // Fetch 2× the selected window so we have current period + previous period for WoW.
  // RUM API hard limit is ~91 days; cap the RUM lookback separately so large windows don't error.
  const totalDays    = days * 2
  const rumTotalDays = Math.min(totalDays, 91)
  const pastAll    = new Date(); pastAll.setDate(pastAll.getDate() - totalDays)
  const pastRumAll = new Date(); pastRumAll.setDate(pastRumAll.getDate() - rumTotalDays)
  const pastCurr   = new Date(); pastCurr.setDate(pastCurr.getDate() - days)
  const pastAllStr    = fmtDate(pastAll)
  const pastRumAllStr = fmtDate(pastRumAll)
  const pastCurrStr   = fmtDate(pastCurr)

  // ── Step 1: account ID + siteTag (cached separately, see above) ─────────
  const { accountId, siteTag } = await cachedZoneAccountAndSiteTag(zoneId, token)

  const errors: unknown[] = []

  // Two filters:
  // fAll  — full 2× window, for daily time-series (WoW split done in UI)
  // fCurr — current window only, for aggregate breakdowns (countries, browsers, etc.)
  const fAll  = `AND: [{ date_geq: "${pastAllStr}" }, { date_leq: "${today}" }]`
  const fCurr = `AND: [{ date_geq: "${pastCurrStr}" }, { date_leq: "${today}" }]`
  const fRumAll = siteTag
    ? `AND: [{ date_geq: "${pastRumAllStr}" }, { date_leq: "${today}" }, { siteTag: "${siteTag}" }]`
    : `AND: [{ date_geq: "${pastRumAllStr}" }, { date_leq: "${today}" }]`
  const fRumCurr = siteTag
    ? `AND: [{ date_geq: "${pastCurrStr}" }, { date_leq: "${today}" }, { siteTag: "${siteTag}" }]`
    : `AND: [{ date_geq: "${pastCurrStr}" }, { date_leq: "${today}" }]`

  // ── Query 1: HTTP daily (full 2× window for WoW calc) ─────────────────────
  const q1 = `{
    viewer {
      zones(filter: { zoneTag: "${zoneId}" }) {
        httpRequests1dGroups(
          limit: ${totalDays}
          filter: { ${fAll} }
          orderBy: [date_ASC]
        ) {
          sum {
            requests pageViews bytes cachedBytes cachedRequests
            encryptedRequests encryptedBytes threats
            countryMap { clientCountryName requests threats bytes }
            responseStatusMap { edgeResponseStatus requests }
            contentTypeMap { edgeResponseContentTypeName requests bytes }
            browserMap { uaBrowserFamily pageViews }
            clientSSLMap { clientSSLProtocol requests }
            clientHTTPVersionMap { clientHTTPProtocol requests }
            ipClassMap { ipType requests }
          }
          uniq { uniques }
          dimensions { date }
        }
      }
    }
  }`

  // ── Query 2: adaptive groups (today only — 1-day hard limit) ──────────────
  const q2 = `{
    viewer {
      zones(filter: { zoneTag: "${zoneId}" }) {
        topPaths: httpRequestsAdaptiveGroups(
          limit: 10
          filter: { date_geq: "${today}", date_leq: "${today}" }
          orderBy: [count_DESC]
        ) { count dimensions { clientRequestPath clientRequestHTTPMethodName } }
        topDevices: httpRequestsAdaptiveGroups(
          limit: 5
          filter: { date_geq: "${today}", date_leq: "${today}" }
          orderBy: [count_DESC]
        ) { count dimensions { clientDeviceType } }
      }
    }
  }`

  // ── Query 3: RUM ─────────────────────────────────────────────────────────
  const rumQ = accountId ? `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        rumDaily: rumPageloadEventsAdaptiveGroups(
          limit: ${rumTotalDays} filter: { ${fRumAll} } orderBy: [date_ASC]
        ) { count sum { visits } dimensions { date } }

        rumCountries: rumPageloadEventsAdaptiveGroups(
          limit: 20 filter: { ${fRumCurr} } orderBy: [count_DESC]
        ) { count sum { visits } dimensions { countryName } }

        rumBrowsers: rumPageloadEventsAdaptiveGroups(
          limit: 10 filter: { ${fRumCurr} } orderBy: [count_DESC]
        ) { count sum { visits } dimensions { userAgentBrowser } }

        rumOS: rumPageloadEventsAdaptiveGroups(
          limit: 8 filter: { ${fRumCurr} } orderBy: [count_DESC]
        ) { count sum { visits } dimensions { userAgentOS } }

        rumDevices: rumPageloadEventsAdaptiveGroups(
          limit: 5 filter: { ${fRumCurr} } orderBy: [count_DESC]
        ) { count sum { visits } dimensions { deviceType } }

        rumPaths: rumPageloadEventsAdaptiveGroups(
          limit: 10 filter: { ${fRumCurr} } orderBy: [count_DESC]
        ) { count sum { visits } dimensions { requestPath } }

        rumReferers: rumPageloadEventsAdaptiveGroups(
          limit: 10 filter: { ${fRumCurr} } orderBy: [count_DESC]
        ) { count sum { visits } dimensions { refererHost } }

        rumPerf: rumPerformanceEventsAdaptiveGroups(
          limit: ${days} filter: { ${fRumCurr} } orderBy: [date_ASC]
        ) {
          count
          quantiles {
            pageLoadTimeP50 pageLoadTimeP75 pageLoadTimeP90
            firstContentfulPaintP50 firstContentfulPaintP75 firstContentfulPaintP90
            connectionTimeP50 dnsTimeP50 requestTimeP50 responseTimeP50
          }
          dimensions { date }
        }

        rumVitals: rumWebVitalsEventsAdaptiveGroups(
          limit: ${days} filter: { ${fRumCurr} } orderBy: [date_ASC]
        ) {
          count
          quantiles {
            largestContentfulPaintP50   largestContentfulPaintP75   largestContentfulPaintP90
            cumulativeLayoutShiftP50    cumulativeLayoutShiftP75    cumulativeLayoutShiftP90
            interactionToNextPaintP50   interactionToNextPaintP75   interactionToNextPaintP90
            timeToFirstByteP50          timeToFirstByteP75          timeToFirstByteP90
            firstContentfulPaintP50     firstContentfulPaintP75     firstContentfulPaintP90
            firstInputDelayP50          firstInputDelayP75          firstInputDelayP90
          }
          dimensions { date }
        }
      }
    }
  }` : null

  const [j1, j2, j3] = await Promise.all([
    gql(token, q1),
    gql(token, q2),
    rumQ ? gql(token, rumQ) : Promise.resolve(null),
  ])

  if (j1?.errors) errors.push(...(Array.isArray(j1.errors) ? j1.errors : [j1.errors]))
  if (j2?.errors) errors.push(...(Array.isArray(j2.errors) ? j2.errors : [j2.errors]))
  if (j3?.errors) errors.push(...(Array.isArray(j3.errors) ? j3.errors : [j3.errors]))

  const z  = j1?.data?.viewer?.zones?.[0] ?? {}
  const z2 = j2?.data?.viewer?.zones?.[0] ?? {}
  const acc = j3?.data?.viewer?.accounts?.[0] ?? {}

  return {
    days:       z.httpRequests1dGroups  ?? [],
    topPaths:   z2.topPaths             ?? [],
    topDevices: z2.topDevices           ?? [],
    rumDays:      acc.rumDaily     ?? [],
    rumPerfDays:  acc.rumPerf      ?? [],
    rumVitalsDays: acc.rumVitals   ?? [],
    rumCountries: acc.rumCountries ?? [],
    rumBrowsers:  acc.rumBrowsers  ?? [],
    rumOS:        acc.rumOS        ?? [],
    rumDevices:   acc.rumDevices   ?? [],
    rumPaths:     acc.rumPaths     ?? [],
    rumReferers:  acc.rumReferers  ?? [],
    errors,
    siteTag,
  }
}
