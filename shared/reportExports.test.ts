import { describe, expect, it } from "vitest";
import { createEmptyPortfolioState } from "./portfolio";
import { buildReportSheets, pdfBytes, safeFilename, spreadsheetText, workbookBytes, workspaceJson } from "../frontend/src/lib/reportExports";

describe("report exports", () => {
  function state() {
    const value = createEmptyPortfolioState("Asha / Test");
    value.holdings = [{ id: "h1", symbol: "=SUM(A1)", name: "Unicode ₹ holding", assetType: "Equity", sector: "Technology", geography: "India", marketCap: "Large", quantity: 2, averagePrice: 100, currentPrice: 90, currentValue: 180 }];
    value.goals = [{ id: "g1", name: "Emergency", category: "Emergency Fund", targetAmount: 1000, currentAmount: 250, targetDate: "2030-01-01", monthlyContribution: 50, expectedReturnPct: 6, inflationPct: 4, createdAt: "2026-01-01T00:00:00.000Z" }];
    value.coachMessages = [{ id: "c1", question: "=formula", answer: "Answer with + sign", source: "deterministic", createdAt: "2026-01-01T00:00:00.000Z" }];
    value.snapshots = [{ id: "s1", date: "2026-01-01", label: "Start", totalValue: 180, source: "manual" }];
    return value;
  }

  it("builds combined and selected section sheets from current state", () => {
    const combined = buildReportSheets(state());
    const selected = buildReportSheets(state(), { section: "holdings", scope: "h1" });
    expect(combined.map(sheet => sheet.name)).toEqual(expect.arrayContaining(["Overview", "Holdings", "Goals", "Snapshots"]));
    expect(selected).toHaveLength(2);
    expect(selected[0]!.rows[1]![0]).toBe("=SUM(A1)");
    expect(selected[0]!.rows).toHaveLength(2);
    const bucket = buildReportSheets(state(), { section: "allocation", scope: "Equity" });
    expect(bucket[1]!.rows.some(row => row[0] === "=SUM(A1)")).toBe(true);
  });

  it("creates valid-looking XLSX and PDF byte payloads", () => {
    const sheets = buildReportSheets(state(), { section: "coach" });
    const xlsx = workbookBytes(sheets);
    const pdf = pdfBytes(sheets, "Coach report");
    expect(Array.from(xlsx.slice(0, 4))).toEqual([80, 75, 3, 4]);
    expect(new TextDecoder().decode(pdf.slice(0, 8))).toBe("%PDF-1.4");
    expect(new TextDecoder().decode(pdf)).toContain("Coach report");
  });

  it("sanitizes untrusted spreadsheet text but preserves negative numbers", () => {
    expect(spreadsheetText("=1+1")).toBe("'=1+1");
    expect(spreadsheetText("+cmd")).toBe("'+cmd");
    expect(spreadsheetText("-text")).toBe("'-text");
    expect(spreadsheetText(-125)).toBe(-125);
  });

  it("sanitizes filenames and preserves all workspace fields in JSON", () => {
    expect(safeFilename('Bad:/"name"\u0000')).toBe("Bad name");
    const value = state();
    value.customScenario = { id: "custom", name: "Custom", description: "d", returnsPct: { Equity: -1, "Mutual Funds": 0, Gold: 1, Debt: 2, Cash: 0 }, recoveryMonths: 3, isCustom: true };
    value.updatedAt = "2026-01-02T00:00:00.000Z";
    const parsed = JSON.parse(workspaceJson(value));
    expect(parsed).toEqual(value);
  });
});
