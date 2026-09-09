import { PDFDocument, StandardFonts, degrees } from "pdf-lib";

export async function samplePdf(
  pageCount = 1,
  text = "Shop drawings are due within 14 calendar days.",
) {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date("2026-01-01T00:00:00Z"));
  pdf.setModificationDate(new Date("2026-01-01T00:00:00Z"));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pageCount; index++) {
    const page = pdf.addPage([612, 792]);
    page.drawText("SYNTHETIC CONSTRUCTION FIXTURE", {
      x: 48,
      y: 735,
      size: 16,
      font,
    });
    page.drawText(text, { x: 48, y: 690, size: 12, font });
    page.drawText("Item                     Quantity", {
      x: 48,
      y: 640,
      size: 12,
      font,
    });
    page.drawText("Doors                   12", {
      x: 48,
      y: 618,
      size: 12,
      font,
    });
  }
  return new Uint8Array(await pdf.save({ useObjectStreams: false }));
}

export async function specialPdf(kind: "rotated" | "blank" | "image") {
  const pdf = await PDFDocument.load(await samplePdf());
  if (kind === "rotated") pdf.getPage(0).setRotation(degrees(90));
  else if (kind === "blank") pdf.addPage([612, 792]);
  else {
    const image = await pdf.embedPng(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2uoAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const page = pdf.addPage([612, 792]);
    page.drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
  }
  return new Uint8Array(await pdf.save({ useObjectStreams: false }));
}
