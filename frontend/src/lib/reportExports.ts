import {
  ASSET_BUCKETS,
  type AssetBucket,
  type BacktestConfig,
  type Goal,
  type Holding,
  type PortfolioState,
  type StressResult,
} from "@shared/portfolio";
import {
  allocationReview,
  assetAllocation,
  assetBucketFor,
  goalProjection,
  holdingValue,
  portfolioTotal,
  scoreDiversification,
  weatherExposure,
} from "@shared/finance";
import {
  calculateReturnCorrelations,
  runHistoricalComparison,
  type BacktestResult,
} from "@shared/backtest";
import { SYNTHETIC_CORRELATIONS } from "@/data/demo";
import { formatPdfNumber, renderPdf, type PdfMeta } from "./pdfReport";

type Cell = string | number | boolean | Date | null | undefined;
export type ReportFormat = "pdf" | "xlsx";
export type ReportSection =
  | "overview"
  | "holdings"
  | "allocation"
  | "goals"
  | "diversification"
  | "stress"
  | "backtest"
  | "snapshots"
  | "coach";
export type ReportScope = "all" | string;
export interface ReportSheet {
  name: string;
  rows: Cell[][];
}
export interface ReportExportOptions {
  section?: ReportSection;
  scope?: ReportScope;
  title?: string;
  demo?: boolean;
}

const text = (value: unknown) =>
  value === null || value === undefined ? "" : String(value);
const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Prefix untrusted text so spreadsheet applications cannot execute formulas. */
export function spreadsheetText(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const valueText = text(value);
  return /^[=+\-@\t\r]/.test(valueText) ? `'${valueText}` : valueText;
}
export function safeFilename(value: string, fallback = "portfoliopilot-report") {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 100);
  return cleaned || fallback;
}

function display(value: Cell): string {
  if (value instanceof Date) return value.toISOString();
  return text(value);
}
function rowsFromObject(title: string, object: Record<string, unknown>): Cell[][] {
  return [[title, "Value"], ...Object.entries(object).map(([key, value]) => [key, value as Cell])];
}
function selected<T extends { id: string }>(items: T[], scope: ReportScope | undefined) {
  return scope && scope !== "all" ? items.filter(item => item.id === scope) : items;
}

