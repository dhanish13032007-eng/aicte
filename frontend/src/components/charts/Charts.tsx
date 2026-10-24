"use client";

/**
 * Chart wrappers (Recharts) with accessible text summaries.
 * Every chart renders the data passed in — no synthetic series are invented
 * here; callers fetch database-backed metrics from the API.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const NAVY = "#12345A";
const BLUE = "#1D4F91";
const SAFFRON = "#E87524";
const OK = "#16804A";
const WARN = "#B7791F";
const DANGER = "#C0392B";
const INFO = "#2870A8";
export const SERIES_COLORS = [NAVY, BLUE, SAFFRON, INFO, OK, WARN, DANGER, "#6B7FA8"];

function Summary({ summary }: { summary?: string }) {
  return (
    <p className="sr-only" aria-live="polite">
      {summary}
    </p>
  );
}

export function BarChartCard({
  data,
  dataKey,
  labelKey,
  height = 260,
  color = NAVY,
  summary,
  name,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  labelKey: string;
  height?: number;
  color?: string;
  summary?: string;
  name?: string;
}) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#DCE3EC" vertical={false} />
          <XAxis dataKey={labelKey} tick={{ fontSize: 11, fill: "#667085" }} interval={0} angle={-18} height={50} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#667085" }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderColor: "#DCE3EC", borderRadius: 6 }}
            labelStyle={{ color: "#172B4D" }}
          />
          <Bar dataKey={dataKey} name={name ?? dataKey} fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <Summary summary={summary ?? data.map((d) => `${d[labelKey]}: ${d[dataKey]}`).join("; ")} />
    </div>
  );
}

export function HorizontalBarChart({
  data,
  dataKey,
  labelKey,
  height = 280,
  color = BLUE,
  summary,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  labelKey: string;
  height?: number;
  color?: string;
  summary?: string;
}) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#DCE3EC" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#667085" }} />
          <YAxis type="category" dataKey={labelKey} width={140} tick={{ fontSize: 11, fill: "#667085" }} />
          <Tooltip contentStyle={{ fontSize: 12, borderColor: "#DCE3EC", borderRadius: 6 }} />
          <Bar dataKey={dataKey} fill={color} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <Summary summary={summary ?? data.map((d) => `${d[labelKey]}: ${d[dataKey]}`).join("; ")} />
    </div>
  );
}

export function PieChartCard({
  data,
  dataKey,
  labelKey,
  height = 260,
  summary,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  labelKey: string;
  height?: number;
  summary?: string;
}) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey={dataKey} nameKey={labelKey} innerRadius={52} outerRadius={88} paddingAngle={2}>
            {data.map((_, i) => (
              <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={{ fontSize: 12, borderColor: "#DCE3EC", borderRadius: 6 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
      <Summary summary={summary ?? data.map((d) => `${d[labelKey]}: ${d[dataKey]}`).join("; ")} />
    </div>
  );
}

export function TrendLineChart({
  data,
  xKey,
  yKey,
  height = 260,
  color = SAFFRON,
  summary,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  height?: number;
  color?: string;
  summary?: string;
}) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#DCE3EC" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#667085" }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#667085" }} />
          <Tooltip contentStyle={{ fontSize: 12, borderColor: "#DCE3EC", borderRadius: 6 }} />
          <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
      <Summary summary={summary ?? data.map((d) => `${d[xKey]}: ${d[yKey]}`).join("; ")} />
    </div>
  );
}
