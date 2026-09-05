import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useRef, useState } from "react";
import { Image as ImageIcon, AudioLines, Video, Upload, Link2, Loader2 } from "lucide-react";
import { analyzeMedia, type AnalysisReport, type MediaKind } from "@/lib/analysis.functions";
import { ReportView } from "@/components/report-view";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TruthLens — Check if an image, audio or video is AI-generated" },
      {
        name: "description",
        content:
          "Upload or link an image, audio clip or video and get a plain-English assessment of whether it shows signs of AI generation or manipulation, with the evidence explained.",
      },
      { property: "og:title", content: "TruthLens — Check media before you trust it" },
      {
        property: "og:description",
        content:
          "Detect and understand AI-generated or manipulated images, audio and video, with explained reasoning and file-level evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const TABS: { kind: MediaKind; label: string; icon: typeof ImageIcon; accept: string }[] = [
  { kind: "image", label: "Image", icon: ImageIcon, accept: "image/*" },
  { kind: "audio", label: "Audio", icon: AudioLines, accept: "audio/*" },
  { kind: "video", label: "Video", icon: Video, accept: "video/*" },
];

const STEPS = [
  "Reading the file",
  "Checking embedded details",
  "Examining the content",
  "Writing the explanation",
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function Index() {
  const analyze = useServerFn(analyzeMedia);
  const [kind, setKind] = useState<MediaKind>("image");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [context, setContext] = useState("");
  const [status, setStatus] = useState<"idle" | "working">("idle");
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeTab = TABS.find((tab) => tab.kind === kind)!;

  const run = useCallback(async () => {
    setError(null);
    if (!file && !url.trim()) {
      setError("Choose a file or paste a link first.");
      return;
    }
    if (file && file.size > 18 * 1024 * 1024) {
      setError("That file is larger than 18 MB. Try a shorter clip or a smaller file.");
      return;
    }
    setStatus("working");
    setStep(0);
    const timers = [
      setTimeout(() => setStep(1), 900),
      setTimeout(() => setStep(2), 2200),
      setTimeout(() => setStep(3), 9000),
    ];
    try {
      const payload = file
        ? {
            kind,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            dataBase64: await fileToBase64(file),
            context: context.trim() || undefined,
          }
        : {
            kind,
            fileName: "linked-file",
            mimeType: "application/octet-stream",
            url: url.trim(),
            context: context.trim() || undefined,
          };
      const result = await analyze({ data: payload });
      setReport(result);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Try again.");
    } finally {
      timers.forEach(clearTimeout);
      setStatus("idle");
    }
  }, [analyze, context, file, kind, url]);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <span className="font-display text-xl tracking-tight">
            Truth<span className="text-primary">Lens</span>
          </span>
          <Link to="/about" className="text-sm text-muted-foreground hover:text-foreground">
            How it works
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
        {report ? (
          <ReportView
            report={report}
            onReset={() => {
              setReport(null);
              setFile(null);
              setUrl("");
              setContext("");
            }}
          />
        ) : (
          <>
            <section className="max-w-3xl">
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
                Media authenticity check
              </p>
              <h1 className="mt-4 font-display text-4xl leading-[1.05] sm:text-6xl">
                Before you believe it, before you share it — check it.
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                Drop in an image, an audio clip or a video. TruthLens looks for the fingerprints of
                AI generation and editing, explains what it found in plain language, and shows you
                the evidence buried inside the file itself.
              </p>
            </section>

            <section className="mt-10 rounded-lg border border-border bg-card p-5 sm:p-7">
              <div className="flex flex-wrap gap-2">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = tab.kind === kind;
                  return (
                    <button
                      key={tab.kind}
                      onClick={() => {
                        setKind(tab.kind);
                        setFile(null);
                        setError(null);
                      }}
                      className={`inline-flex items-center gap-2 rounded border px-4 py-2 text-sm transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" /> {tab.label}
                    </button>
                  );
                })}
              </div>

              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const dropped = event.dataTransfer.files?.[0];
                  if (dropped) {
                    setFile(dropped);
                    setUrl("");
                    setError(null);
                  }
                }}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
                }}
                className={`mt-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-14 text-center transition-colors ${
                  dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
                }`}
              >
                <Upload className="h-7 w-7 text-muted-foreground" />
                <p className="mt-3 text-base">
                  {file ? file.name : `Drop your ${activeTab.label.toLowerCase()} here`}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {file
                    ? `${(file.size / (1024 * 1024)).toFixed(2)} MB — click to choose a different file`
                    : "or click to browse · up to 18 MB · nothing is stored"}
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept={activeTab.accept}
                  className="hidden"
                  onChange={(event) => {
                    const picked = event.target.files?.[0];
                    if (picked) {
                      setFile(picked);
                      setUrl("");
                      setError(null);
                    }
                  }}
                />
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    Or paste a direct link
                  </span>
                  <div className="mt-2 flex items-center gap-2 rounded border border-input bg-background px-3">
                    <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                      value={url}
                      onChange={(event) => {
                        setUrl(event.target.value);
                        if (event.target.value) setFile(null);
                      }}
                      placeholder="https://example.com/photo.jpg"
                      className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    Context (optional)
                  </span>
                  <input
                    value={context}
                    onChange={(event) => setContext(event.target.value)}
                    placeholder="Where did you see it? What is it claimed to show?"
                    className="mt-2 w-full rounded border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
                  />
                </label>
              </div>

              {error ? (
                <p className="mt-4 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <button
                onClick={() => void run()}
                disabled={status === "working"}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
              >
                {status === "working" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {status === "working" ? "Analyzing…" : "Analyze this file"}
              </button>

              {status === "working" ? (
                <ol className="mt-5 space-y-2">
                  {STEPS.map((label, index) => (
                    <li
                      key={label}
                      className={`flex items-center gap-3 text-sm ${
                        index <= step ? "text-foreground" : "text-muted-foreground/60"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          index < step
                            ? "bg-success"
                            : index === step
                              ? "animate-pulse bg-primary"
                              : "bg-muted"
                        }`}
                      />
                      {label}
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>

            <section className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                {
                  title: "It explains itself",
                  body: "Every assessment lists the specific things that were seen or heard, how strong each one is, and why it matters — so you can judge the reasoning, not just the verdict.",
                },
                {
                  title: "It shows the file's own evidence",
                  body: "Camera details, capture dates, editing-software traces and content-credential markers are read straight from the file and kept separate from the AI's opinion.",
                },
                {
                  title: "It hands the check back to you",
                  body: "Each report ends with concrete steps — reverse searches, source questions, what to look at — because detection is a starting point, never proof.",
                },
              ].map((item) => (
                <div key={item.title} className="border-t border-border pt-5">
                  <h2 className="font-display text-xl">{item.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </section>
          </>
        )}
      </div>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-5 py-6 text-xs text-muted-foreground">
          TruthLens gives probabilistic assessments, not verdicts of fact. Files are analyzed and
          discarded — nothing is stored.
        </div>
      </footer>
    </main>
  );
}
