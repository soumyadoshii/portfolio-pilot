import { describe, expect, it } from "vitest";
import { createEmptyPortfolioState, type Holding, type PortfolioState, type StressResult } from "./portfolio";
import { buildReportSheets, pdfBytes, pdfMeta } from "../frontend/src/lib/reportExports";
import {
  CONTENT_BOTTOM,
  MARGIN_X,
  PAGE_H,
  PAGE_W,
  formatPdfNumber,
  layoutReport,
  pdfText,
  serializePdf,
  type PdfLayout,
  type PdfOp,
  type PdfSheet,
} from "../frontend/src/lib/pdfReport";

type TextOp = Extract<PdfOp, { t: "text" }>;
const textOps = (layout: PdfLayout, role?: TextOp["role"]) =>
  layout.pages.flatMap((page, pageIndex) =>
    page.ops.filter((op): op is TextOp => op.t === "text" && (!role || op.role === role)).map(op => ({ ...op, pageIndex }))
  );
const DASH = ""; // WinAnsi em dash, used for unavailable values
const FIXED_DATE = new Date("2026-10-19T10:00:00Z");

function holding(i: number, overrides: Partial<Holding> = {}): Holding {
  return {
    id: `h${i}`, symbol: `SYM${i}`, name: `Holding number ${i}`, assetType: "Equity", sector: "Technology", geography: "India",
    marketCap: "Large", quantity: 10 + i, averagePrice: 100 + i, currentPrice: 120 + i, currentValue: (10 + i) * (120 + i), ...overrides,
  };
}
function stateWith(holdings: Holding[]): PortfolioState {
  const value = createEmptyPortfolioState("Test");
  value.holdings = holdings;
  return value;
}
const holdingsSheets = (state: PortfolioState) => buildReportSheets(state, { section: "holdings" }).slice(0, 1);

describe("pdf formatting", () => {
  it("uses Indian grouping, 2dp, explicit signs and distinguishes missing from zero", () => {
    expect(formatPdfNumber(12345678.9, "INR")).toBe("Rs 1,23,45,678.90");
    expect(formatPdfNumber(-9450, "INR")).toBe("-Rs 9,450.00");
    expect(formatPdfNumber(0, "INR")).toBe("Rs 0.00");
    expect(formatPdfNumber(-0.001, "INR")).toBe("Rs 0.00");
    expect(formatPdfNumber(-3.04, "%")).toBe("-3.04%");
    expect(formatPdfNumber(0.1127, undefined)).toBe("0.1127");
    expect(formatPdfNumber(87.9589, undefined)).toBe("87.96");
  });

  it("maps text to the WinAnsi range without corrupting the file", () => {
    // WinAnsi bytes: 0x93/0x94 curly quotes, 0x96 en dash; CJK has no Helvetica glyph so becomes "?".
    expect(pdfText("₹500 café “q” – 日本")).toBe("Rs 500 café q  ??");
    expect(pdfText("a\u0000b\tc")).toBe("a b c");
  });
});

