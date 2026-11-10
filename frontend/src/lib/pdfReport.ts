/**
 * Dependency-free PDF report renderer.
 *
 * Pipeline: report sheets -> typed tables (units, alignment, column widths)
 * -> paginated layout (A4 landscape, repeated headers, footers)
 * -> PDF bytes (standard Helvetica, WinAnsi).
 *
 * `layoutReport` is separate from `serializePdf` so tests can assert on
 * geometry (page bounds, alignment, repeated headers) without parsing a PDF.
 */

export type PdfCell = string | number | boolean | Date | null | undefined;
export interface PdfSheet {
  name: string;
  rows: PdfCell[][];
}
export interface PdfMeta {
  generatedAt?: Date;
  /** Shown under the title and in every footer. */
  dataStatus?: string;
  /** Reporting period line, e.g. "Snapshots 2021-01-01 to 2026-04-01". */
  period?: string;
  /** Extra explanatory notes printed before the disclaimer. */
  notes?: string[];
}

type FontKey = "regular" | "bold" | "italic";
type Color = [number, number, number];
type Unit = "INR" | "%" | "pp";

export type PdfOp =
  | { t: "rect"; x: number; y: number; w: number; h: number; fill: Color }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; color: Color; lw: number }
  | {
      t: "text";
      x: number;
      y: number;
      w: number;
      text: string;
      size: number;
      font: FontKey;
      color: Color;
      role: "title" | "meta" | "heading" | "caption" | "th" | "td" | "note" | "footer" | "running";
      align: "left" | "right";
      table?: number;
      col?: number;
    };
export interface PdfPage {
  ops: PdfOp[];
}
export interface PdfTableInfo {
  id: number;
  caption?: string;
  pages: number[];
  columns: Array<{ x: number; w: number; align: "left" | "right"; label: string }>;
}
export interface PdfLayout {
  pages: PdfPage[];
  tables: PdfTableInfo[];
  title: string;
}

export const PAGE_W = 841.89; // A4 landscape, points
export const PAGE_H = 595.28;
export const MARGIN_X = 36;
export const CONTENT_BOTTOM = 48;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const FONT_SIZE = 8;
const LINE_H = 10;
const PAD_X = 5;
const PAD_Y = 3.5;

const NAVY: Color = [0.078, 0.149, 0.231];
const TEXT: Color = [0.1, 0.12, 0.15];
const MUTED: Color = [0.38, 0.42, 0.48];
const BORDER: Color = [0.8, 0.83, 0.86];
const ZEBRA: Color = [0.957, 0.965, 0.976];
const WHITE: Color = [1, 1, 1];

export const PDF_DISCLAIMER =
  "Educational use only. Scenario assumptions are illustrative and are not predictions, guarantees, personalized investment advice, or recommendations. No tax, transaction-cost, trading, or security-constraint assumptions are included unless explicitly shown.";

// Helvetica / Helvetica-Bold advance widths (per 1000 em) for ASCII 32..126.
const W_REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];
const W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  333, 333, 584, 584, 584, 611, 975,
  722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500,
  389, 280, 389, 584,
];
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99,
  0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/**
 * Map arbitrary text to the WinAnsi (Windows-1252) repertoire that the
 * standard PDF fonts support. Each output char code is one byte. Accented
 * Latin letters, curly quotes and dashes survive; the rupee sign becomes
 * "Rs"; anything else (e.g. CJK, emoji) becomes "?" rather than corrupting
 * the file.
 */
export function pdfText(value: string): string {
  let out = "";
  for (const ch of value.normalize("NFC")) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x20b9) out += "Rs ";
    else if (cp >= 0x20 && cp <= 0x7e) out += ch;
    else if (cp === 0xa0 || cp === 0x09) out += " ";
    else if (cp === 0xad) out += "-";
    else if (cp > 0xa0 && cp <= 0xff) out += ch;
    else if (CP1252[cp] !== undefined) out += String.fromCharCode(CP1252[cp]!);
    else if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || cp === 0xfe0f) continue;
    else if (cp < 0x20 || cp === 0x7f) out += " ";
    else {
      const base = ch.normalize("NFD")[0]!;
      out += base.charCodeAt(0) < 0x7f && base.charCodeAt(0) >= 0x20 ? base : "?";
    }
  }
  return out.replace(/Rs {2,}/g, "Rs ");
}

