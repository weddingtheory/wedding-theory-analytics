const BASE = "https://ssl.bing.com/webmaster/api.svc/json"

async function get(token: string, path: string): Promise<unknown> {
  const sep = path.includes("?") ? "&" : "?"
  const r = await fetch(`${BASE}${path}${sep}apikey=${token}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  })
  return r.ok ? r.json() : null
}

function fmtDate(d: Date) { return d.toISOString().split("T")[0] }

function parseWcfDate(s: string | undefined): string {
  if (!s) return ""
  const m = s.match(/Date\((\d+)/)
  return m ? new Date(parseInt(m[1])).toISOString().split("T")[0] : ""
}

async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  try {
    const r = await fetch(sitemapUrl, { next: { revalidate: 3600 } })
    if (!r.ok) return []
    const xml = await r.text()
    return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].trim())
  } catch { return [] }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BingUrlInfo {
  url: string
  path: string
  lastCrawled: string
  discoveryDate: string
  documentSizeBytes: number
  anchorCount: number
  httpStatus: number
  isPage: boolean
}

export interface BingQueryRow {
  date: string
  impressions: number
  clicks: number
  avgPosition: number
}

export interface BingPageRow {
  date: string
  url: string
  impressions: number
  clicks: number
}

export interface BingRankRow {
  date: string
  avgImpressionPosition: number
  clicks: number
  impressions: number
}

export interface BingData {
  ok: boolean
  error?: string
  // per-page crawl info from Bing
  pageInfo: BingUrlInfo[]
  // traffic data (empty until Bing traffic exists)
  queryStats: BingQueryRow[]
  pageStats: BingPageRow[]
  rankStats: BingRankRow[]
  // issues
  crawlIssues: unknown[]
  blockedUrls: string[]
  // meta
  siteUrl: string
  startDate: string
  endDate: string
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function getBingData(): Promise<BingData | null> {
  const key = process.env.Bing_api?.replace(/['"]/g, "").trim()
  if (!key) return null

  const siteUrl = "https://weddingtheory.co.in/"
  const siteEnc = encodeURIComponent(siteUrl)

  const endDate   = new Date(); endDate.setDate(endDate.getDate() - 1)
  const startDate = new Date(endDate); startDate.setDate(endDate.getDate() - 90)
  const sd = fmtDate(startDate), ed = fmtDate(endDate)

  // Fetch sitemap to know which pages to inspect
  const urls = await fetchSitemapUrls("https://www.weddingtheory.co.in/sitemap.xml")

  // Inspect each URL via Bing's GetUrlInfo
  const pageInfo: BingUrlInfo[] = []
  for (const url of urls) {
    const r = await get(key, `/GetUrlInfo?siteUrl=${siteEnc}&url=${encodeURIComponent(url)}`) as { d?: Record<string, unknown> } | null
    const d = r?.d
    if (d) {
      pageInfo.push({
        url,
        path:              url.replace(/^https?:\/\/www\.weddingtheory\.co\.in/, "") || "/",
        lastCrawled:       parseWcfDate(d.LastCrawledDate as string),
        discoveryDate:     parseWcfDate(d.DiscoveryDate as string),
        documentSizeBytes: Number(d.DocumentSize ?? 0),
        anchorCount:       Number(d.AnchorCount  ?? 0),
        httpStatus:        Number(d.HttpStatus    ?? 0),
        isPage:            Boolean(d.IsPage),
      })
    }
    await new Promise(r => setTimeout(r, 100))
  }

  // Fetch all traffic/crawl data in parallel
  const [qsRaw, psRaw, rsRaw, ciRaw, buRaw] = await Promise.all([
    get(key, `/GetQueryStats?siteUrl=${siteEnc}&startDate=${sd}&endDate=${ed}`),
    get(key, `/GetPageStats?siteUrl=${siteEnc}&startDate=${sd}&endDate=${ed}`),
    get(key, `/GetRankAndTrafficStats?siteUrl=${siteEnc}&startDate=${sd}&endDate=${ed}`),
    get(key, `/GetCrawlIssues?siteUrl=${siteEnc}`),
    get(key, `/GetBlockedUrls?siteUrl=${siteEnc}`),
  ])

  type QRow = { Date?: string; Impressions?: number; Clicks?: number; AvgImpression?: number }
  type PRow = { Date?: string; Url?: string; Impressions?: number; Clicks?: number }
  type RRow = { Date?: string; AvgImpressionPosition?: number; Clicks?: number; Impressions?: number }

  const queryStats: BingQueryRow[] = ((qsRaw as { d?: QRow[] })?.d ?? []).map(r => ({
    date:         parseWcfDate(r.Date),
    impressions:  Number(r.Impressions ?? 0),
    clicks:       Number(r.Clicks ?? 0),
    avgPosition:  Number(r.AvgImpression ?? 0),
  }))

  const pageStats: BingPageRow[] = ((psRaw as { d?: PRow[] })?.d ?? []).map(r => ({
    date:        parseWcfDate(r.Date),
    url:         String(r.Url ?? ""),
    impressions: Number(r.Impressions ?? 0),
    clicks:      Number(r.Clicks ?? 0),
  }))

  const rankStats: BingRankRow[] = ((rsRaw as { d?: RRow[] })?.d ?? []).map(r => ({
    date:                  parseWcfDate(r.Date),
    avgImpressionPosition: Number(r.AvgImpressionPosition ?? 0),
    clicks:                Number(r.Clicks ?? 0),
    impressions:           Number(r.Impressions ?? 0),
  }))

  const crawlIssues: unknown[] = (ciRaw as { d?: unknown[] })?.d ?? []
  const blockedUrls: string[]  = (buRaw as { d?: string[] })?.d ?? []

  return {
    ok: true,
    pageInfo,
    queryStats,
    pageStats,
    rankStats,
    crawlIssues,
    blockedUrls,
    siteUrl,
    startDate: sd,
    endDate:   ed,
  }
}