function holdingsRows(state: PortfolioState, scope?: ReportScope): Cell[][] {
  const holdings = scope && ASSET_BUCKETS.includes(scope as AssetBucket)
    ? state.holdings.filter(holding => assetBucketFor(holding) === scope)
    : selected(state.holdings, scope), total = portfolioTotal(state.holdings);
  return [
    ["Symbol", "Name", "Asset type", "Bucket", "Sector", "Geography", "Units", "Average price (INR)", "Current price (INR)", "Current value (INR)", "Gain / loss (INR)", "Weight (%)"],
    ...holdings.map(h => [
      h.symbol, h.name, h.assetType, assetBucketFor(h), h.sector, h.geography,
      h.quantity, h.averagePrice, h.currentPrice, holdingValue(h),
      (h.currentPrice - h.averagePrice) * h.quantity,
      total ? (holdingValue(h) / total) * 100 : 0,
    ]),
  ];
}
function goalsRows(state: PortfolioState, scope?: ReportScope): Cell[][] {
  return [
    ["Goal", "Category", "Target date", "Target (INR)", "Saved (INR)", "Monthly contribution (INR)", "Expected return (%)", "Inflation (%)", "Projected corpus (INR)", "Required monthly contribution (INR)", "Progress (%)", "Status"],
    ...selected(state.goals, scope).map(g => {
      const p = goalProjection(g);
      return [g.name, g.category, g.targetDate, g.targetAmount, g.currentAmount, g.monthlyContribution, g.expectedReturnPct, g.inflationPct, p.projectedCorpus, p.requiredMonthlyContribution, p.progressPct, p.status];
    }),
  ];
}
function allocationRows(state: PortfolioState, scope?: ReportScope): Cell[][] {
  const rows = allocationReview(state.holdings, state.allocationTargets, state.tolerancesPct)
    .filter(row => scope === undefined || scope === "all" || row.bucket === scope);
  return [["Bucket", "Current (%)", "Target (%)", "Drift (pp)", "Tolerance (pp)", "Adjustment (INR)", "Review"], ...rows.map(r => [r.bucket, r.currentPct, r.targetPct, r.driftPct, state.tolerancesPct[r.bucket], r.adjustmentValue, r.outsideTolerance ? "Outside tolerance" : "Within range"])];
}
function diversificationRows(state: PortfolioState, demo = false): Cell[][] {
  const measured = calculateReturnCorrelations(state.historicalReturns), matrix = demo ? SYNTHETIC_CORRELATIONS : measured?.values;
  const score = scoreDiversification(state.holdings, matrix ?? undefined);
  return [
    ["Metric", "Value", "Notes"],
    ["Methodology score", score.total, "Narrative score; weighted methodology, not a correlation coefficient"],
    ["Coverage (%)", score.coveragePct, "Percent of score weight supported by available data"],
    ["Asset class", score.breakdown.assetClass, "Methodology component"],
    ["Sector", score.breakdown.sector, "Methodology component"],
    ["Security concentration", score.breakdown.securityConcentration, "Methodology component"],
    ["Correlation", score.breakdown.correlation, "Numeric correlation-derived component; may be unavailable"],
    ["Geography", score.breakdown.geography, "Methodology component"],
    ["Holding HHI", score.concentration.holdingHHI, "0–1 concentration measure"],
    ["Sector HHI", score.concentration.sectorHHI, "0–1 concentration measure"],
    ["Top three weight (%)", score.concentration.topThreeWeightPct, "Current value weighted"],
    [], ["Correlation matrix", "", measured ? `${measured.sourceName}; ${measured.minimumObservations} minimum observations` : demo ? "Synthetic demo correlations" : "Unavailable"],
    ["Bucket", ...ASSET_BUCKETS],
    ...ASSET_BUCKETS.map((bucket, i) => [bucket, ...(matrix?.[i] ?? ASSET_BUCKETS.map(() => null))]),
  ];
}
function stressRows(result: StressResult | null): Cell[][] {
  if (!result) return [["Status", "No saved stress scenario exists."]];
  return [
    ["Measure", "Value"], ["Scenario", result.scenarioName], ["Scenario ID", result.scenarioId], ["Saved at", result.createdAt],
    ["Before value (INR)", result.beforeValue], ["After value (INR)", result.afterValue], ["Change (INR)", result.changeValue], ["Loss (%)", result.lossPct], ["Recovery (months)", result.recoveryMonths],
    [], ["Scenario return assumptions"], ["Bucket", ...ASSET_BUCKETS], ["Assumed return (%)", ...ASSET_BUCKETS.map(b => result.assumptions[b])],
    [], ["Impact by holding"], ["Holding", "Symbol", "Before (INR)", "Change (INR)", "After (INR)"],
    ...result.holdingImpacts.map(x => [x.name, x.symbol, x.beforeValue, x.changeValue, x.afterValue]),
    [], ["Impact by goal"], ["Goal", "Before corpus (INR)", "After corpus (INR)", "Additional monthly contribution (INR)"],
    ...result.goalImpacts.map(x => [x.goalName, x.beforeCorpus, x.afterCorpus, x.additionalMonthlyContribution]),
    [], ["Interpretation", "Illustrative sensitivity, not a historical reconstruction or prediction."],
  ];
}
const BACKTEST_METRIC_LABELS = { totalReturn: "Total return (%)", cagr: "CAGR (%)", annualizedVolatility: "Annualized volatility (%)", sharpeRatio: "Sharpe ratio", maximumDrawdown: "Maximum drawdown (%)", recoveryPeriod: "Recovery period (months)" } as const;
function backtestRows(result: BacktestResult | null): ReportSheet[] {
  if (!result) return [{ name: "Backtest", rows: [["Status", "No saved backtest comparison exists."]] }];
  if (result.status !== "ready" || !result.baseline || !result.allWeather) return [{ name: "Backtest", rows: [["Status", result.message]] }];
  const metrics: Cell[][] = [["Metric", "Baseline", "All-Weather-inspired"], ...(["totalReturn", "cagr", "annualizedVolatility", "sharpeRatio", "maximumDrawdown", "recoveryPeriod"] as const).map(key => [BACKTEST_METRIC_LABELS[key], result.baseline!.metrics[key].value, result.allWeather!.metrics[key].value])];
  const periods: Cell[][] = [["Period", "Baseline total (%)", "All-Weather total (%)", "Baseline CAGR (%)", "All-Weather CAGR (%)"], ...result.baseline.periodReturns.map((p, i) => { const q = result.allWeather!.periodReturns[i]!; return [p.label, p.totalReturnPct, q.totalReturnPct, p.cagrPct, q.cagrPct]; })];
  const stress: Cell[][] = [["Window", "Baseline (%)", "All-Weather (%)", "Status"], ...result.baseline.stressPeriods.map((p, i) => { const q = result.allWeather!.stressPeriods[i]!; return [p.label, p.totalReturnPct, q.totalReturnPct, p.status]; })];
  const monthly: Cell[][] = [["Month", "Baseline return (%)", "All-Weather return (%)"], ...result.baseline.monthlyNetReturns.map((p, i) => [p.month, p.returnPct, result.allWeather!.monthlyNetReturns[i]?.returnPct ?? null])];
  return [{ name: "Backtest metrics", rows: metrics }, { name: "Period returns", rows: periods }, { name: "Stress periods", rows: stress }, { name: "Monthly series", rows: monthly }];
}
function coachRows(state: PortfolioState): Cell[][] {
  return [["Timestamp", "Source", "Question", "Answer"], ...state.coachMessages.map(m => [m.createdAt, m.source, m.question, m.answer])];
}
function overviewRows(state: PortfolioState, demo = false): Cell[][] {
  const total = portfolioTotal(state.holdings), alloc = assetAllocation(state.holdings), weather = weatherExposure(state.holdings);
  return [["Metric", "Value", "Notes"], ["Profile", state.profile.name, ""], ["Portfolio value (INR)", total, "Current holding values"], ["Holding count", state.holdings.length, ""], ["Goal count", state.goals.length, ""], ...ASSET_BUCKETS.map(b => [`Allocation: ${b} (%)`, total ? (alloc[b] / total) * 100 : 0, "Current value weighted"]), ...Object.entries(weather).map(([key, value]) => [`Weather exposure: ${key} (%)`, value, "Heuristic estimate"]), ["Data origin", state.dataOrigin, demo ? "Demo data" : "Workspace data"]];
}
function snapshotsRows(state: PortfolioState): Cell[][] { return [["Date", "Label", "Total value (INR)", "Source"], ...state.snapshots.map(s => [s.date, s.label, s.totalValue, s.source])]; }
function settingsSheets(state: PortfolioState): ReportSheet[] {
  const profile = rowsFromObject("Field", state.profile as unknown as Record<string, unknown>);
  const preferences = rowsFromObject("Field", { ...state.preferences, notificationTypes: JSON.stringify(state.preferences.notificationTypes) });
  const allocation = [["Bucket", "Target (%)", "Tolerance (pp)"], ...ASSET_BUCKETS.map(b => [b, state.allocationTargets[b], state.tolerancesPct[b]])];
  const backtest = state.backtestConfig ? rowsFromObject("Field", state.backtestConfig as unknown as Record<string, unknown>) : [["Status", "No backtest configuration saved"]];
  const stress = state.customScenario
    ? [["Field", "Value"], ["id", state.customScenario.id], ["name", state.customScenario.name], ["description", state.customScenario.description], ["recoveryMonths", state.customScenario.recoveryMonths], ["isCustom", state.customScenario.isCustom], ...ASSET_BUCKETS.map(bucket => [`return ${bucket} (%)`, state.customScenario!.returnsPct[bucket]])]
    : [["Status", "No custom stress scenario saved"]];
  return [{ name: "Profile", rows: profile }, { name: "Preferences", rows: preferences }, { name: "Allocation", rows: allocation }, { name: "Stress config", rows: stress }, { name: "Backtest config", rows: backtest }, { name: "Workspace", rows: [["Field", "Value"], ["schemaVersion", state.schemaVersion], ["dataOrigin", state.dataOrigin], ["createdAt", state.createdAt], ["updatedAt", state.updatedAt]] }];
}

