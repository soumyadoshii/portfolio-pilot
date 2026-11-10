import { useApp } from "@/contexts/AppContext";
import { DEMO_PERSONAS } from "@/data/demo";
import { Activity, BarChart3, Bell, BriefcaseBusiness, Check, ChevronDown, CircleHelp, CloudSun, Home, LogOut, Menu, MessageCircle, Settings, ShieldCheck, Target, X } from "lucide-react";
import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { Disclaimer, Mark } from "@/components/common";

export const nav = [
  { to: "/dashboard", label: "Overview", icon: Home },
  { to: "/portfolio", label: "Portfolio", icon: BriefcaseBusiness },
  { to: "/backtest", label: "Backtest", icon: BarChart3 },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/stress-test", label: "Stress test", icon: Activity },
  { to: "/rebalance", label: "All-weather", icon: CloudSun },
  { to: "/ai-coach", label: "Coach", icon: MessageCircle },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/help", label: "Help", icon: CircleHelp },
];

export function Status() {
  const { status, error } = useApp();
  return status === "saving" ? (
    <span className="status">Saving…</span>
  ) : status === "saved" ? (
    <span className="status good">
      <Check size={14} /> Saved
    </span>
  ) : status === "error" ? (
    <span className="status bad" role="alert">
      Not saved: {error}
    </span>
  ) : null;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [loc, setLoc] = useLocation();
  const { state, user, demo, logout, enterDemo } = useApp();
  const usePersona = enterDemo;
  const [open, setOpen] = useState(false);
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="side-head">
          <Mark small />
          <button
            className="icon-btn mobile-close"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X />
          </button>
        </div>
        <div className="workspace">
          <div className="avatar">
            {(user?.name || state.profile.name || "G")
              .slice(0, 1)
              .toUpperCase()}
          </div>
          <div>
            <strong>
              {user?.name || state.profile.name || "Guest workspace"}
            </strong>
            <small>
              {demo
                ? "Demo portfolio"
                : user
                  ? "Saved account"
                  : "Local workspace"}
            </small>
          </div>
          <ChevronDown size={15} />
        </div>
        <nav aria-label="Main navigation">
          {nav.map(item => (
            <Link
              key={item.to}
              href={item.to}
              className={`nav-link ${loc === item.to || (item.to === "/goals" && loc.startsWith("/goals/")) ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.to === "/notifications" &&
                state.notifications.some(n => !n.read) && (
                  <i aria-label="Unread notification" />
                )}
            </Link>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="trust">
            <ShieldCheck size={16} />
            <span>
              No broker connection
              <br />
              No trades or transfers
            </span>
          </div>
          <button
            className="nav-link logout"
            onClick={() =>
              user ? void logout().then(() => setLoc("/")) : setLoc("/")
            }
          >
            <LogOut size={17} />
            {user ? "Sign out" : "Exit workspace"}
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <button
            className="icon-btn menu-btn"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </button>
          <div className="crumb">
            PortfolioPilot <span>/</span>{" "}
            <b>{nav.find(n => n.to === loc)?.label || "Workspace"}</b>
          </div>
          <div className="top-actions">
            <Status />
            {demo && (
              <>
                <select
                  className="persona-select"
                  aria-label="Choose demo persona"
                  value={state.profile.name}
                  onChange={e => {
                    const p = DEMO_PERSONAS.find(
                      x => x.name === e.target.value
                    );
                    if (p) usePersona(p.id);
                  }}
                >
                  {DEMO_PERSONAS.map(p => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className="demo-badge">
                  <i /> Demo Data
                </span>
              </>
            )}
            {user && <span className="account-badge">Saved account</span>}
          </div>
        </div>
        <div className="page-wrap">
          {children}
          <Disclaimer />
        </div>
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.slice(0, 5).map(item => (
          <Link
            key={item.to}
            href={item.to}
            aria-label={item.label}
            className={loc === item.to ? "active" : ""}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      {open && (
        <button
          className="scrim"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}
