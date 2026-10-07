// Livraison 91 — a small Excel (.xlsx) writer, with no library: an .xlsx
// file is a ZIP of a few XML files. It writes exactly what the results
// export needs: several sheets, text / numbers / formulas, a few fixed
// styles, column widths, merged cells, a frozen header, colours that
// follow the values (conditional formatting) and a 0–9 check on the
// cells the teacher fills in. Nothing is sent anywhere: the file is built
// in the browser and downloaded.
//
// sheet = {
//   name, cols: [width…], freezeRow (rows above stay visible),
//   rows: [[cell…]…]  (cell = null | { v, f, s })
//      v: text or number, f: formula (without "="), s: style name (STYLES)
//   merges: ["A1:H1"], cf: [{ range, formula, color: "green"|"amber"|"red" }],
//   validations: [{ range, min, max, prompt }]
// }

const STYLE_LIST = ["default", "title", "subtitle", "header", "text", "band", "input", "label", "note", "keyGreen", "keyAmber", "keyRed", "threshold"];
const STYLES = Object.fromEntries(STYLE_LIST.map((n, i) => [n, i]));

const esc = (s) => String(s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function colName(i) {           // 0 → A, 25 → Z, 26 → AA
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Excel refuses a sheet name longer than 31 characters or with : \ / ? * [ ].
export function sheetName(name, used) {
  let base = String(name || "Sheet").replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "") || "Sheet";
  base = base.slice(0, 31);
  let n = base, k = 2;
  while (used.has(n.toLowerCase())) { const tail = ` (${k++})`; n = base.slice(0, 31 - tail.length) + tail; }
  used.add(n.toLowerCase());
  return n;
}
export const sheetRef = (name) => `'${String(name).replace(/'/g, "''")}'`;

function cellXml(c, ref) {
  if (c === null || c === undefined) return "";
  const s = c.s !== undefined ? ` s="${STYLES[c.s] ?? 0}"` : "";
  if (c.f) {
    const cached = c.v === undefined || c.v === null || c.v === ""
      ? ` t="str"><f>${esc(c.f)}</f>`
      : typeof c.v === "number" ? `><f>${esc(c.f)}</f><v>${c.v}</v>` : ` t="str"><f>${esc(c.f)}</f><v>${esc(c.v)}</v>`;
    return `<c r="${ref}"${s}${cached}</c>`;
  }
  if (c.v === undefined || c.v === null || c.v === "") return s ? `<c r="${ref}"${s}/>` : "";
  if (typeof c.v === "number" && Number.isFinite(c.v)) return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
}

const DXF = { green: 0, amber: 1, red: 2 };

function sheetXml(sh) {
  const rows = sh.rows || [];
  const width = Math.max(1, ...rows.map((r) => r.length));
  const out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
  out.push('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');   // printed on one page wide
  out.push(`<dimension ref="A1:${colName(width - 1)}${Math.max(1, rows.length)}"/>`);
  out.push('<sheetViews><sheetView workbookViewId="0"' + (sh.tabSelected ? ' tabSelected="1"' : "") + ">");
  if (sh.freezeRow) out.push(`<pane ySplit="${sh.freezeRow}" topLeftCell="A${sh.freezeRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sh.freezeRow + 1}" sqref="A${sh.freezeRow + 1}"/>`);
  out.push("</sheetView></sheetViews>");
  out.push('<sheetFormatPr defaultRowHeight="15"/>');
  if (sh.cols?.length) out.push("<cols>" + sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("") + "</cols>");
  out.push("<sheetData>");
  rows.forEach((r, i) => {
    const cells = (r || []).map((c, j) => cellXml(c, `${colName(j)}${i + 1}`)).join("");
    const ht = sh.heights?.[i] ? ` ht="${sh.heights[i]}" customHeight="1"` : "";
    out.push(`<row r="${i + 1}"${ht}>${cells}</row>`);
  });
  out.push("</sheetData>");
  if (sh.merges?.length) out.push(`<mergeCells count="${sh.merges.length}">` + sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join("") + "</mergeCells>");
  let prio = 1;
  for (const cf of sh.cf || []) {
    out.push(`<conditionalFormatting sqref="${cf.range}"><cfRule type="expression" dxfId="${DXF[cf.color]}" priority="${prio++}" stopIfTrue="1"><formula>${esc(cf.formula)}</formula></cfRule></conditionalFormatting>`);
  }
  if (sh.validations?.length) {
    out.push(`<dataValidations count="${sh.validations.length}">` + sh.validations.map((v) =>
      `<dataValidation type="decimal" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="Band" error="${esc(v.error || `Enter a band from ${v.min} to ${v.max}.`)}" promptTitle="Band" prompt="${esc(v.prompt || "")}" sqref="${v.range}"><formula1>${v.min}</formula1><formula2>${v.max}</formula2></dataValidation>`).join("") + "</dataValidations>");
  }
  out.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>');
  out.push('<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>');
  out.push("</worksheet>");
  return out.join("");
}

function stylesXml() {
  const thin = '<left style="thin"><color rgb="FFC9CFCB"/></left><right style="thin"><color rgb="FFC9CFCB"/></right><top style="thin"><color rgb="FFC9CFCB"/></top><bottom style="thin"><color rgb="FFC9CFCB"/></bottom><diagonal/>';
  // fonts: 0 normal, 1 bold, 2 title, 3 subtitle (grey italic), 4 header (white bold)
  const fonts = [
    '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="15"/><color rgb="FF0F5C4C"/><name val="Calibri"/><family val="2"/></font>',
    '<font><i/><sz val="10"/><color rgb="FF5E6B66"/><name val="Calibri"/><family val="2"/></font>',
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>',
  ];
  // fills: 0 none, 1 gray125 (required), 2 header teal, 3 input (light yellow), 4 green, 5 amber, 6 red
  const solid = (rgb) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
    solid("FF0F5C4C"), solid("FFFFF8DC"), solid("FFC6EFCE"), solid("FFFFEB9C"), solid("FFFFC7CE")];
  const borders = ["<border><left/><right/><top/><bottom/><diagonal/></border>", `<border>${thin}</border>`];
  const center = '<alignment horizontal="center" vertical="center"/>';
  const left = '<alignment horizontal="left" vertical="center"/>';
  // cellXfs, in the order of STYLE_LIST. numFmt 164 = "0.0".
  const xf = (font, fill, border, numFmt, align) =>
    `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"${font ? ' applyFont="1"' : ""}${fill ? ' applyFill="1"' : ""}${border ? ' applyBorder="1"' : ""}${numFmt ? ' applyNumberFormat="1"' : ""}${align ? ` applyAlignment="1">${align}</xf>` : "/>"}`;
  const xfs = [
    xf(0, 0, 0, 0, ""),            // default
    xf(2, 0, 0, 0, left),          // title
    xf(3, 0, 0, 0, left),          // subtitle
    xf(4, 2, 1, 0, center),        // header
    xf(0, 0, 1, 0, left),          // text
    xf(0, 0, 1, 164, center),      // band
    xf(0, 3, 1, 164, center),      // input (Speaking, filled by the teacher)
    xf(1, 0, 0, 0, left),          // label
    xf(3, 0, 0, 0, left),          // note
    xf(1, 4, 1, 0, center),        // keyGreen
    xf(1, 5, 1, 0, center),        // keyAmber
    xf(1, 6, 1, 0, center),        // keyRed
    xf(1, 3, 1, 164, center),      // threshold (editable)
  ];
  const dxf = (rgbFill, rgbFont) => `<dxf><font><b/><color rgb="${rgbFont}"/></font><fill><patternFill patternType="solid"><fgColor rgb="${rgbFill}"/><bgColor rgb="${rgbFill}"/></patternFill></fill></dxf>`;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts>' +
    `<fonts count="${fonts.length}">${fonts.join("")}</fonts>` +
    `<fills count="${fills.length}">${fills.join("")}</fills>` +
    `<borders count="${borders.length}">${borders.join("")}</borders>` +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    `<dxfs count="3">${dxf("FFC6EFCE", "FF006100")}${dxf("FFFFEB9C", "FF9C5700")}${dxf("FFFFC7CE", "FF9C0006")}</dxfs>` +
    "</styleSheet>";
}

export function buildXlsx(sheets) {
  const enc = new TextEncoder();
  const files = [];
  const add = (name, text) => files.push({ name, data: enc.encode(text) });
  add("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    "</Types>");
  add("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    "</Relationships>");
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  add("docProps/core.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:creator>AIU Assignment Hub</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`);
  add("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    "<bookViews><workbookView/></bookViews><sheets>" +
    sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
  add("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    "</Relationships>");
  add("xl/styles.xml", stylesXml());
  sheets.forEach((s, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml({ ...s, tabSelected: i === 0 })));
  return zipStore(files);
}

// ---------- ZIP (stored, no compression) ----------
let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const enc = new TextEncoder();
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0, true); local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true); local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true); local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, f.data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0, true); cen.setUint16(10, 0, true);
    cen.setUint16(12, dosTime, true); cen.setUint16(14, dosDate, true); cen.setUint32(16, crc, true);
    cen.setUint32(20, f.data.length, true); cen.setUint32(24, f.data.length, true);
    cen.setUint16(28, name.length, true); cen.setUint16(30, 0, true); cen.setUint16(32, 0, true); cen.setUint16(34, 0, true);
    cen.setUint16(36, 0, true); cen.setUint32(38, 0, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cenSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true);
  end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
  const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