export function buildReportSheets(state: PortfolioState, options: ReportExportOptions = {}): ReportSheet[] {
  const section = options.section;
  const common: Record<ReportSection, () => ReportSheet[]> = {
    overview: () => [{ name: "Overview", rows: overviewRows(state, options.demo) }],
    holdings: () => [{ name: "Holdings", rows: holdingsRows(state, options.scope) }, { name: "Diversification", rows: diversificationRows(state, options.demo) }],
    allocation: () => [{ name: "Allocation", rows: allocationRows(state, options.scope) }, { name: "Weather heuristic", rows: [["Regime", "Exposure (%)", "Interpretation"], ...Object.entries(weatherExposure(state.holdings)).map(([k, v]) => [k, v, "Heuristic estimate"]), [], ["Selected bucket holdings", "", ""], ...holdingsRows(state, options.scope)] }],
    goals: () => [{ name: "Goals", rows: goalsRows(state, options.scope) }],
    diversification: () => [{ name: "Diversification", rows: diversificationRows(state, options.demo) }],
    stress: () => [{ name: "Stress test", rows: stressRows(state.stressResult) }],
    backtest: () => backtestRows(runHistoricalComparison(state.historicalReturns, state.backtestConfig)),
    snapshots: () => [{ name: "Snapshots", rows: snapshotsRows(state) }],
    coach: () => [{ name: "Coach history", rows: coachRows(state) }],
  };
  if (section) return common[section]();
  return ["overview", "holdings", "allocation", "goals", "diversification", "stress", "backtest", "snapshots", "coach"].flatMap(key => common[key as ReportSection]());
}

