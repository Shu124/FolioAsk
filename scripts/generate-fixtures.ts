import { mkdir, writeFile } from "node:fs/promises";
import { samplePdf } from "../tests/fixtures/pdf.ts";

const bytes = await samplePdf();
await mkdir("public/fixtures", { recursive: true });
await writeFile("public/fixtures/contract.pdf", bytes);
const hash = Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString(
  "hex",
);
console.log(`Synthetic contract SHA-256: ${hash}`);
