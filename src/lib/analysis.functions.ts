import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type MediaKind = "image" | "audio" | "video";

export type Signal = {
  title: string;
  detail: string;
  meaning: string;
  strength: "weak" | "moderate" | "strong";
  direction: "authentic" | "synthetic" | "neutral";
};

export type AnalysisReport = {
  kind: MediaKind;
  fileName: string;
  verdict: "likely-authentic" | "unclear" | "signs-of-manipulation" | "likely-ai-generated";
  verdictLabel: string;
  confidence: number;
  summary: string;
  signals: Signal[];
  caveats: string[];
  verifySteps: string[];
  metadata: { fields: { label: string; value: string }[]; notes: string[]; aiMarkers: string[] };
  degraded?: string;
};

const MAX_BYTES = 18 * 1024 * 1024;

const InputSchema = z.object({
  kind: z.enum(["image", "audio", "video"]),
  fileName: z.string().min(1).max(300),
  mimeType: z.string().min(1).max(200),
  dataBase64: z.string().min(16).optional(),
  url: z.string().url().optional(),
  context: z.string().max(1000).optional(),
});

const SYSTEM_PROMPT = `You are a careful digital media forensics analyst working for a public verification tool used by journalists and ordinary citizens.

Examine the supplied media for evidence of AI generation or manipulation. Look for things such as: texture and skin rendering artifacts, impossible or inconsistent lighting and shadows, garbled text, malformed hands/teeth/ears, repeated patterns, edge and blending artifacts around inserted or removed objects, physically impossible reflections, resolution mismatches; for audio: unnatural breathing, missing room tone, over-smooth prosody, clipped consonants, splice points, inconsistent background noise; for video: frame-to-frame instability, flickering identity features, lip-sync mismatch, unnatural blinking, warped backgrounds during motion.

Rules you must follow:
- Be honest about uncertainty. Detection is probabilistic and never proof. If the evidence is thin, say the result is unclear.
- Never invent metadata, provenance, camera details, or web sources. Judge only what you can observe in the media itself.
- Write for a non-expert: short sentences, no jargon without a plain explanation.
- Cite the specific thing you saw or heard, and where in the media, so a person can check it themselves.

Reply with json only, matching exactly this shape:
{
  "verdict": "likely-authentic" | "unclear" | "signs-of-manipulation" | "likely-ai-generated",
  "confidence": 0-100 integer,
  "summary": "3-5 sentence plain-English explanation of your reasoning",
  "signals": [{"title": "short label", "detail": "what you observed and where", "meaning": "why this matters, one sentence", "strength": "weak"|"moderate"|"strong", "direction": "authentic"|"synthetic"|"neutral"}],
  "caveats": ["what could not be determined, or what would change your assessment"],
  "verifySteps": ["concrete manual steps this person can take to verify the content themselves"]
}
Include between 3 and 8 signals, 2-4 caveats and 3-5 verify steps.`;

const VERDICT_LABELS: Record<AnalysisReport["verdict"], string> = {
  "likely-authentic": "No strong signs of AI generation",
  unclear: "Inconclusive",
  "signs-of-manipulation": "Signs of manipulation",
  "likely-ai-generated": "Likely AI-generated",
};

function normalizeStrength(value: unknown): Signal["strength"] {
  return value === "strong" || value === "moderate" || value === "weak" ? value : "moderate";
}

function normalizeDirection(value: unknown): Signal["direction"] {
  return value === "authentic" || value === "synthetic" || value === "neutral" ? value : "neutral";
}

function parseModelJson(text: string) {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) candidates.push(fenced[1]);
  const braced = trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  if (braced.length > 2) candidates.push(braced);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      /* try next */
    }
  }
  return null;
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function audioFormat(mimeType: string) {
  const type = mimeType.toLowerCase();
  if (type.includes("wav")) return "wav";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("webm")) return "webm";
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("flac")) return "flac";
  return "mp3";
}

