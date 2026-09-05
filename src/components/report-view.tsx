import { AlertTriangle, CheckCircle2, HelpCircle, ShieldAlert, Copy, Printer } from "lucide-react";
import { useState } from "react";
import type { AnalysisReport } from "@/lib/analysis.functions";

const VERDICT_STYLES: Record<
  AnalysisReport["verdict"],
  { tone: string; bar: string; icon: typeof CheckCircle2; blurb: string }
> = {
  "likely-authentic": {
    tone: "text-success",
    bar: "bg-success",
    icon: CheckCircle2,
    blurb: "Nothing in this file stood out as artificial — but that is not the same as proof.",
  },
  unclear: {
    tone: "text-muted-foreground",
    bar: "bg-muted-foreground",
    icon: HelpCircle,
    blurb: "The evidence points both ways. Treat this as unresolved and verify it yourself.",
  },
  "signs-of-manipulation": {
    tone: "text-warning",
    bar: "bg-warning",
    icon: AlertTriangle,
    blurb: "Parts of this file look edited, altered, or reassembled.",
  },
  "likely-ai-generated": {
    tone: "text-danger",
    bar: "bg-danger",
    icon: ShieldAlert,
    blurb: "Several traits typical of AI-generated media were found.",
  },
};

const STRENGTH_LABEL = { weak: "Weak", moderate: "Moderate", strong: "Strong" } as const;

const DIRECTION_STYLE = {
  synthetic: "border-danger/40 text-danger",
  authentic: "border-success/40 text-success",
  neutral: "border-border text-muted-foreground",
} as const;

function reportToText(report: AnalysisReport) {
  return [
    `TruthLens report — ${report.fileName}`,
    `Verdict: ${report.verdictLabel} (confidence ${report.confidence}%)`,
    "",
    report.summary,
    "",
    "Signals:",
    ...report.signals.map((s) => `- [${STRENGTH_LABEL[s.strength]}] ${s.title}: ${s.detail}`),
    "",
    "File details:",
    ...report.metadata.fields.map((f) => `- ${f.label}: ${f.value}`),
    ...(report.metadata.aiMarkers.length
      ? ["", "Markers found in the file:", ...report.metadata.aiMarkers.map((m) => `- ${m}`)]
      : []),
    "",
    "Limits:",
    ...report.caveats.map((c) => `- ${c}`),
    "",
    "Verify it yourself:",
    ...report.verifySteps.map((v) => `- ${v}`),
    "",
    "Automated detection is probabilistic and is never proof on its own.",
  ].join("\n");
}

export function ReportView({ report, onReset }: { report: AnalysisReport; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const style = VERDICT_STYLES[report.verdict];
  const Icon = style.icon;

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Icon className={`mt-1 h-8 w-8 shrink-0 ${style.tone}`} aria-hidden="true" />
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Assessment
              </p>
              <h2 className={`font-display text-3xl leading-tight sm:text-4xl ${style.tone}`}>
                {report.verdictLabel}
              </h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">{style.blurb}</p>
            </div>
          </div>
          <div className="min-w-[10rem]">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Confidence
            </p>
            <p className="font-display text-3xl">{report.confidence}%</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className={`h-full ${style.bar}`} style={{ width: `${report.confidence}%` }} />
            </div>
          </div>
        </div>

        {report.degraded ? (
          <p className="mt-6 rounded border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            {report.degraded}
          </p>
        ) : null}

        <p className="mt-6 border-t border-border pt-6 text-base leading-relaxed text-foreground">
          {report.summary}
        </p>

        <div className="mt-6 flex flex-wrap gap-2 print:hidden">
          <button
            onClick={() => {
              void navigator.clipboard.writeText(reportToText(report));
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
          >
            <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy summary"}
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
          >
            <Printer className="h-4 w-4" /> Save as PDF
          </button>
          <button
            onClick={onReset}
            className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Check another file
          </button>
        </div>
      </section>

      {report.signals.length > 0 ? (
        <section>
          <h3 className="font-display text-2xl">What the analysis found</h3>
          <ul className="mt-4 space-y-3">
            {report.signals.map((signal, index) => (
              <li key={index} className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <h4 className="text-base font-semibold">{signal.title}</h4>
                  <span
                    className={`rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${DIRECTION_STYLE[signal.direction]}`}
                  >
                    {STRENGTH_LABEL[signal.strength]} ·{" "}
                    {signal.direction === "synthetic"
                      ? "points to AI/editing"
                      : signal.direction === "authentic"
                        ? "points to genuine"
                        : "neutral"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-foreground">{signal.detail}</p>
                {signal.meaning ? (
                  <p className="mt-2 text-sm italic text-muted-foreground">
                    Why it matters: {signal.meaning}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="font-display text-2xl">Evidence inside the file</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Read directly from the file, not judged by the analysis.
        </p>
        <dl className="mt-4 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
          {report.metadata.fields.map((field, index) => (
            <div key={index} className="bg-card p-4">
              <dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {field.label}
              </dt>
              <dd className="mt-1 break-words text-sm">{field.value}</dd>
            </div>
          ))}
        </dl>
        {report.metadata.aiMarkers.length > 0 ? (
          <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-4">
            <p className="text-sm font-semibold text-warning">Markers found inside the file</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
              {report.metadata.aiMarkers.map((marker, index) => (
                <li key={index}>{marker}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {report.metadata.notes.map((note, index) => (
          <p key={index} className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {note}
          </p>
        ))}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-display text-xl">What this cannot tell you</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {report.caveats.map((caveat, index) => (
              <li key={index}>{caveat}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-display text-xl">Verify it yourself</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-foreground">
            {report.verifySteps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            <a
              className="rounded border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
              href="https://lens.google.com/"
              target="_blank"
              rel="noreferrer noopener"
            >
              Google Lens
            </a>
            <a
              className="rounded border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
              href="https://tineye.com/"
              target="_blank"
              rel="noreferrer noopener"
            >
              TinEye reverse search
            </a>
            <a
              className="rounded border border-border px-3 py-1.5 text-xs transition-colors hover:bg-accent"
              href="https://toolbox.google.com/factcheck/explorer"
              target="_blank"
              rel="noreferrer noopener"
            >
              Fact Check Explorer
            </a>
          </div>
        </div>
      </section>

      <p className="rounded-lg border border-dashed border-border p-4 text-sm leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Read this before you share the result.</strong> No
        detector — human or automated — can prove that media is real or fake. This report describes
        signs and probabilities. Use it alongside where the file came from, who published it first,
        and what other reporting says.
      </p>
    </div>
  );
}
