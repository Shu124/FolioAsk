import { zipSync, strToU8 } from "fflate";

export function officeFixture(
  format: "docx" | "xlsx",
  extra: Record<string, string> = {},
) {
  const word = format === "docx";
  const files: Record<string, string> = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/${word ? "word/document.xml" : "xl/workbook.xml"}" ContentType="application/vnd.openxmlformats-officedocument.${word ? "wordprocessingml.document" : "spreadsheetml.sheet"}.main+xml"/></Types>`,
    ...(word
      ? {
          "word/document.xml":
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Shop drawings are due within 14 calendar days.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Doors</w:t><w:tab/><w:t>12</w:t><w:br/><w:t>units</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
        }
      : {
          "xl/workbook.xml":
            '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Quantities" sheetId="1" r:id="rId1"/></sheets></workbook>',
          "xl/_rels/workbook.xml.rels":
            '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
          "xl/sharedStrings.xml": "<sst><si><t>Doors</t></si></sst>",
          "xl/worksheets/sheet1.xml":
            '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>12</v></c></row><row r="2"><c r="B2"><f>B1*2</f><v>24</v></c></row></sheetData></worksheet>',
        }),
    ...extra,
  };
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, text]) => [name, strToU8(text)]),
    ),
  );
}
