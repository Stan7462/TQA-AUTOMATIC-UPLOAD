/** ZIP entries are stored without another compression pass because JPEG data is already compressed. */
export type ZipEntry = { name: string; data: Uint8Array; modifiedAt: Date };

const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  return value >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; day: number } {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function localHeader(name: Uint8Array, data: Uint8Array, crc: number, date: Date): Uint8Array {
  const bytes = new Uint8Array(30 + name.length);
  const view = new DataView(bytes.buffer);
  const stamp = dosDateTime(date);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true); // UTF-8 names
  view.setUint16(8, 0, true); // Stored, not deflated
  view.setUint16(10, stamp.time, true);
  view.setUint16(12, stamp.day, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, name.length, true);
  bytes.set(name, 30);
  return bytes;
}

function centralHeader(name: Uint8Array, data: Uint8Array, crc: number, date: Date, offset: number): Uint8Array {
  const bytes = new Uint8Array(46 + name.length);
  const view = new DataView(bytes.buffer);
  const stamp = dosDateTime(date);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, stamp.time, true);
  view.setUint16(14, stamp.day, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, data.length, true);
  view.setUint32(24, data.length, true);
  view.setUint16(28, name.length, true);
  view.setUint32(42, offset, true);
  bytes.set(name, 46);
  return bytes;
}

function endRecord(count: number, centralSize: number, centralOffset: number): Uint8Array {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  return bytes;
}

async function* zipChunks(entries: AsyncIterable<ZipEntry>): AsyncGenerator<Uint8Array> {
  const central: Uint8Array[] = [];
  let offset = 0;
  for await (const entry of entries) {
    const name = encoder.encode(entry.name);
    if (!name.length || name.length > 0xffff || entry.data.length > 0xffffffff || central.length >= 0xffff) throw new Error("ZIP archive is too large");
    const crc = crc32(entry.data);
    const header = localHeader(name, entry.data, crc, entry.modifiedAt);
    if (offset + header.length + entry.data.length >= 0xffffffff) throw new Error("ZIP archive is too large");
    central.push(centralHeader(name, entry.data, crc, entry.modifiedAt, offset));
    yield header;
    yield entry.data;
    offset += header.length + entry.data.length;
  }
  const centralOffset = offset;
  for (const header of central) {
    if (offset + header.length >= 0xffffffff) throw new Error("ZIP archive is too large");
    yield header;
    offset += header.length;
  }
  yield endRecord(central.length, offset - centralOffset, centralOffset);
}

export function zipStream(entries: AsyncIterable<ZipEntry>): ReadableStream<Uint8Array> {
  const iterator = zipChunks(entries)[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (error) { controller.error(error); }
    },
    async cancel() { await iterator.return?.(undefined); },
  });
}
