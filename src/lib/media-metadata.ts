export type MetadataField = { label: string; value: string };

export type MediaMetadata = {
  fields: MetadataField[];
  notes: string[];
  aiMarkers: string[];
};

function fmtBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const EXIF_TAGS: Record<number, string> = {
  0x010f: "Camera make",
  0x0110: "Camera model",
  0x0131: "Software",
  0x0132: "File date",
  0x9003: "Capture date",
  0x829a: "Exposure time",
  0x8827: "ISO",
  0x920a: "Focal length",
  0x001d: "GPS date",
};

function readJpeg(view: DataView, bytes: Uint8Array, out: MediaMetadata) {
  let offset = 2;
  while (offset < view.byteLength - 4) {
    if (view.getUint8(offset) !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = view.getUint8(offset + 1);
    const size = view.getUint16(offset + 2);
    // SOF markers carry the dimensions
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const height = view.getUint16(offset + 5);
      const width = view.getUint16(offset + 7);
      out.fields.push({ label: "Dimensions", value: `${width} x ${height} px` });
    }
    if (marker === 0xe1) {
      const header = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 10));
      if (header.startsWith("Exif")) readExif(view, offset + 10, out);
    }
    if (marker === 0xda) break;
    if (size <= 0) break;
    offset += 2 + size;
  }
}

function readExif(view: DataView, tiffStart: number, out: MediaMetadata) {
  try {
    const little = view.getUint16(tiffStart) === 0x4949;
    const firstIfd = view.getUint32(tiffStart + 4, little);
    const readIfd = (ifdOffset: number) => {
      const base = tiffStart + ifdOffset;
      const count = view.getUint16(base, little);
      for (let i = 0; i < count; i++) {
        const entry = base + 2 + i * 12;
        const tag = view.getUint16(entry, little);
        const type = view.getUint16(entry + 2, little);
        const numValues = view.getUint32(entry + 4, little);
        if (tag === 0x8769) {
          readIfd(view.getUint32(entry + 8, little));
          continue;
        }
        const label = EXIF_TAGS[tag];
        if (!label) continue;
        if (type === 2) {
          const length = numValues;
          const valueOffset =
            length > 4 ? tiffStart + view.getUint32(entry + 8, little) : entry + 8;
          const chars: string[] = [];
          for (let c = 0; c < length - 1; c++) {
            const code = view.getUint8(valueOffset + c);
            if (code === 0) break;
            chars.push(String.fromCharCode(code));
          }
          const value = chars.join("").trim();
          if (value) out.fields.push({ label, value });
        } else if (type === 3) {
          out.fields.push({ label, value: String(view.getUint16(entry + 8, little)) });
        } else if (type === 4) {
          out.fields.push({ label, value: String(view.getUint32(entry + 8, little)) });
        }
      }
    };
    readIfd(firstIfd);
  } catch {
    /* malformed EXIF is not fatal */
  }
}

function readPng(view: DataView, bytes: Uint8Array, out: MediaMetadata) {
  let offset = 8;
  const decoder = new TextDecoder();
  while (offset + 8 < bytes.length) {
    const length = view.getUint32(offset);
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      out.fields.push({
        label: "Dimensions",
        value: `${view.getUint32(offset + 8)} x ${view.getUint32(offset + 12)} px`,
      });
    }
    if (type === "tEXt" || type === "iTXt") {
      const text = decoder.decode(data).replace(/\0/g, ": ").trim();
      if (text) out.fields.push({ label: "Embedded text", value: text.slice(0, 400) });
    }
    if (length === 0 && type === "IEND") break;
    offset += 12 + length;
  }
}

function readIsoBmff(bytes: Uint8Array, view: DataView, out: MediaMetadata) {
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    let size = view.getUint32(offset);
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    if (size === 1 && offset + 16 <= bytes.length) {
      size = Number(view.getBigUint64(offset + 8));
    }
    if (type === "ftyp") {
      out.fields.push({
        label: "Container brand",
        value: decoder.decode(bytes.subarray(offset + 8, offset + 12)).trim(),
      });
    }
    if (type === "moov" || type === "trak" || type === "mdia") {
      // descend into container boxes
      offset += 8;
      continue;
    }
    if (type === "mvhd") {
      const version = view.getUint8(offset + 8);
      const timescale = version === 1 ? view.getUint32(offset + 28) : view.getUint32(offset + 20);
      const duration =
        version === 1 ? Number(view.getBigUint64(offset + 32)) : view.getUint32(offset + 24);
      if (timescale > 0 && duration > 0) {
        out.fields.push({ label: "Duration", value: `${(duration / timescale).toFixed(1)} s` });
      }
    }
    if (size <= 0) break;
    offset += size;
  }
}