function charWidth(code: number, bold: boolean): number {
  if (code >= 32 && code <= 126) return (bold ? W_BOLD : W_REGULAR)[code - 32]!;
  switch (code) {
    case 0x95: return 350;
    case 0x96: return 556;
    case 0x97: case 0x85: return 1000;
    case 0x91: case 0x92: return bold ? 278 : 222;
    case 0x93: case 0x94: return bold ? 500 : 333;
    default: return 556;
  }
}
export function textWidth(text: string, font: FontKey, size: number): number {
  const bold = font === "bold";
  let sum = 0;
  for (let i = 0; i < text.length; i++) sum += charWidth(text.charCodeAt(i), bold);
  return (sum / 1000) * size;
}

function wrapText(text: string, font: FontKey, size: number, maxW: number): string[] {
  const lines: string[] = [];
  const width = (s: string) => textWidth(s, font, size);
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let cur = "";
    for (let word of words) {
      while (width(word) > maxW) {
        if (cur) { lines.push(cur); cur = ""; }
        let n = 1;
        while (n < word.length && width(word.slice(0, n + 1)) <= maxW) n++;
        lines.push(word.slice(0, n));
        word = word.slice(n);
      }
      const attempt = cur ? `${cur} ${word}` : word;
      if (width(attempt) <= maxW) cur = attempt;
      else { lines.push(cur); cur = word; }
    }
    if (cur) lines.push(cur);
  }
  return lines.length ? lines : [""];
}

// ---------------------------------------------------------------------------
// Cell formatting
// ---------------------------------------------------------------------------

const groupedFixed = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const groupedPlain = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const groupedSmall = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 });
const MISSING = "—"; // em dash: value unavailable, never a genuine zero

function fixNegZero(formatted: string) {
  return /^-0(\.0+)?$/.test(formatted) ? formatted.slice(1) : formatted;
}
export function formatPdfNumber(value: number, unit?: Unit): string {
  if (unit === "INR") {
    const body = fixNegZero(groupedFixed.format(value));
    return body.startsWith("-") ? `-Rs ${body.slice(1)}` : `Rs ${body}`;
  }
  if (unit === "%") return `${fixNegZero(groupedFixed.format(value))}%`;
  if (unit === "pp") return fixNegZero(groupedFixed.format(value));
  // Fractions below 1 (HHI, correlations) keep 4 places; everything else 2.
  return fixNegZero((Math.abs(value) < 1 ? groupedSmall : groupedPlain).format(value));
}
const UNIT_SUFFIX = /\s*\((INR|%)\)\s*$/;
const unitOf = (value: PdfCell): Unit | undefined =>
  typeof value === "string" ? (/\((INR|%|pp)\)\s*$/.exec(value)?.[1] as Unit | undefined) : undefined;
const stripUnit = (value: string) => value.replace(UNIT_SUFFIX, "");

interface FormattedCell {
  text: string;
  numeric: boolean;
}
function formatCell(value: PdfCell, unit?: Unit): FormattedCell {
  if (value === null || value === undefined) return { text: MISSING, numeric: false };
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { text: formatPdfNumber(value, unit), numeric: true }
      : { text: MISSING, numeric: false };
  }
  if (typeof value === "boolean") return { text: value ? "Yes" : "No", numeric: false };
  if (value instanceof Date) return { text: Number.isNaN(value.getTime()) ? MISSING : value.toISOString(), numeric: false };
  return { text: value, numeric: false };
}
const blank = (v: PdfCell) => v === null || v === undefined || v === "";
const isBlankRow = (row: PdfCell[]) => !row.length || row.every(blank);
const plainText = (v: PdfCell) => formatCell(v).text;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

interface BodyCell extends FormattedCell {}
interface TableModel {
  caption?: string;
  headers: string[];
  rows: BodyCell[][];
  align: Array<"left" | "right">;
  min: number[];
  nat: number[];
}

