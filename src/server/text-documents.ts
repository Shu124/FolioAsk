import { boundedOfficeArchive } from "./office-archive.ts";
import { SaxesParser } from "saxes";
import {
  MAX_DOCUMENT_PAGES,
  MAX_DOCUMENT_TEXT,
  PASSAGE_CHARACTERS,
  SECTION_CHARACTERS,
  type DocumentFormat,
} from "../document-policy.ts";
import type { SourcePage } from "./documents.ts";
import { HttpError } from "./http.ts";

export const EXTRACTION_NOTICES: Partial<Record<DocumentFormat, string>> = {
  docx: "Extracted Word body text and tables. Sections are not Word page numbers. Images, headers, footers, comments and footnotes are not indexed; check the original for those details.",
  xlsx: "Extracted saved worksheet cell values, including hidden rows and sheets. Formulas are not calculated; cached results may be outdated and dates may appear as stored serial numbers. Charts, images and external resources are not read.",
  csv: "CSV fields are read as text, not executed as formulas. References use CSV record numbers, including the header row.",
  txt: "References identify extracted text sections and original line numbers.",
  md: "Markdown is read as plain text. Embedded HTML, images and links are not executed or fetched.",
};

function invalid(
  message = "This document cannot be read. Use a valid, unencrypted file in a supported format.",
): never {
  throw new HttpError(422, message);
}
function tooLarge(): never {
  throw new HttpError(
    413,
    "This document has too much extracted content. Split it into smaller files (maximum 200,000 text characters and 100 extracted sections).",
  );
}
function decode(bytes: Uint8Array, max = MAX_DOCUMENT_TEXT) {
  // Limit allocation before decoding. UTF-16 and UTF-8 are supported explicitly.
  if (bytes.length > max * 4) tooLarge();
  let value: string;
  try {
    const encoding =
      bytes[0] === 255 && bytes[1] === 254
        ? "utf-16le"
        : bytes[0] === 254 && bytes[1] === 255
          ? "utf-16be"
          : "utf-8";
    value = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    return invalid(
      "Use UTF-8 or BOM-marked UTF-16 text. Binary or damaged text files are not supported.",
    );
  }
  if (value.length > max) tooLarge();
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) invalid();
  return value;
}

type TextItem = { text: string; reference: string; group?: string };
function sections(items: TextItem[]): SourcePage[] {
  const pages: SourcePage[] = [];
  let page: SourcePage | undefined,
    length = 0,
    total = 0,
    group: string | undefined;
  let first = "";
  for (const item of items) {
    const text = item.text.trim();
    if (!text) continue;
    total += text.length;
    if (total > MAX_DOCUMENT_TEXT) tooLarge();
    // Short passages are also safe embedding units; references remain stable.
    for (let offset = 0; offset < text.length; offset += PASSAGE_CHARACTERS) {
      const part = text.slice(offset, offset + PASSAGE_CHARACTERS);
      if (
        !page ||
        length + part.length > SECTION_CHARACTERS ||
        group !== item.group
      ) {
        if (pages.length >= MAX_DOCUMENT_PAGES) tooLarge();
        page = { number: pages.length + 1, width: 1, height: 1, passages: [] };
        pages.push(page);
        length = 0;
        first = item.reference;
        group = item.group;
      }
      page.label = `${group ? `${group} · ` : ""}${first}${first !== item.reference ? ` – ${item.reference}` : ""} (section ${page.number})`;
      page.passages.push({
        id: `p${page.number}-${page.passages.length + 1}`,
        text: part,
        box: { x: 0, y: 0, width: 1, height: 1 },
      });
      length += part.length;
    }
  }
  if (!pages.length)
    invalid("This document has no readable text or saved cell values.");
  return pages;
}

type XmlNode = {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
};
function xml(bytes: Uint8Array): XmlNode {
  const text = decode(bytes, 4_000_000);
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(text))
    invalid("XML entity declarations and document types are not supported.");
  const parser = new SaxesParser({ xmlns: false });
  const stack: XmlNode[] = [];
  let root: XmlNode | undefined,
    nodes = 0;
  parser.on("opentag", (tag) => {
    if (++nodes > 60_000 || stack.length >= 64) tooLarge();
    const node: XmlNode = {
      name: tag.name.split(":").at(-1)!,
      attributes: { ...tag.attributes },
      children: [],
      text: "",
    };
    if (stack.length) stack.at(-1)!.children.push(node);
    else root = node;
    stack.push(node);
  });
  const addText = (value: string) => {
    if (stack.length) stack.at(-1)!.text += value;
  };
  parser.on("text", addText);
  parser.on("cdata", addText);
  parser.on("closetag", () => {
    stack.pop();
  });
  parser.on("doctype", () => invalid());
  parser.write(text).close();
  if (!root) invalid();
  return root;
}
function descendants(node: XmlNode, name: string): XmlNode[] {
  return node.children.flatMap((child) =>
    child.name === name ? [child] : descendants(child, name),
  );
}
function child(node: XmlNode, name: string) {
  return node.children.find((part) => part.name === name);
}
function textRuns(node: XmlNode) {
  return descendants(node, "t")
    .map((part) => part.text)
    .join("");
}
function wordText(node: XmlNode): string {
  if (node.name === "t") return node.text;
  if (["tab", "br", "cr"].includes(node.name)) return " ";
  // Deleted revisions are not part of the current document text.
  if (["del", "moveFrom"].includes(node.name)) return "";
  return node.children.map(wordText).join("");
}