export const analyzeMedia = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<AnalysisReport> => {
    const { extractMetadata } = await import("./media-metadata");
    const { callGatewayText, GatewayError } = await import("./ai-gateway.server");

    let bytes: Uint8Array;
    let mimeType = data.mimeType;
    let fileName = data.fileName;

    if (data.dataBase64) {
      const binary = atob(data.dataBase64);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } else if (data.url) {
      let response: Response;
      try {
        response = await fetch(data.url, { redirect: "follow" });
      } catch {
        throw new Error("That link could not be opened. Check it, or upload the file instead.");
      }
      if (!response.ok) {
        throw new Error(
          `That link returned an error (${response.status}). Try uploading the file instead.`,
        );
      }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_BYTES) {
        throw new Error("That file is larger than 18 MB. Try a shorter clip or a smaller file.");
      }
      bytes = new Uint8Array(buffer);
      mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || mimeType;
      const last = new URL(data.url).pathname.split("/").filter(Boolean).pop();
      if (last) fileName = decodeURIComponent(last);
    } else {
      throw new Error("Upload a file or paste a link first.");
    }

    if (bytes.byteLength > MAX_BYTES) {
      throw new Error("That file is larger than 18 MB. Try a shorter clip or a smaller file.");
    }
    if (bytes.byteLength < 64) {
      throw new Error("That file looks empty or could not be read.");
    }

    const metadata = extractMetadata(bytes, {
      fileName,
      mimeType,
      size: bytes.byteLength,
    });

    const base64 = data.dataBase64 ?? base64FromBytes(bytes);
    const dataUrl = `data:${mimeType || "application/octet-stream"};base64,${base64}`;

    const instruction = [
      `Analyze this ${data.kind} for signs of AI generation or manipulation.`,
      data.context ? `Context provided by the person checking it: ${data.context}` : "",
      "Respond with json only.",
    ]
      .filter(Boolean)
      .join("\n");

    const content =
      data.kind === "image"
        ? ([
            { type: "text", text: instruction },
            { type: "image_url", image_url: { url: dataUrl } },
          ] as const)
        : data.kind === "video"
          ? ([
              { type: "text", text: instruction },
              { type: "video_url", video_url: { url: dataUrl } },
            ] as const)
          : ([
              { type: "text", text: instruction },
              {
                type: "input_audio",
                input_audio: { data: base64, format: audioFormat(mimeType) },
              },
            ] as const);

    let text: string;
    try {
      text = await callGatewayText({
        model: "google/gemini-3.7-flash",
        system: SYSTEM_PROMPT,
        content: [...content],
      });
    } catch (error) {
      if (error instanceof GatewayError) {
        if (error.status === 429) {
          throw new Error("The analysis service is busy right now. Wait a moment and try again.");
        }
        if (error.status === 402) {
          throw new Error(
            "The analysis service has run out of credits. The site owner needs to top up.",
          );
        }
        throw new Error(error.message);
      }
      throw error;
    }

    const parsed = parseModelJson(text);

    if (!parsed) {
      return {
        kind: data.kind,
        fileName,
        verdict: "unclear",
        verdictLabel: VERDICT_LABELS.unclear,
        confidence: 0,
        summary:
          "The analysis came back in an unreadable form, so no assessment of the content itself is available. The embedded file details below were still read successfully.",
        signals: [],
        caveats: ["The content analysis did not complete. Try again with the same file."],
        verifySteps: [
          "Run a reverse image or video search to find where else this appears.",
          "Look for the earliest version of the file you can find and compare them.",
          "Ask the person who shared it where they got it.",
        ],
        metadata,
        degraded: "The content analysis could not be read. Only file details are shown.",
      };
    }

    const verdictRaw = String(parsed["verdict"] ?? "unclear");
    const verdict = (
      Object.keys(VERDICT_LABELS).includes(verdictRaw) ? verdictRaw : "unclear"
    ) as AnalysisReport["verdict"];
    const confidenceRaw = Number(parsed["confidence"]);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(100, Math.round(confidenceRaw)))
      : 50;

    const signals = Array.isArray(parsed["signals"])
      ? (parsed["signals"] as Record<string, unknown>[]).slice(0, 10).map((raw) => ({
          title: String(raw["title"] ?? "Observation"),
          detail: String(raw["detail"] ?? ""),
          meaning: String(raw["meaning"] ?? ""),
          strength: normalizeStrength(raw["strength"]),
          direction: normalizeDirection(raw["direction"]),
        }))
      : [];

    const toStrings = (value: unknown, fallback: string[]) =>
      Array.isArray(value) && value.length > 0
        ? (value as unknown[]).slice(0, 8).map((entry) => String(entry))
        : fallback;

    return {
      kind: data.kind,
      fileName,
      verdict,
      verdictLabel: VERDICT_LABELS[verdict],
      confidence,
      summary: String(parsed["summary"] ?? "No summary was produced."),
      signals,
      caveats: toStrings(parsed["caveats"], [
        "Detection is probabilistic. A clean result is not proof of authenticity.",
      ]),
      verifySteps: toStrings(parsed["verifySteps"], [
        "Run a reverse image or video search to find earlier copies.",
        "Check whether reputable outlets have covered the same event.",
        "Ask the original poster for the unedited file.",
      ]),
      metadata,
    };
  });