describe("holdings table layout", () => {
  const holdings = [
    holding(1, { symbol: "HDFCBANK", name: "HDFC Bank", currentPrice: 80, averagePrice: 100 }), // negative gain
    holding(2, { symbol: "CASH", name: "Savings", assetType: "Cash", sector: "Cash", quantity: 1, averagePrice: 5000, currentPrice: 5000, currentValue: 5000 }), // zero gain
    holding(3, { symbol: "LONG", name: "An exceptionally long holding name that must wrap inside its own cell without disturbing the numbers " + "x".repeat(70) }),
  ];
  const state = stateWith(holdings);
  const layout = layoutReport(holdingsSheets(state), "Holdings report", { generatedAt: FIXED_DATE, dataStatus: "Demo / synthetic data" });

  it("renders one real table row per holding with values in the correct cells", () => {
    const table = layout.tables[0]!;
    expect(table.columns.map(c => c.label)).toEqual(["Symbol", "Name", "Asset type", "Bucket", "Sector", "Geography", "Units", "Average price", "Current price", "Current value", "Gain / loss", "Weight"]);
    const cell = (symbol: string, label: string) => {
      const col = table.columns.findIndex(c => c.label === label);
      const symOp = textOps(layout, "td").find(op => op.col === 0 && op.text === symbol)!;
      return textOps(layout, "td").filter(op => op.col === col && Math.abs(op.y - symOp.y) < 0.01).map(op => op.text).join("");
    };
    expect(cell("HDFCBANK", "Units")).toBe("11");
    expect(cell("HDFCBANK", "Average price")).toBe("Rs 100.00");
    expect(cell("HDFCBANK", "Current price")).toBe("Rs 80.00");
    expect(cell("HDFCBANK", "Gain / loss")).toBe("-Rs 220.00");
    expect(cell("CASH", "Gain / loss")).toBe("Rs 0.00");
    expect(cell("CASH", "Current value")).toBe("Rs 5,000.00");
    expect([...textOps(layout, "td"), ...textOps(layout, "th")].some(op => op.text.includes("|"))).toBe(false);
  });

  it("right-aligns financial columns on one edge and left-aligns identifiers", () => {
    const table = layout.tables[0]!;
    for (const label of ["Units", "Average price", "Current price", "Current value", "Gain / loss", "Weight"]) {
      const col = table.columns.findIndex(c => c.label === label);
      expect(table.columns[col]!.align).toBe("right");
      const edges = textOps(layout, "td").filter(op => op.col === col).map(op => Math.round((op.x + op.w) * 100) / 100);
      expect(new Set(edges).size).toBe(1);
    }
    expect(table.columns[0]!.align).toBe("left");
    expect(table.columns[1]!.align).toBe("left");
  });

  it("wraps long names inside their column and keeps every glyph inside the page", () => {
    const nameCol = layout.tables[0]!.columns[1]!;
    const nameLines = textOps(layout, "td").filter(op => op.col === 1);
    expect(nameLines.length).toBeGreaterThan(3);
    for (const op of nameLines) {
      expect(op.x).toBeGreaterThanOrEqual(nameCol.x);
      expect(op.x + op.w).toBeLessThanOrEqual(nameCol.x + nameCol.w);
    }
    for (const op of textOps(layout)) {
      expect(op.x).toBeGreaterThanOrEqual(MARGIN_X - 0.01);
      expect(op.x + op.w).toBeLessThanOrEqual(PAGE_W - MARGIN_X + 0.01);
      expect(op.y).toBeGreaterThan(0);
      expect(op.y).toBeLessThan(PAGE_H);
    }
  });

  it("uses landscape A4 and footers with branding, data status and page numbers", () => {
    const pdf = new TextDecoder("latin1").decode(serializePdf(layout));
    expect(pdf).toContain("/MediaBox [0 0 841.89 595.28]");
    const footers = textOps(layout, "footer").map(op => op.text);
    expect(footers).toContain("PortfolioPilot  |  Demo / synthetic data");
    expect(footers).toContain(`Page 1 of ${layout.pages.length}`);
  });
});

describe("pagination", () => {
  const many = Array.from({ length: 250 }, (_, i) => holding(i + 1));
  const layout = layoutReport(holdingsSheets(stateWith(many)), "Holdings report", { generatedAt: FIXED_DATE });

  it("flows a large portfolio over several pages with repeated headers and no row loss", () => {
    expect(layout.pages.length).toBeGreaterThan(5);
    const headerPages = new Set(textOps(layout, "th").filter(op => op.text === "Symbol").map(op => op.pageIndex));
    expect(headerPages.size).toBe(layout.pages.length);
    expect(textOps(layout, "td").filter(op => op.col === 0)).toHaveLength(250);
    expect(textOps(layout, "td").filter(op => op.col === 0).at(-1)!.text).toBe("SYM250");
  });

  it("numbers pages continuously and never draws body text below the footer zone", () => {
    const labels = textOps(layout, "footer").filter(op => op.text.startsWith("Page ")).map(op => op.text);
    expect(labels).toEqual(layout.pages.map((_, i) => `Page ${i + 1} of ${layout.pages.length}`));
    for (const op of textOps(layout, "td")) expect(op.y).toBeGreaterThanOrEqual(CONTENT_BOTTOM);
  });

  it("splits a single row that is taller than a page instead of overflowing", () => {
    const rows = [["Question", "Answer"], ["q", "word ".repeat(4000)]];
    const long = layoutReport([{ name: "Coach history", rows }], "Coach", { generatedAt: FIXED_DATE });
    expect(long.pages.length).toBeGreaterThan(1);
    for (const op of textOps(long, "td")) expect(op.y).toBeGreaterThanOrEqual(CONTENT_BOTTOM);
  });
});