function buildTable(header: PdfCell[], body: PdfCell[][], caption?: string): TableModel {
  const cols = header.length;
  const headerUnits = header.map(unitOf);
  const labels = header.map(h => pdfText(stripUnit(plainText(h))));
  const rows: BodyCell[][] = body.map(raw => {
    const rowUnit = unitOf(raw[0]);
    // A unit in the row label ("Loss (%)") applies to value columns that carry no unit of their own.
    const consumed = Boolean(rowUnit && rowUnit !== "pp") && headerUnits.some((u, c) => c > 0 && !u);
    const cells: BodyCell[] = [];
    for (let c = 0; c < cols; c++) {
      const unit = headerUnits[c] ?? (c > 0 ? rowUnit : undefined);
      const cell = formatCell(raw[c], unit);
      cells.push({ text: pdfText(cell.text), numeric: cell.numeric });
    }
    if (consumed) cells[0] = { text: pdfText(stripUnit(plainText(raw[0]))), numeric: false };
    return cells;
  });
  const align: Array<"left" | "right"> = [];
  const min: number[] = [];
  const nat: number[] = [];
  for (let c = 0; c < cols; c++) {
    const numeric = rows.filter(r => r[c]!.numeric).length;
    const textual = rows.filter(r => !r[c]!.numeric && r[c]!.text !== "" && r[c]!.text !== MISSING).length;
    align.push(numeric > 0 && numeric >= textual ? "right" : "left");
    const headerWords = labels[c]!.split(/\s+/).filter(Boolean);
    let colMin = Math.max(0, ...headerWords.map(w => textWidth(w, "bold", FONT_SIZE))) + PAD_X * 2;
    let colNat = colMin; // headers may always wrap, so they only set the minimum
    for (const row of rows) {
      const cell = row[c]!;
      const full = textWidth(cell.text, "regular", FONT_SIZE) + PAD_X * 2;
      if (cell.numeric) { colMin = Math.max(colMin, full); colNat = Math.max(colNat, full); continue; }
      const widest = Math.max(0, ...cell.text.split(/\s+/).map(w => textWidth(w, "regular", FONT_SIZE)));
      colMin = Math.max(colMin, Math.min(widest, 90) + PAD_X * 2);
      colNat = Math.max(colNat, Math.min(full, 260));
    }
    min.push(colMin);
    nat.push(Math.max(colMin, colNat));
  }
  return { caption, headers: labels, rows, align, min, nat };
}

function fitWidths(min: number[], nat: number[], avail: number): number[] {
  const sumMin = min.reduce((a, b) => a + b, 0);
  const sumNat = nat.reduce((a, b) => a + b, 0);
  if (sumMin >= avail) return min.map(m => (m / sumMin) * avail);
  if (sumNat <= avail) return nat.map(n => n + ((avail - sumNat) * n) / sumNat);
  const gap = sumNat - sumMin;
  return min.map((m, i) => m + ((avail - sumMin) * (nat[i]! - m)) / gap);
}

/** Split columns into groups that each fit the page; leading identity columns repeat in every group. */
function groupColumns(table: TableModel): number[][] {
  const cols = table.headers.length;
  const total = table.min.reduce((a, b) => a + b, 0);
  const all = Array.from({ length: cols }, (_, i) => i);
  if (total <= CONTENT_W || cols < 3) return [all];
  const idCount = /^name$/i.test(table.headers[1] ?? "") && cols > 3 ? 2 : 1;
  const ids = all.slice(0, idCount);
  const idWidth = ids.reduce((a, c) => a + table.min[c]!, 0);
  const groups: number[][] = [];
  let current: number[] = [];
  let width = idWidth;
  for (const c of all.slice(idCount)) {
    if (current.length && width + table.min[c]! > CONTENT_W) {
      groups.push([...ids, ...current]);
      current = [];
      width = idWidth;
    }
    current.push(c);
    width += table.min[c]!;
  }
  if (current.length) groups.push([...ids, ...current]);
  return groups;
}