function u16(value: number) { return new Uint8Array([value & 255, (value >>> 8) & 255]); }
function u32(value: number) { return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]); }
function concatBytes(parts: Uint8Array[]) { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let offset = 0; for (const p of parts) { out.set(p, offset); offset += p.length; } return out; }
function crc32(data: Uint8Array) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function zipStore(files: Array<[string, string]>): Uint8Array {
  const encoder = new TextEncoder(), local: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0;
  for (const [name, value] of files) { const nameBytes = encoder.encode(name), data = encoder.encode(value), crc = crc32(data); const head = concatBytes([new Uint8Array([80, 75, 3, 4]), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes]); local.push(concatBytes([head, data])); const c = concatBytes([new Uint8Array([80, 75, 1, 2]), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes]); central.push(c); offset += head.length + data.length; }
  const directory = concatBytes(central), body = concatBytes(local); const end = concatBytes([new Uint8Array([80, 75, 5, 6]), u16(0), u16(0), u16(files.length), u16(files.length), u32(directory.length), u32(body.length), u16(0)]); return concatBytes([body, directory, end]);
}
function xml(value: unknown) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function colName(index: number) { let out = ""; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out; return out; }
function sheetXml(rows: Cell[][]) { return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => { if (value === null || value === undefined || value === "") return `<c r="${colName(c)}${r + 1}"/>`; const numeric = typeof value === "number" && Number.isFinite(value); return numeric ? `<c r="${colName(c)}${r + 1}" t="n"><v>${value}</v></c>` : `<c r="${colName(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(spreadsheetText(value))}</t></is></c>`; }).join("")}</row>`).join("")}</sheetData></worksheet>`; }
export function workbookBytes(sheets: ReportSheet[]): Uint8Array { const safeSheets = sheets.length ? sheets : [{ name: "Report", rows: [["No data"]] }]; const files: Array<[string, string]> = [["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${safeSheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`], ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`], ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${safeSheets.map((sheet, i) => `<sheet name="${xml(sheet.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`], ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${safeSheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`]]; safeSheets.forEach((sheet, i) => files.push([`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet.rows)])); return zipStore(files); }

export function pdfBytes(sheets: ReportSheet[], title = "PortfolioPilot portfolio report", meta: PdfMeta = {}): Uint8Array {
  return renderPdf(sheets, title, meta);
}
const DATA_STATUS: Record<PortfolioState["dataOrigin"], string> = {
  demo: "Demo / synthetic data - not a real portfolio",
  import: "Imported data - not live market prices",
  manual: "User-entered data - not live market prices",
  account: "Account workspace data - not live market prices",
};
/** Read-only PDF header/footer metadata derived from saved state. */
export function pdfMeta(state: PortfolioState, options: ReportExportOptions = {}): PdfMeta {
  const dates = state.snapshots.map(s => s.date).filter(Boolean).sort();
  const total = portfolioTotal(state.holdings);
  const holdingsShown = !options.section || options.section === "holdings";
  return {
    dataStatus: DATA_STATUS[state.dataOrigin] ?? DATA_STATUS.account,
    period: dates.length ? `Snapshots ${dates[0]} to ${dates[dates.length - 1]}` : "No snapshots saved",
    notes: holdingsShown
      ? [
          "Values are user-entered, imported or synthetic; they are not live market prices.",
          "Gain / loss is (current price - average price) x quantity. It is unrealized and ignores tax and transaction costs.",
          `Weight is relative to the whole portfolio value (${formatPdfNumber(total, "INR")}).`,
        ]
      : [],
  };
}

export function downloadBytes(bytes: Uint8Array, filename: string, mime: string) { const blob = new Blob([bytes as unknown as BlobPart], { type: mime }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function exportReport(state: PortfolioState, format: ReportFormat, options: ReportExportOptions = {}) { const sheets = buildReportSheets(state, options), base = safeFilename(options.title || (options.section ? `${options.section}-report` : "portfoliopilot-report")); if (format === "xlsx") downloadBytes(workbookBytes(sheets), `${base}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); else downloadBytes(pdfBytes(sheets, options.title || "PortfolioPilot report", pdfMeta(state, options)), `${base}.pdf`, "application/pdf"); }
export function exportSettingsXlsx(state: PortfolioState) { downloadBytes(workbookBytes(settingsSheets(state)), "portfoliopilot-settings.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); }
export function workspaceJson(state: PortfolioState) { return JSON.stringify(state, null, 2); }
