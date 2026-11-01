/**
 * lib/xlsx-lite.js — gerador mínimo de planilha .xlsx (OOXML) e de CSV.
 *
 * Por que existe: o projeto não tem biblioteca de planilha e a exportação do
 * admin precisa de várias abas, formatação e filtros. Em vez de somar uma
 * dependência ao deploy, geramos o formato direto: um .xlsx é um .zip com
 * alguns XMLs. Só usa `zlib` do Node (compressão) e `Buffer`.
 *
 * Uso:
 *   const buf = buildXlsx([{ name: "Resumo", widths: [30, 12], headerRow: 1, rows: [[...], ...] }]);
 *
 * Células: número, texto, null, ou { v, f } com f = nome de estilo (STYLE_IDS).
 * Texto vai como string "inline": nunca é interpretado como fórmula pelo Excel.
 */

import { deflateRawSync } from "zlib";

// ── estilos (índices em cellXfs, ver styles.xml abaixo) ─────────────────────
export const STYLE_IDS = {
  default: 0, header: 1, int: 2, pct: 3, dec1: 4, wrap: 5, title: 6, bold: 7, note: 8,
  high: 9, mid: 10, low: 11, delta: 12, section: 13, intBold: 14, hint: 15,
};

// ── CRC32 ───────────────────────────────────────────────────────────────────
let CRC_TABLE;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  const day = ((Math.max(d.getUTCFullYear(), 1980) - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, day };
}

/** ZIP com compressão deflate. files = [{ name, data: Buffer|string }] */
export function zip(files, when = new Date()) {
  const { time, day } = dosDateTime(when);
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, "utf8");
    const packed = deflateRawSync(raw);
    const useDeflate = packed.length < raw.length;
    const body = useDeflate ? packed : raw;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// ── XML ─────────────────────────────────────────────────────────────────────
// eslint-disable-next-line no-control-regex
const BAD_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

export function xmlEscape(value) {
  return String(value)
    .replace(BAD_XML_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 1 → A, 27 → AA */
export function colName(index) {
  let n = index;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function safeSheetName(name, used = new Set()) {
  let base = String(name || "Planilha").replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Planilha";
  let out = base;
  let i = 2;
  while (used.has(out.toLowerCase())) {
    const suffix = ` ${i}`;
    out = base.slice(0, 31 - suffix.length) + suffix;
    i += 1;
  }
  used.add(out.toLowerCase());
  return out;
}

function cellXml(ref, cell) {
  if (cell === null || cell === undefined || cell === "") return "";
  let value = cell;
  let style = 0;
  if (typeof cell === "object" && !(cell instanceof Date)) {
    value = cell.v;
    style = STYLE_IDS[cell.f] ?? 0;
    if (value === null || value === undefined || value === "") return style ? `<c r="${ref}" s="${style}"/>` : "";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return style ? `<c r="${ref}" s="${style}"/>` : "";
    return `<c r="${ref}"${style ? ` s="${style}"` : ""}><v>${value}</v></c>`;
  }
  const text = value instanceof Date ? value.toISOString() : String(value);
  return `<c r="${ref}"${style ? ` s="${style}"` : ""} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

function sheetXml(sheet, index) {
  const rows = sheet.rows || [];
  const widths = sheet.widths || [];
  const maxCols = Math.max(widths.length, ...rows.map((r) => r.length), 1);
  const headerRow = sheet.headerRow || 0;
  const lastRow = Math.max(rows.length, 1);
  const lastCol = colName(maxCols);

  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";

  const pane = headerRow
    ? `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>`
    : "";

  const data = rows
    .map((row, r) => {
      const cells = row.map((cell, c) => cellXml(`${colName(c + 1)}${r + 1}`, cell)).join("");
      const isHeader = headerRow && r + 1 === headerRow;
      return `<row r="${r + 1}"${isHeader ? ' ht="30" customHeight="1"' : ""}>${cells}</row>`;
    })
    .join("");

  const filter = headerRow && rows.length > headerRow ? `<autoFilter ref="A${headerRow}:${lastCol}${lastRow}"/>` : "";
  const tab = `<sheetPr>${sheet.tab ? `<tabColor rgb="${sheet.tab}"/>` : ""}<pageSetUpPr fitToPage="1"/></sheetPr>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${tab}` +
    `<dimension ref="A1:${lastCol}${lastRow}"/>` +
    `<sheetViews><sheetView workbookViewId="0"${index === 0 ? ' tabSelected="1"' : ""}${sheet.grid === false ? ' showGridLines="0"' : ""}>${pane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${data}</sheetData>${filter}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`
  );
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="3"><numFmt numFmtId="164" formatCode="0.0%"/><numFmt numFmtId="165" formatCode="0.0"/><numFmt numFmtId="166" formatCode="+0.0%;-0.0%;0.0%"/></numFmts>` +
  `<fonts count="6">` +
  `<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>` +
  `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>` +
  `<font><b/><sz val="15"/><color rgb="FF12163A"/><name val="Calibri"/><family val="2"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>` +
  `<font><i/><sz val="10"/><color rgb="FF6A6F99"/><name val="Calibri"/><family val="2"/></font>` +
  `<font><b/><sz val="12"/><color rgb="FF2430E6"/><name val="Calibri"/><family val="2"/></font>` +
  `</fonts>` +
  `<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF12163A"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFFDE2E1"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFFFF1C2"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFDDF3E4"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="16">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` +
  `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1" indent="1"/></xf>` +
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top"/></xf>` +
  `<xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top"/></xf>` +
  `<xf numFmtId="0" fontId="3" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top"/></xf>` +
  `<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="3" fontId="3" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>` +
  `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/**
 * @param {{name:string, rows:any[][], widths?:number[], headerRow?:number, tab?:string, grid?:boolean}[]} sheets
 * @param {{ when?: Date, creator?: string }} options
 * @returns {Buffer}
 */
export function buildXlsx(sheets, { when = new Date(), creator = "Descomplica Bula" } = {}) {
  const used = new Set();
  const named = sheets.map((s) => ({ ...s, safeName: safeSheetName(s.name, used) }));

  const files = [
    {
      name: "[Content_Types].xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
        `</Types>`,
    },
    {
      name: "_rels/.rels",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
        `</Relationships>`,
    },
    {
      name: "docProps/core.xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
        `<dc:creator>${xmlEscape(creator)}</dc:creator>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${when.toISOString().replace(/\.\d{3}Z$/, "Z")}</dcterms:created>` +
        `</cp:coreProperties>`,
    },
    {
      name: "xl/workbook.xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<bookViews><workbookView activeTab="0"/></bookViews><sheets>` +
        named.map((s, i) => `<sheet name="${xmlEscape(s.safeName)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        `</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    },
    { name: "xl/styles.xml", data: STYLES_XML },
    ...named.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s, i) })),
  ];
  return zip(files, when);
}

// ── CSV ─────────────────────────────────────────────────────────────────────
/**
 * Texto que começa com = + - @ vira fórmula ao abrir no Excel/Sheets
 * ("CSV injection"). Como ruas, origens e campanhas vêm de visitantes, trava.
 */
export function csvCell(value, sep = ";") {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && !(value instanceof Date)) value = value.v;
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value).replace(".", ",") : "";
  let text = String(value).replace(BAD_XML_CHARS, "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (text.includes(sep) || /["\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** CSV para Excel em português: separador ";", vírgula decimal e BOM UTF-8. */
export function buildCsv(rows, sep = ";") {
  return "\ufeff" + rows.map((r) => r.map((c) => csvCell(c, sep)).join(sep)).join("\r\n") + "\r\n";
}