export function layoutReport(sheets: PdfSheet[], title: string, meta: PdfMeta = {}): PdfLayout {
  const generated = meta.generatedAt ?? new Date();
  const dataStatus = pdfText(meta.dataStatus ?? "Workspace values; demo/synthetic values are labelled in content");
  const safeTitle = pdfText(title);
  const pages: PdfPage[] = [];
  const tables: PdfTableInfo[] = [];
  let page: PdfPage = { ops: [] };
  let y = 0;

  function text(
    s: string, x: number, baseline: number, size: number, font: FontKey, color: Color,
    role: Extract<PdfOp, { t: "text" }>["role"], extra: { align?: "left" | "right"; right?: number; table?: number; col?: number } = {}
  ) {
    const w = textWidth(s, font, size);
    const align = extra.align ?? "left";
    page.ops.push({ t: "text", x: align === "right" ? (extra.right ?? x) - w : x, y: baseline, w, text: s, size, font, color, role, align, table: extra.table, col: extra.col });
  }
  function newPage() {
    page = { ops: [] };
    pages.push(page);
    if (pages.length === 1) { y = PAGE_H - 36; return; }
    text(`PortfolioPilot  |  ${safeTitle}`, MARGIN_X, PAGE_H - 28, 8, "regular", MUTED, "running");
    page.ops.push({ t: "line", x1: MARGIN_X, y1: PAGE_H - 34, x2: PAGE_W - MARGIN_X, y2: PAGE_H - 34, color: BORDER, lw: 0.5 });
    y = PAGE_H - 48;
  }
  const ensure = (height: number) => { if (y - height < CONTENT_BOTTOM) newPage(); };
  function paragraph(s: string, size: number, font: FontKey, color: Color, role: "meta" | "note", gap = 3) {
    const lines = wrapText(pdfText(s), font, size, CONTENT_W);
    const lh = size * 1.3;
    ensure(lines.length * lh + gap);
    for (const line of lines) { y -= lh; text(line, MARGIN_X, y + size * 0.28, size, font, color, role); }
    y -= gap;
  }
  function heading(s: string) {
    ensure(26 + 90);
    y -= 22;
    text(pdfText(s), MARGIN_X, y, 13, "bold", NAVY, "heading");
    y -= 5;
    page.ops.push({ t: "line", x1: MARGIN_X, y1: y, x2: PAGE_W - MARGIN_X, y2: y, color: BORDER, lw: 0.6 });
    y -= 6;
  }

  newPage();
  // Title block
  for (const line of wrapText(safeTitle, "bold", 20, CONTENT_W)) { y -= 22; text(line, MARGIN_X, y, 20, "bold", NAVY, "title"); }
  y -= 4;
  const stamp = generated.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  paragraph(`Generated: ${stamp}`, 9, "regular", MUTED, "meta", 1);
  paragraph(`Data status: ${dataStatus}`, 9, "regular", MUTED, "meta", 1);
  if (meta.period) paragraph(`Reporting period: ${meta.period}`, 9, "regular", MUTED, "meta", 1);
  y -= 4;

  function drawTable(model: TableModel, sectionName: string) {
    const groups = groupColumns(model);
    for (const group of groups) {
      const split = group.length < model.headers.length;
      const widths = fitWidths(group.map(c => model.min[c]!), group.map(c => model.nat[c]!), CONTENT_W);
      const xs: number[] = [];
      widths.reduce((acc, w) => { xs.push(acc); return acc + w; }, MARGIN_X);
      const columns = group.map((c, i) => ({ x: xs[i]!, w: widths[i]!, align: model.align[c]!, label: model.headers[c]! }));
      const id = tables.length;
      const info: PdfTableInfo = { id, caption: model.caption, pages: [], columns };
      tables.push(info);

      const headerLines = group.map((c, i) => wrapText(model.headers[c]!, "bold", FONT_SIZE, widths[i]! - PAD_X * 2));
      const headerH = Math.max(...headerLines.map(l => l.length)) * LINE_H + PAD_Y * 2;
      const rowCells = model.rows.map(row => group.map((c, i) => wrapText(row[c]!.text, "regular", FONT_SIZE, widths[i]! - PAD_X * 2)));

      const drawCaption = (continued: boolean) => {
        const base = continued ? (model.caption ?? sectionName) : (model.caption ?? "");
        const part = split ? `Part ${groups.indexOf(group) + 1} of ${groups.length}` : "";
        const label = [pdfText(base), part, continued ? "(continued)" : ""].filter(Boolean).join("  ");
        if (!label) return;
        y -= 12;
        text(label, MARGIN_X, y, 9, "bold", continued ? MUTED : TEXT, "caption", { table: id });
        y -= 3;
      };
      const drawHeader = () => {
        y -= headerH;
        page.ops.push({ t: "rect", x: MARGIN_X, y, w: CONTENT_W, h: headerH, fill: NAVY });
        headerLines.forEach((lines, i) => {
          const col = columns[i]!;
          lines.forEach((line, n) => {
            const base = y + headerH - PAD_Y - FONT_SIZE * 0.85 - n * LINE_H;
            text(line, col.x + PAD_X, base, FONT_SIZE, "bold", WHITE, "th", { align: col.align, right: col.x + col.w - PAD_X, table: id, col: i });
          });
        });
      };
      const rowHeight = (lines: string[][]) => Math.max(...lines.map(l => l.length)) * LINE_H + PAD_Y * 2;
      const firstH = rowCells.length ? Math.min(rowHeight(rowCells[0]!), 120) : LINE_H + PAD_Y * 2;

      ensure(12 + 3 + headerH + firstH);
      drawCaption(false);
      drawHeader();
      info.pages.push(pages.length - 1);

      const drawRow = (lines: string[][], index: number) => {
        const h = rowHeight(lines);
        y -= h;
        if (index % 2 === 1) page.ops.push({ t: "rect", x: MARGIN_X, y, w: CONTENT_W, h, fill: ZEBRA });
        lines.forEach((cellLines, i) => {
          const col = columns[i]!;
          cellLines.forEach((line, n) => {
            if (!line) return;
            const base = y + h - PAD_Y - FONT_SIZE * 0.85 - n * LINE_H;
            text(line, col.x + PAD_X, base, FONT_SIZE, "regular", TEXT, "td", { align: col.align, right: col.x + col.w - PAD_X, table: id, col: i });
          });
        });
        page.ops.push({ t: "line", x1: MARGIN_X, y1: y, x2: MARGIN_X + CONTENT_W, y2: y, color: BORDER, lw: 0.5 });
        for (const col of [...columns.map(c => c.x), MARGIN_X + CONTENT_W]) page.ops.push({ t: "line", x1: col, y1: y, x2: col, y2: y + h, color: BORDER, lw: 0.5 });
      };
      const newTablePage = () => {
        newPage();
        info.pages.push(pages.length - 1);
        drawCaption(true);
        drawHeader();
      };

      if (!rowCells.length) {
        const h = LINE_H + PAD_Y * 2;
        y -= h;
        text("No data available.", MARGIN_X + PAD_X, y + PAD_Y + 2, FONT_SIZE, "italic", MUTED, "note");
        page.ops.push({ t: "line", x1: MARGIN_X, y1: y, x2: MARGIN_X + CONTENT_W, y2: y, color: BORDER, lw: 0.5 });
      }
      rowCells.forEach((cells, index) => {
        const maxBody = PAGE_H - 48 - CONTENT_BOTTOM - headerH - 30;
        if (rowHeight(cells) > maxBody) {
          // A single row taller than a page (e.g. a long coach answer): flow its lines across pages.
          const total = Math.max(...cells.map(l => l.length));
          const perPage = Math.floor((maxBody - PAD_Y * 2) / LINE_H);
          for (let from = 0; from < total; from += perPage) {
            const slice = cells.map(l => l.slice(from, from + perPage));
            if (y - rowHeight(slice) < CONTENT_BOTTOM) newTablePage();
            drawRow(slice, index);
          }
          return;
        }
        if (y - rowHeight(cells) < CONTENT_BOTTOM) newTablePage();
        drawRow(cells, index);
      });
      y -= 12;
    }
  }

  const note = (s: string) => paragraph(s, 8, "italic", MUTED, "note", 4);
  let any = false;
  for (const sheet of sheets) {
    any = true;
    heading(sheet.name);
    const segs: PdfCell[][][] = [];
    let cur: PdfCell[][] = [];
    for (const row of sheet.rows) {
      if (isBlankRow(row)) { if (cur.length) segs.push(cur); cur = []; } else cur.push(row);
    }
    if (cur.length) segs.push(cur);
    if (!segs.length) { note("No data available."); continue; }
    for (let seg of segs) {
      let caption: string | undefined;
      const filled = (r: PdfCell[]) => r.filter(v => !blank(v)).length;
      if (seg.length > 1 && filled(seg[0]!) <= 2 && filled(seg[0]!) < filled(seg[1]!)) {
        caption = seg[0]!.filter(v => !blank(v)).map(plainText).join(" - ");
        seg = seg.slice(1);
      }
      if (seg.length === 1 && filled(seg[0]!) <= 2) {
        const parts = seg[0]!.filter(v => !blank(v)).map(plainText);
        paragraph(parts.length > 1 ? `${parts[0]}: ${parts.slice(1).join(" ")}` : parts[0] ?? "", 9, "regular", TEXT, "note", 6);
        continue;
      }
      drawTable(buildTable(seg[0]!, seg.slice(1), caption), sheet.name);
    }
  }
  if (!any) note("No data available.");

  if (meta.notes?.length) {
    ensure(40);
    y -= 4;
    for (const n of meta.notes) note(n);
  }
  const disclaimerLines = wrapText(pdfText(PDF_DISCLAIMER), "italic", 8, CONTENT_W).length;
  ensure(22 + disclaimerLines * 10.4 + 4);
  y -= 18;
  text("Disclaimer", MARGIN_X, y, 10, "bold", NAVY, "heading");
  y -= 3;
  note(PDF_DISCLAIMER);

  // Footers once the page count is known.
  pages.forEach((p, i) => {
    page = p;
    p.ops.push({ t: "line", x1: MARGIN_X, y1: 36, x2: PAGE_W - MARGIN_X, y2: 36, color: BORDER, lw: 0.5 });
    text(`PortfolioPilot  |  ${dataStatus}`, MARGIN_X, 24, 7.5, "regular", MUTED, "footer");
    text(`Page ${i + 1} of ${pages.length}`, 0, 24, 7.5, "regular", MUTED, "footer", { align: "right", right: PAGE_W - MARGIN_X });
  });
  return { pages, tables, title: safeTitle };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

const num = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const rgb = (c: Color) => `${c[0].toFixed(3)} ${c[1].toFixed(3)} ${c[2].toFixed(3)}`;
const escapePdf = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const FONT_REF: Record<FontKey, string> = { regular: "F1", bold: "F2", italic: "F3" };

export function serializePdf(layout: PdfLayout): Uint8Array {
  const objects: string[] = [];
  const pageCount = layout.pages.length;
  objects.push(
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${layout.pages.map((_, i) => `${7 + i * 2} 0 R`).join(" ")}] /Count ${pageCount} >>`,
    `<< /Title (${escapePdf(layout.title)}) /Producer (PortfolioPilot) >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>"
  );
  layout.pages.forEach((p, i) => {
    const cmds: string[] = [];
    for (const op of p.ops) {
      if (op.t === "rect") cmds.push(`${rgb(op.fill)} rg ${num(op.x)} ${num(op.y)} ${num(op.w)} ${num(op.h)} re f`);
      else if (op.t === "line") cmds.push(`${rgb(op.color)} RG ${op.lw} w ${num(op.x1)} ${num(op.y1)} m ${num(op.x2)} ${num(op.y2)} l S`);
      else cmds.push(`BT /${FONT_REF[op.font]} ${op.size} Tf ${rgb(op.color)} rg ${num(op.x)} ${num(op.y)} Td (${escapePdf(op.text)}) Tj ET`);
    }
    const content = cmds.join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents ${8 + i * 2} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
    );
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF`;
  // Every char is a single byte (pdfText guarantees <= 0xFF), so write bytes directly.
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}

export function renderPdf(sheets: PdfSheet[], title: string, meta: PdfMeta = {}): Uint8Array {
  return serializePdf(layoutReport(sheets, title, meta));
}