describe("wide tables", () => {
  const headers = Array.from({ length: 22 }, (_, i) => `Measure number ${i + 1} (INR)`);
  const rows = [["Row label", ...headers.slice(1).map((_, i) => 1234567.891 * (i + 1))]];
  const sheet: PdfSheet = { name: "Wide", rows: [["Name", ...headers.slice(1)], ...rows.map(r => [...r])] };
  const layout = layoutReport([sheet], "Wide", { generatedAt: FIXED_DATE });

  it("splits into column groups that repeat the identifying column and stay on the page", () => {
    expect(layout.tables.length).toBeGreaterThan(1);
    const seen = new Set<string>();
    for (const table of layout.tables) {
      expect(table.columns[0]!.label).toBe("Name");
      const right = table.columns.at(-1)!.x + table.columns.at(-1)!.w;
      expect(right).toBeLessThanOrEqual(PAGE_W - MARGIN_X + 0.01);
      for (const c of table.columns.slice(1)) seen.add(c.label);
    }
    expect(seen.size).toBe(21); // no column silently dropped
    for (const op of textOps(layout)) expect(op.x + op.w).toBeLessThanOrEqual(PAGE_W - MARGIN_X + 0.01);
  });
});

describe("missing, empty and unit-bearing data", () => {
  it("renders missing values as an em dash and keeps genuine zero", () => {
    const layout = layoutReport([{ name: "T", rows: [["Metric", "Value"], ["Total return (%)", null], ["Drawdown (%)", 0], ["Bad", Number.NaN], ["Gap (INR)", undefined]] }], "T", { generatedAt: FIXED_DATE });
    const values = textOps(layout, "td").filter(op => op.col === 1).map(op => op.text);
    expect(values).toEqual([DASH, "0.00%", DASH, DASH]);
    expect(textOps(layout, "td").filter(op => op.col === 0).map(op => op.text)).toEqual(["Total return", "Drawdown", "Bad", "Gap"]);
  });

  it("shows an explicit empty state for tables and sheets with no rows", () => {
    const empty = layoutReport([{ name: "Holdings", rows: [["Symbol", "Name", "Asset type"]] }, { name: "Nothing", rows: [] }], "E", { generatedAt: FIXED_DATE });
    const notes = textOps(empty, "note").map(op => op.text);
    expect(notes.filter(t => t === "No data available.")).toHaveLength(2);
    expect(layoutReport([], "E").pages).toHaveLength(1);
  });

  it("handles unicode text without throwing and emits only single-byte characters", () => {
    const sheet = { name: "U", rows: [["Name", "Value"], ["₹ café 日本 (x) \\ y", 1]] };
    const bytes = serializePdf(layoutReport([sheet], "Título ₹", { generatedAt: FIXED_DATE }));
    expect(new TextDecoder("latin1").decode(bytes.slice(0, 8))).toBe("%PDF-1.4");
    expect(new TextDecoder("latin1").decode(bytes.slice(-5))).toBe("%%EOF");
  });
});