const AI_MARKER_PATTERNS: Array<[RegExp, string]> = [
  [/c2pa/i, "C2PA content credentials block"],
  [/jumbf|jumd/i, "JUMBF provenance container"],
  [/stable[\s-]?diffusion/i, "Stable Diffusion generation data"],
  [/midjourney/i, "Midjourney reference"],
  [/dall[\s.-]?e/i, "DALL·E reference"],
  [/openai/i, "OpenAI reference"],
  [/sora/i, "Sora reference"],
  [/firefly|adobe/i, "Adobe / Firefly reference"],
  [/gemini|imagen|veo/i, "Google generative model reference"],
  [/runway|pika|kling|luma/i, "AI video tool reference"],
  [/elevenlabs|resemble\.ai|play\.ht/i, "AI voice tool reference"],
  [/photoshop|lightroom|gimp|snapseed|facetune/i, "Photo-editing software trace"],
  [/premiere|final cut|davinci|capcut/i, "Video-editing software trace"],
];

export function extractMetadata(
  bytes: Uint8Array,
  info: { fileName: string; mimeType: string; size: number },
): MediaMetadata {
  const out: MediaMetadata = { fields: [], notes: [], aiMarkers: [] };
  out.fields.push({ label: "File name", value: info.fileName });
  out.fields.push({ label: "Declared type", value: info.mimeType || "unknown" });
  out.fields.push({ label: "File size", value: fmtBytes(info.size) });

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      out.fields.push({ label: "Detected format", value: "JPEG" });
      readJpeg(view, bytes, out);
    } else if (bytes[0] === 0x89 && bytes[1] === 0x50) {
      out.fields.push({ label: "Detected format", value: "PNG" });
      readPng(view, bytes, out);
    } else if (
      bytes.length > 12 &&
      String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!) === "ftyp"
    ) {
      out.fields.push({ label: "Detected format", value: "MP4 / MOV container" });
      readIsoBmff(bytes, view, out);
    } else if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      out.fields.push({ label: "Detected format", value: "MP3 (ID3 tagged)" });
    } else if (String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) === "RIFF") {
      out.fields.push({ label: "Detected format", value: "RIFF (WAV / WebP / AVI)" });
    } else if (bytes[0] === 0x1a && bytes[1] === 0x45) {
      out.fields.push({ label: "Detected format", value: "Matroska / WebM" });
    }
  } catch {
    out.notes.push("Some embedded details could not be read from this file.");
  }

  // Scan a bounded window of the head and tail for provenance / tool markers.
  const decoder = new TextDecoder("latin1" as unknown as string, { fatal: false });
  const head = decoder.decode(bytes.subarray(0, Math.min(bytes.length, 262144)));
  const tail = decoder.decode(bytes.subarray(Math.max(0, bytes.length - 131072)));
  const haystack = `${head}\n${tail}`;
  for (const [pattern, label] of AI_MARKER_PATTERNS) {
    if (pattern.test(haystack) && !out.aiMarkers.includes(label)) out.aiMarkers.push(label);
  }

  const hasCamera = out.fields.some((f) => f.label === "Camera make" || f.label === "Camera model");
  const hasDate = out.fields.some((f) => f.label.includes("date"));
  if (!hasCamera && !hasDate) {
    out.notes.push(
      "No camera or capture-date information is embedded in this file. That is normal for anything downloaded from social media, screenshotted, or re-saved — and it is also what AI-generated files usually look like. On its own it proves nothing.",
    );
  }
  if (hasCamera) {
    out.notes.push(
      "Camera details are embedded in this file. They are useful context, but they can be copied or faked, so treat them as a clue rather than proof.",
    );
  }

  return out;
}
