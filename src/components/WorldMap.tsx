"use client"

import { useState, useCallback } from "react"
import { ComposableMap, Geographies, Geography } from "react-simple-maps"

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

const NUMERIC_TO_A2: Record<string, string> = {
  "4": "AF", "8": "AL", "12": "DZ", "24": "AO", "32": "AR", "36": "AU",
  "40": "AT", "50": "BD", "56": "BE", "76": "BR", "100": "BG", "116": "KH",
  "120": "CM", "124": "CA", "144": "LK", "152": "CL", "156": "CN", "170": "CO",
  "180": "CD", "191": "HR", "203": "CZ", "208": "DK", "231": "ET", "246": "FI",
  "250": "FR", "276": "DE", "288": "GH", "300": "GR", "320": "GT", "356": "IN",
  "360": "ID", "364": "IR", "368": "IQ", "372": "IE", "376": "IL", "380": "IT",
  "392": "JP", "400": "JO", "404": "KE", "410": "KR", "414": "KW", "428": "LV",
  "440": "LT", "458": "MY", "484": "MX", "504": "MA", "512": "OM", "524": "NP",
  "528": "NL", "554": "NZ", "566": "NG", "578": "NO", "586": "PK", "604": "PE",
  "608": "PH", "616": "PL", "620": "PT", "630": "PR", "634": "QA", "642": "RO",
  "643": "RU", "682": "SA", "702": "SG", "703": "SK", "705": "SI", "710": "ZA",
  "716": "ZW", "724": "ES", "752": "SE", "756": "CH", "764": "TH", "788": "TN",
  "792": "TR", "804": "UA", "784": "AE", "826": "GB", "840": "US", "858": "UY",
  "862": "VE", "704": "VN", "887": "YE", "48": "BH", "233": "EE", "470": "MT",
}

export interface CountryMapData {
  code: string
  visits: number
  pct: number
}

interface TooltipState {
  name: string
  code: string
  pct: number
  visits: number
  x: number
  y: number
}

export function WorldMap({ countries, accentColor = "#818cf8" }: { countries: CountryMapData[]; accentColor?: string }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const countryMap = new Map(countries.map((c) => [c.code, c]))
  const maxPct = Math.max(...countries.map((c) => c.pct), 0.01)

  // Parse accent color into RGB for intensity blending
  const getColor = useCallback(
    (pct: number) => {
      const intensity = Math.pow(pct / maxPct, 0.5)
      return accentColor + Math.round(40 + intensity * 215).toString(16).padStart(2, "0")
    },
    [maxPct, accentColor]
  )

  return (
    <div className="relative w-full h-full">
      <ComposableMap
        projection="geoNaturalEarth1"
        projectionConfig={{ scale: 145, center: [10, 10] }}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const a2 = NUMERIC_TO_A2[String(geo.id)]
              const data = a2 ? countryMap.get(a2) : undefined
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={data ? getColor(data.pct) : "#1a1a1a"}
                  stroke="#0a0a0a"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: "none" },
                    hover: {
                      fill: data ? accentColor : "#222",
                      outline: "none",
                      cursor: data ? "pointer" : "default",
                      transition: "fill 150ms ease",
                    },
                    pressed: { outline: "none" },
                  }}
                  onMouseMove={(evt: React.MouseEvent<SVGPathElement>) => {
                    if (!data || !a2) return
                    setTooltip({
                      name: (geo.properties as { name?: string })?.name ?? a2,
                      code: a2,
                      visits: data.visits,
                      pct: data.pct,
                      x: evt.clientX,
                      y: evt.clientY,
                    })
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              )
            })
          }
        </Geographies>
      </ComposableMap>

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: tooltip.x + 14, top: tooltip.y - 64 }}
        >
          <div
            className="rounded-xl px-4 py-3 shadow-2xl text-xs"
            style={{
              background: "rgba(15,16,41,0.95)",
              border: "1px solid rgba(99,102,241,0.3)",
              backdropFilter: "blur(12px)",
            }}
          >
            <p className="font-semibold text-white/90 mb-1.5">{tooltip.name}</p>
            <p className="font-bold text-lg leading-none mb-1" style={{ background: "linear-gradient(90deg,#818cf8,#c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {tooltip.pct.toFixed(1)}%
            </p>
            <p className="text-white/40">{tooltip.visits.toLocaleString()} visits</p>
          </div>
        </div>
      )}
    </div>
  )
}