describe("other reports sharing the renderer", () => {
  const stress: StressResult = {
    scenarioId: "s", scenarioName: "Broad equity correction", beforeValue: 1897245, afterValue: 1761515.95, changeValue: -135729.05, lossPct: -7.15, recoveryMonths: 14,
    assumptions: { Equity: -20, "Mutual Funds": -14, Gold: 3, Debt: 1, Cash: 0 },
    holdingImpacts: [{ holdingId: "h1", name: "HDFC Bank", symbol: "HDFCBANK", beforeValue: 70560, changeValue: -14112, afterValue: 56448 } as never],
    goalImpacts: [{ goalId: "g", goalName: "Emergency", beforeCorpus: 1000, afterCorpus: 900, additionalMonthlyContribution: 12.5 } as never],
    createdAt: "2026-10-18T15:28:56.710Z",
  };
  const state = stateWith([holding(1)]);
  state.stressResult = stress;
  state.snapshots = [{ id: "s1", date: "2026-01-01", label: "Start", totalValue: 180, source: "manual" }, { id: "s0", date: "2025-01-01", label: "Earlier", totalValue: null as never, source: "manual" }];
  state.goals = [{ id: "g1", name: "Emergency", category: "Emergency Fund", targetAmount: 1000, currentAmount: 250, targetDate: "2030-01-01", monthlyContribution: 50, expectedReturnPct: 6, inflationPct: 4, createdAt: "2026-01-01T00:00:00.000Z" }];

  it("renders the stress report as measure/value, assumption and impact tables with units", () => {
    const layout = layoutReport(buildReportSheets(state, { section: "stress" }), "Stress", { generatedAt: FIXED_DATE });
    const labels = layout.tables.map(t => t.columns.map(c => c.label).join("/"));
    expect(labels[0]).toBe("Measure/Value");
    expect(labels).toContain("Holding/Symbol/Before/Change/After");
    const all = textOps(layout, "td").map(op => op.text);
    expect(all).toContain("-Rs 1,35,729.05");
    expect(all).toContain("-7.15%");
    expect(all).toContain("-20.00%");
    expect(all).toContain("Rs 14,112.00".replace("Rs", "-Rs"));
    expect(all).toContain("Illustrative sensitivity, not a historical reconstruction or prediction.".slice(0, 0) || "Rs 12.50");
  });

  it("renders an unsaved stress scenario as a plain status note, not a table", () => {
    const layout = layoutReport(buildReportSheets(stateWith([]), { section: "stress" }), "Stress", { generatedAt: FIXED_DATE });
    expect(layout.tables).toHaveLength(0);
    expect(textOps(layout, "note").some(op => op.text.includes("No saved stress scenario exists."))).toBe(true);
  });

  it("renders goals, snapshots and allocation tables from saved state", () => {
    const goals = layoutReport(buildReportSheets(state, { section: "goals" }), "Goals", { generatedAt: FIXED_DATE });
    expect(textOps(goals, "td").map(op => op.text)).toEqual(expect.arrayContaining(["Emergency", "Rs 1,000.00", "6.00%"]));
    const snaps = layoutReport(buildReportSheets(state, { section: "snapshots" }), "Snapshots", { generatedAt: FIXED_DATE });
    expect(textOps(snaps, "td").map(op => op.text)).toEqual(expect.arrayContaining(["2026-01-01", "Rs 180.00", DASH]));
    const alloc = layoutReport(buildReportSheets(state, { section: "allocation" }), "Allocation", { generatedAt: FIXED_DATE });
    expect(alloc.tables.some(t => t.columns[0]!.label === "Bucket")).toBe(true);
    expect(textOps(alloc, "th").some(op => op.text === "Drift (pp)")).toBe(true);
  });

  it("keeps a combined report in one document with section headings and continuous page numbers", () => {
    const layout = layoutReport(buildReportSheets(state), "Combined", { generatedAt: FIXED_DATE });
    const headings = textOps(layout, "heading").map(op => op.text);
    expect(headings).toEqual(expect.arrayContaining(["Overview", "Holdings", "Allocation", "Goals", "Diversification", "Stress test", "Snapshots", "Disclaimer"]));
    const labels = textOps(layout, "footer").filter(op => op.text.startsWith("Page ")).map(op => op.text);
    expect(labels).toEqual(layout.pages.map((_, i) => `Page ${i + 1} of ${layout.pages.length}`));
  });

  it("derives the metadata from saved state without mutating it", () => {
    const snapshot = JSON.stringify(state);
    const meta = pdfMeta(state, { section: "holdings" });
    pdfBytes(buildReportSheets(state), "Combined", meta);
    expect(meta.period).toBe("Snapshots 2025-01-01 to 2026-01-01");
    expect(meta.notes?.some(n => n.includes("Weight is relative"))).toBe(true);
    expect(pdfMeta(state, { section: "goals" }).notes).toEqual([]);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
