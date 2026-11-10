import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/common";
import {
  exportReport,
  type ReportFormat,
  type ReportSection,
  type ReportScope,
} from "@/lib/reportExports";
import type { PortfolioState } from "@shared/portfolio";

export interface ReportScopeOption {
  value: ReportScope;
  label: string;
}
export function ReportDownload({
  state,
  section,
  title,
  scopes = [{ value: "all", label: "All items" }],
  unavailable,
}: {
  state: PortfolioState;
  section: ReportSection | "combined";
  title?: string;
  scopes?: ReportScopeOption[];
  unavailable?: string;
}) {
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [scope, setScope] = useState<ReportScope>(scopes[0]?.value || "all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const disabled = Boolean(unavailable) || busy;
  function run() {
    if (unavailable) return;
    setBusy(true);
    setMessage("");
    try {
      exportReport(state, format, { section: section === "combined" ? undefined : section, scope, title });
      setMessage(`${format.toUpperCase()} download started.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the report.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="report-download" aria-label={`${title || section} download`}>
      <div className="report-download-controls">
        <select value={scope} onChange={e => setScope(e.target.value)} disabled={disabled} aria-label="Report scope">
          {scopes.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select value={format} onChange={e => setFormat(e.target.value as ReportFormat)} disabled={disabled} aria-label="Report format">
          <option value="pdf">PDF</option>
          <option value="xlsx">Excel</option>
        </select>
        <Button kind="outline" onClick={run} disabled={disabled}>
          <Download size={15} /> {busy ? "Preparing…" : "Download Report"}
        </Button>
      </div>
      {unavailable ? <small className="note">{unavailable}</small> : message ? <small className="success-box" role="status">{message}</small> : null}
    </div>
  );
}
