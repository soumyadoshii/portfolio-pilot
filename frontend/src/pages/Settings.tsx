import { useApp } from "@/contexts/AppContext";
import { Download } from "lucide-react";
import React, { useState } from "react";
import { Button, Card, Title } from "@/components/common";
import { exportSettingsXlsx, workspaceJson, downloadBytes } from "@/lib/reportExports";

export function SettingsPage() {
  const { state, setState, user, api, logout } = useApp();
  const [msg, setMsg] = useState(""),
    [err, setErr] = useState(""),
    [sessions, setSessions] = useState<any[]>([]);
  async function sessionsLoad() {
    if (!user) return;
    try {
      const out = await api("/api/app/sessions");
      setSessions(Array.isArray(out.sessions) ? out.sessions : []);
    } catch (e) {
      setErr(String(e));
    }
  }
  function exportState() {
    downloadBytes(new TextEncoder().encode(workspaceJson(state)), "portfoliopilot-data.json", "application/json");
  }
  async function deleteAccount() {
    try {
      await api("/api/app/account", {
        method: "DELETE",
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      await logout();
      setMsg("Account deletion request completed.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete account.");
    }
  }
  return (
    <>
      <Title
        eyebrow="PREFERENCES & PRIVACY"
        title="Settings that stay in your hands."
        sub="Profile and preferences are editable. INR is the current supported currency."
      />
      {msg && <p className="success-box">{msg}</p>}
      {err && (
        <p className="error-box" role="alert">
          {err}
        </p>
      )}
      <Card>
        <span className="eyebrow">PROFILE</span>
        <h2>Your details</h2>
        <div className="form-grid">
          {[
            ["Name", "name"],
            ["Age", "age"],
            ["Employment", "employment"],
            ["Annual income (₹)", "annualIncome"],
            ["Monthly income (₹)", "monthlyIncome"],
            ["Monthly investment (₹)", "monthlyInvestment"],
            ["Existing assets (₹)", "existingAssets"],
          ].map(([label, key]) => (
            <label key={key}>
              {label}
              <input
                type={
                  key === "age" ||
                  key.includes("Income") ||
                  key.includes("investment") ||
                  key.includes("assets")
                    ? "number"
                    : "text"
                }
                value={(state.profile as any)[key] ?? ""}
                onChange={e => {
                  const value =
                    e.target.type === "number"
                      ? Number(e.target.value)
                      : e.target.value;
                  setState({
                    ...state,
                    profile: { ...state.profile, [key]: value },
                  });
                }}
              />
            </label>
          ))}
          <label>
            Experience
            <select
              value={state.profile.experience}
              onChange={e =>
                setState({
                  ...state,
                  profile: {
                    ...state.profile,
                    experience: e.target.value as any,
                  },
                })
              }
            >
              {[
                "",
                "New",
                "Some experience",
                "Experienced",
                "Professional",
              ].map(x => (
                <option key={x || "empty"} value={x}>
                  {x || "Choose…"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Portfolio Risk Profile
            <select
              value={state.profile.riskProfile || ""}
              onChange={e =>
                setState({
                  ...state,
                  profile: {
                    ...state.profile,
                    riskProfile: (e.target.value || null) as any,
                  },
                })
              }
            >
              <option value="">Not set</option>
              {["Conservative", "Moderately Conservative", "Moderate", "Growth", "Aggressive"].map(x => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label>
            Currency
            <input value="INR (₹)" disabled />
          </label>
        </div>
      </Card>
      <Card>
        <span className="eyebrow">PREFERENCES</span>
        <h2>Notifications and reports</h2>
        <div className="setting-list">
          {Object.entries(state.preferences.notificationTypes).map(
            ([key, v]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={v}
                  onChange={e =>
                    setState({
                      ...state,
                      preferences: {
                        ...state.preferences,
                        notificationTypes: {
                          ...state.preferences.notificationTypes,
                          [key]: e.target.checked,
                        },
                      },
                    })
                  }
                />
                {key[0].toUpperCase() + key.slice(1)} notifications
              </label>
            )
          )}
        </div>
        <label className="field-inline">
          Report frequency
          <select
            value={state.preferences.reportFrequency}
            onChange={e =>
              setState({
                ...state,
                preferences: {
                  ...state.preferences,
                  reportFrequency: e.target.value as any,
                },
              })
            }
          >
            {["Off", "Monthly", "Quarterly"].map(x => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <p className="note">
          Reports are generated in-app; no email delivery is implemented.
        </p>
      </Card>
      <Card>
        <span className="eyebrow">DATA & SECURITY</span>
        <h2>Export, sessions and account</h2>
        <div className="button-row">
          <Button kind="outline" onClick={exportState}>
            <Download size={16} /> Export workspace data
          </Button>
          <Button kind="outline" onClick={() => exportSettingsXlsx(state)}>
            <Download size={16} /> Export Settings to Excel
          </Button>
          {user && (
            <Button kind="outline" onClick={sessionsLoad}>
              View account sessions
            </Button>
          )}
        </div>
        {sessions.map(s => (
          <div key={s.id} className="session-row">
            <span>
              {s.userAgent || "Active session"}
              <small>
                {s.current ? "Current session" : "Other session"} ·{" "}
                {s.lastSeenAt}
              </small>
            </span>
            {!s.current && (
              <Button
                kind="text"
                onClick={async () => {
                  try {
                    await api(`/api/app/sessions/${s.id}`, {
                      method: "DELETE",
                    });
                    await sessionsLoad();
                  } catch (e) {
                    setErr(String(e));
                  }
                }}
              >
                Revoke
              </Button>
            )}
          </div>
        ))}
        {user && (
          <div className="danger-zone">
            <div>
              <b>Delete account and saved data</b>
              <p>
                This is permanent and cannot be undone. You will be asked to confirm
                in the browser.
              </p>
            </div>
            <Button
              kind="danger"
              onClick={() => {
                if (
                  confirm(
                    "Permanently delete your account and saved portfolio data? This cannot be undone."
                  )
                )
                  void deleteAccount();
              }}
            >
              Delete account
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
