# TruthLens — AI media authenticity checker

A single-page web tool where anyone can drop in an image, audio clip, or video (file upload or link) and get a clear, explained verdict on whether it shows signs of AI generation or manipulation. No sign-in, nothing stored.

## What the user experiences

1. **Landing / analyzer page** — bold, editorial dark look (not the usual purple-gradient template), a large drop zone with tabs for Image / Audio / Video, plus a "paste a link" field.
2. **Analyzing state** — step-by-step progress (reading the file, checking embedded details, examining the content, writing the explanation) so the wait feels transparent.
3. **Report** — everything on one scrollable page:
   - A verdict band: Likely authentic / Unclear / Signs of manipulation / Likely AI-generated, with a confidence meter.
   - Plain-English summary of the reasoning, written for a non-expert.
   - A list of specific signals found, each with a short "why this matters" note and a strength rating (e.g. skin/texture artifacts, lighting inconsistency, warped text or hands, unnatural breathing or cadence in audio, frame-to-frame inconsistency in video).
   - **Evidence & provenance panel** built from the file itself: file type, size, dimensions/duration, camera or device info, capture date, editing-software traces, C2PA / AI-generator markers when present, and a note when metadata has been stripped.
   - **Verify it yourself** checklist: concrete manual steps (reverse image search links, what to look at in the media, who to ask) so the tool teaches rather than dictates.
   - A prominent honesty note that detection is probabilistic and never proof.
4. **Share / export** — copy a text summary or print the report to PDF. No server-side history.

## How it works behind the scenes

- Uploads are held in the browser; the file is sent to a server function only for the duration of the analysis and never persisted.
- Analysis runs through Lovable AI (Gemini multimodal, which accepts image, audio and video input) with a strict forensic-analyst prompt and a structured result schema: verdict, confidence, summary, signal list, and caveats.
- Video: sent as the clip itself for models that accept it, with sampled key frames also analyzed so long clips still work; audio is sent as the recording.
- Embedded metadata (EXIF / container tags / C2PA hints) is extracted separately and shown as fact, kept clearly distinct from the model's judgement.
- Link input: the file is fetched server-side, size/type validated, then treated like an upload.
- Limits and clear errors for oversized files, unsupported types, unreachable links, and AI service issues (rate limit, credits).

## Technical notes

- TanStack Start; the analyzer lives at `/` (replacing the placeholder), with `/about` explaining the method and limits.
- `src/routes/api/...` not needed: analysis via `createServerFn` in `src/lib/analysis.functions.ts`, calling the Lovable AI Gateway server-side; the API key stays on the server.
- Structured output via the AI SDK `Output.object` schema, with a graceful fallback if the model returns malformed JSON.
- Metadata parsing with a lightweight, edge-compatible parser (no native binaries).
- Design tokens in `src/styles.css`; no hardcoded colors in components.
- Per-route head metadata for title/description/social tags.

## Not in this version

Accounts, saved history, web fact-check/reverse-search automation, and team workspaces — the report links out for manual verification instead.
