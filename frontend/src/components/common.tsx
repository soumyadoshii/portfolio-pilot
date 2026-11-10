import { Layers } from "lucide-react";
import React from "react";
import { Cell, Tooltip as ChartTooltip, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Link } from "wouter";
import { DISCLAIMER } from "@/lib/format";

export function Disclaimer() {
  return <p className="disclaimer">{DISCLAIMER}</p>;
}

export function Mark({ small = false }: { small?: boolean }) {
  return (
    <a
      className={`brand ${small ? "brand-small" : ""}`}
      href="/"
      aria-label="PortfolioPilot home"
    >
      <img src="/portfolio-pilot.svg" alt="" />
      <span>
        Portfolio<span className="brand-light">Pilot</span>
      </span>
    </a>
  );
}

export function Button({
  children,
  onClick,
  href,
  kind = "primary",
  type = "button",
  disabled = false,
  className = "",
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  kind?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const c = `button ${kind} ${className}`.trim();
  return href ? (
    <Link href={href} className={c} style={style}>
      {children}
    </Link>
  ) : (
    <button type={type} className={c} onClick={onClick} disabled={disabled} style={style}>
      {children}
    </button>
  );
}

export function Card({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return <section className={`card ${className}`.trim()} style={style}>{children}</section>;
}

export function Title({
  eyebrow,
  title,
  sub,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
}) {
  return (
    <header className="page-title">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </header>
  );
}

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Layers />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function Kpi({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: any;
}) {
  return (
    <Card className="kpi">
      <div className="kpi-top">
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <b>{value}</b>
      <small>{detail}</small>
    </Card>
  );
}

export function Donut({ data }: { data: { name: string; value: number }[] }) {
  const colors = ["#55799a", "#78a6ac", "#b8a27b", "#91a5b7", "#d6dbd8"];
  if (!data.some(d => d.value))
    return (
      <Empty
        title="No allocation to show"
        body="Add holdings to see the mix across asset buckets."
      />
    );
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={230}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={58}
            outerRadius={86}
            paddingAngle={2}
            label={({ name, percent }: any) =>
              `${name} ${(percent * 100).toFixed(0)}%`
            }
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <ChartTooltip
            formatter={(v: any, n: any) => [`${Number(v).toFixed(1)}%`, n]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        {data.map((d, i) => (
          <span key={d.name}>
            <i style={{ background: colors[i % colors.length] }} />
            {d.name}: {d.value.toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  );
}
