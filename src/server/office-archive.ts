import { Inflate, strFromU8 } from "fflate";
import { HttpError } from "./http.ts";

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function invalid(): never {
  throw new HttpError(
    422,
    "This Office archive is damaged, encrypted or uses an unsupported ZIP structure.",
  );
}
function tooLarge(): never {
  throw new HttpError(
    413,
    "The Office archive is too large or complex. Split it into smaller files.",
  );
}

/** Read ordinary single-disk ZIPs. Never inflate unselected media or linked objects.
 * ZIP64 is unnecessary within the 30 MB pilot envelope and is rejected explicitly.
 */
export function boundedOfficeArchive(
  bytes: Uint8Array,
  include: (name: string) => boolean,
): Record<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, true);
  const u32 = (offset: number) => view.getUint32(offset, true);
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65_557); end--)
    if (u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length)
      break;
  if (end < Math.max(0, bytes.length - 65_557)) invalid();
  const count = u16(end + 10),
    directory = u32(end + 16);
  if (
    u16(end + 4) ||
    u16(end + 6) ||
    u16(end + 8) !== count ||
    count === 0xffff ||
    directory + u32(end + 12) !== end
  )
    invalid();
  if (count > 2000) tooLarge();
  const names = new Set<string>();
  const entries: {
    name: string;
    size: number;
    crc: number;
    method: number;
    data: Uint8Array;
  }[] = [];
  let cursor = directory,
    expanded = 0,
    selected = 0;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) invalid();
    const flags = u16(cursor + 8),
      method = u16(cursor + 10),
      crc = u32(cursor + 16);
    const compressed = u32(cursor + 20),
      size = u32(cursor + 24),
      nameLength = u16(cursor + 28);
    const next = cursor + 46 + nameLength + u16(cursor + 30) + u16(cursor + 32);
    const local = u32(cursor + 42);
    if (next > end || flags & 1 || u16(cursor + 34) || local + 30 > directory)
      invalid();
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = strFromU8(nameBytes, !(flags & 2048));
    if (
      names.has(name) ||
      /(^\/|\\|(^|\/)\.\.(\/|$)|[\u0000-\u001f])/.test(name)
    )
      invalid();
    names.add(name);
    if (/(vbaProject|activeX|embeddings)/i.test(name))
      throw new HttpError(
        422,
        "Macro-enabled files and embedded objects are not supported.",
      );
    expanded += size;
    if (expanded > 80_000_000) tooLarge();
    if (
      u32(local) !== 0x04034b50 ||
      u16(local + 6) !== flags ||
      u16(local + 8) !== method ||
      u16(local + 26) !== nameLength
    )
      invalid();
    const start = local + 30 + nameLength + u16(local + 28);
    if (
      start + compressed > directory ||
      !nameBytes.every((value, i) => value === bytes[local + 30 + i])
    )
      invalid();
    if (
      !(flags & 8) &&
      (u32(local + 14) !== crc ||
        u32(local + 18) !== compressed ||
        u32(local + 22) !== size)
    )
      invalid();
    if (include(name)) {
      selected += size;
      if (size > 4_000_000 || compressed > 4_000_000 || selected > 8_000_000)
        tooLarge();
      if (method !== 0 && method !== 8) invalid();
      entries.push({
        name,
        size,
        crc,
        method,
        data: bytes.subarray(start, start + compressed),
      });
    }
    cursor = next;
  }
  if (cursor !== end) invalid();
  const files: Record<string, Uint8Array> = Object.create(null);
  for (const entry of entries) {
    const output = new Uint8Array(entry.size);
    let written = 0,
      checksum = 0xffffffff;
    const receive = (chunk: Uint8Array) => {
      if (written + chunk.length > entry.size) invalid();
      for (const byte of chunk)
        checksum = crcTable[(checksum ^ byte) & 255] ^ (checksum >>> 8);
      output.set(chunk, written);
      written += chunk.length;
    };
    if (entry.method === 0) receive(entry.data);
    else {
      const inflater = new Inflate(receive);
      // Bounded input per push also bounds expansion BEFORE the callback can stop it.
      for (let offset = 0; offset < entry.data.length; offset += 512)
        inflater.push(
          entry.data.subarray(offset, offset + 512),
          offset + 512 >= entry.data.length,
        );
    }
    if (written !== entry.size || (checksum ^ 0xffffffff) >>> 0 !== entry.crc)
      invalid();
    files[entry.name] = output;
  }
  return files;
}