function officeParts(bytes: Uint8Array, format: "docx" | "xlsx") {
  if (bytes[0] !== 80 || bytes[1] !== 75)
    invalid(
      "Use an unencrypted DOCX or XLSX file. Legacy DOC/XLS and password-protected Office files are not supported.",
    );
  const files = boundedOfficeArchive(
    bytes,
    (name) =>
      name === "[Content_Types].xml" ||
      (format === "docx"
        ? name === "word/document.xml"
        : /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(
            name,
          )),
  );
  const types =
    files["[Content_Types].xml"] && xml(files["[Content_Types].xml"]);
  const mainType =
    format === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
  const mainPath =
    format === "docx" ? "/word/document.xml" : "/xl/workbook.xml";
  if (
    !types ||
    !descendants(types, "Override").some(
      (part) =>
        part.attributes.PartName === mainPath &&
        part.attributes.ContentType === mainType,
    )
  )
    invalid("The Office file's contents do not match its filename.");
  return files;
}

function word(bytes: Uint8Array): SourcePage[] {
  const files = officeParts(bytes, "docx");
  if (!files["word/document.xml"]) invalid();
  const document = xml(files["word/document.xml"]);
  const body = child(document, "body");
  if (document.name !== "document" || !body) invalid();
  return sections(
    descendants(body, "p").map((paragraph, index) => ({
      text: wordText(paragraph),
      reference: `Paragraph ${index + 1}`,
    })),
  );
}

function spreadsheet(bytes: Uint8Array): SourcePage[] {
  const files = officeParts(bytes, "xlsx");
  if (!files["xl/workbook.xml"] || !files["xl/_rels/workbook.xml.rels"])
    invalid();
  const book = xml(files["xl/workbook.xml"]);
  if (book.name !== "workbook") invalid();
  const relationships = descendants(
    xml(files["xl/_rels/workbook.xml.rels"]),
    "Relationship",
  );
  const strings = files["xl/sharedStrings.xml"]
    ? descendants(xml(files["xl/sharedStrings.xml"]), "si").map(textRuns)
    : [];
  const items: TextItem[] = [];
  let extractedLength = 0,
    rowCount = 0;
  const sheets = descendants(book, "sheet");
  if (sheets.length > 100) tooLarge();
  const visited = new Set<string>();
  for (const sheet of sheets) {
    const relation = relationships.find(
      (item) => item.attributes.Id === sheet.attributes["r:id"],
    );
    if (!relation || relation.attributes.TargetMode === "External") invalid();
    const target = new URL(
      relation.attributes.Target,
      "https://office.invalid/xl/",
    );
    if (
      target.origin !== "https://office.invalid" ||
      target.search ||
      target.hash
    )
      invalid();
    const path = target.pathname.slice(1);
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(path) || !files[path]) invalid();
    if (visited.has(path))
      invalid("Duplicate worksheet references are not supported.");
    visited.add(path);
    const worksheet = xml(files[path]);
    if (worksheet.name !== "worksheet") invalid();
    for (const row of descendants(worksheet, "row")) {
      if (++rowCount > 10_000) tooLarge();
      const cells = row.children
        .filter((node) => node.name === "c")
        .map((cell) => {
          const address = cell.attributes.r;
          if (!/^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(address ?? "")) invalid();
          const raw = child(cell, "v")?.text ?? "";
          let value = raw;
          if (cell.attributes.t === "s") {
            if (!/^\d+$/.test(raw) || Number(raw) >= strings.length) invalid();
            value = strings[Number(raw)];
          } else if (cell.attributes.t === "inlineStr") value = textRuns(cell);
          else if (cell.attributes.t === "b")
            value = raw === "1" ? "TRUE" : raw === "0" ? "FALSE" : raw;
          if (child(cell, "f") && !value)
            value = "[Formula has no saved result]";
          const text = value ? `${address}: ${value}` : "";
          extractedLength += text.length + 3;
          // Shared strings can be referenced repeatedly: bound expansion before
          // assembling rows, not just after the whole worksheet is in memory.
          if (extractedLength > MAX_DOCUMENT_TEXT) tooLarge();
          return text;
        })
        .filter(Boolean);
      if (!/^\d+$/.test(row.attributes.r ?? "")) invalid();
      if (!cells.length) continue;
      items.push({
        text: cells.join(" | "),
        reference: `Row ${row.attributes.r}`,
        group: sheet.attributes.name || "Worksheet",
      });
    }
  }
  return sections(items);
}

function csv(text: string): TextItem[] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  const finishField = () => {
    row.push(field);
    field = "";
    closed = false;
    if (row.length > 500) tooLarge();
  };
  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
    if (rows.length > 10_000) tooLarge();
  };
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (quoted) {
      if (character === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += character;
    } else if (character === ",") finishField();
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[i + 1] === "\n") i++;
      finishRow();
    } else if (character === '"' && !field && !closed) quoted = true;
    else if (closed || character === '"')
      invalid("This CSV has malformed quoted fields.");
    else field += character;
  }
  if (quoted) invalid("This CSV has an unclosed quoted field.");
  if (field || closed || row.length) finishRow();
  return rows.map((fields, index) => ({
    text: fields
      .map((value, column) => `Column ${column + 1}: ${value}`)
      .join(" | "),
    reference: `CSV row ${index + 1}`,
  }));
}

export function extractOfficeOrText(
  bytes: Uint8Array,
  format: Exclude<DocumentFormat, "pdf">,
): SourcePage[] {
  try {
    if (format === "docx") return word(bytes);
    if (format === "xlsx") return spreadsheet(bytes);
    const text = decode(bytes);
    return sections(
      format === "csv"
        ? csv(text)
        : text
            .split(/\r\n|\n|\r/)
            .map((text, index) => ({ text, reference: `Line ${index + 1}` })),
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return invalid();
  }
}
