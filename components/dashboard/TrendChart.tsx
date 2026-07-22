"use client";
import { useState } from "react";

interface TrendPoint {
  week: string;
  created: number;
  resolved: number;
}

const SERIES = [
  { key: "created" as const, label: "Created", color: "var(--accent)" },
  { key: "resolved" as const, label: "Resolved", color: "var(--good)" },
];

const W = 760;
const H = 160;
const PAD = { l: 34, r: 14, t: 12, b: 24 };
const plotW = W - PAD.l - PAD.r;
const plotH = H - PAD.t - PAD.b;

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;

  // No dated tickets yet (e.g. a fresh instance) — nothing to plot. Guard here
  // so the endpoint/marker lookups below never index an empty array.
  if (n === 0) {
    return (
      <div
        className="chart"
        style={{ display: "grid", placeItems: "center", minHeight: 200, color: "var(--muted)" }}
      >
        No trend data yet.
      </div>
    );
  }

  const maxV = Math.max(4, ...data.map((d) => Math.max(d.created, d.resolved)));
  const yMax = Math.ceil(maxV / 2) * 2;

  const x = (i: number) => PAD.l + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = (v: number) => PAD.t + plotH * (1 - v / yMax);

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const linePath = (key: "created" | "resolved") =>
    data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join(" ");
  const areaPath = (key: "created" | "resolved") => {
    const top = data
      .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`)
      .join(" ");
    return `${top} L ${x(n - 1).toFixed(1)} ${(PAD.t + plotH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD.t + plotH).toFixed(1)} Z`;
  };

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));
    setHover(idx);
  };

  const showLabel = (i: number) => n <= 8 || i % 2 === 0 || i === n - 1;

  const hoverPt = hover != null ? data[hover] : null;
  const tooltipLeft = hover != null ? (x(hover) / W) * 100 : 0;
  const tooltipTop =
    hover != null ? (Math.min(y(data[hover].created), y(data[hover].resolved)) / H) * 100 : 0;

  return (
    <div className="chart" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tickets created versus resolved per week">
        <defs>
          <linearGradient id="fillCreated" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="fillResolved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--good)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--good)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* gridlines + y labels */}
        {ticks.map((t, i) => {
          const yy = PAD.t + plotH * t;
          const val = Math.round(yMax * (1 - t));
          return (
            <g key={i}>
              <line
                className={t === 1 ? "base-line" : "grid-line"}
                x1={PAD.l}
                y1={yy}
                x2={W - PAD.r}
                y2={yy}
              />
              <text className="y-label" x={PAD.l - 8} y={yy + 3} textAnchor="end">
                {val}
              </text>
            </g>
          );
        })}

        {/* x labels */}
        {data.map((d, i) =>
          showLabel(i) ? (
            <text key={d.week} className="axis-label" x={x(i)} y={H - 8} textAnchor="middle">
              {d.week}
            </text>
          ) : null,
        )}

        {/* areas + lines */}
        <path d={areaPath("created")} fill="url(#fillCreated)" />
        <path d={areaPath("resolved")} fill="url(#fillResolved)" />
        <path
          d={linePath("created")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={linePath("resolved")}
          fill="none"
          stroke="var(--good)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* hover guide + markers */}
        {hover != null && (
          <>
            <line className="guide" x1={x(hover)} y1={PAD.t} x2={x(hover)} y2={PAD.t + plotH} />
            {SERIES.map((s) => (
              <circle
                key={s.key}
                cx={x(hover)}
                cy={y(data[hover][s.key])}
                r={4.5}
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth={2}
              />
            ))}
          </>
        )}

        {/* endpoint emphasis */}
        {SERIES.map((s) => (
          <circle
            key={s.key}
            cx={x(n - 1)}
            cy={y(data[n - 1][s.key])}
            r={3.5}
            fill={s.color}
            stroke="var(--surface)"
            strokeWidth={2}
          />
        ))}
      </svg>

      {hoverPt && (
        <div className="chart-tooltip" style={{ left: `${tooltipLeft}%`, top: `${tooltipTop}%` }}>
          <div className="tt-wk">{hoverPt.week}</div>
          {SERIES.map((s) => (
            <div className="tt-row" key={s.key}>
              <span className="sw" style={{ background: s.color }} />
              {s.label}
              <b>{hoverPt[s.key]}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
