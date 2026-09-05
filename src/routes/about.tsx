import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "How TruthLens checks media — method and limits" },
      {
        name: "description",
        content:
          "How TruthLens analyzes images, audio and video for AI generation and manipulation, what the file-level evidence means, and where automated detection stops being reliable.",
      },
      { property: "og:title", content: "How TruthLens checks media" },
      {
        property: "og:description",
        content:
          "The method behind the assessments, the evidence read from each file, and the honest limits of AI detection.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: About,
});

function About() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/" className="font-display text-xl tracking-tight">
            Truth<span className="text-primary">Lens</span>
          </Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            Check a file
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl space-y-10 px-5 py-14">
        <div>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">
            How the check works — and where it stops
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            TruthLens is built for people who need to make a fast, defensible decision about a piece
            of media: journalists on deadline, researchers, and anyone about to hit share.
          </p>
        </div>

        <section>
          <h2 className="font-display text-2xl">Two independent layers</h2>
          <div className="mt-4 space-y-4 text-base leading-relaxed">
            <p>
              <strong>Content analysis.</strong> The media itself is examined by a multimodal AI
              model prompted to work like a forensic analyst: texture and skin rendering, lighting
              and shadow consistency, garbled text, malformed hands and teeth, blending artifacts
              around inserted objects, impossible reflections. For audio it listens for breathing,
              room tone, prosody and splice points. For video it looks at frame-to-frame stability,
              blinking, lip-sync and warping during motion.
            </p>
            <p>
              <strong>File evidence.</strong> Separately, the file's own bytes are parsed for
              embedded details — format, dimensions or duration, camera make and model, capture
              date, editing-software traces, and content-credential or generator markers such as
              C2PA blocks or generation parameters written by image tools. This layer reports facts,
              never opinions, and is shown apart from the AI's judgement so you can weigh them
              yourself.
            </p>
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl">What a verdict means</h2>
          <ul className="mt-4 space-y-3 text-base leading-relaxed">
            <li>
              <strong className="text-success">No strong signs</strong> — nothing stood out. This is
              the weakest kind of result: good fakes leave few traces, and compression can erase the
              ones that exist.
            </li>
            <li>
              <strong className="text-muted-foreground">Inconclusive</strong> — evidence points both
              ways. Treat the item as unresolved.
            </li>
            <li>
              <strong className="text-warning">Signs of manipulation</strong> — parts look edited,
              composited or reassembled, which may be anything from a routine crop to a deliberate
              fabrication.
            </li>
            <li>
              <strong className="text-danger">Likely AI-generated</strong> — multiple traits typical
              of synthetic media were found together.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl">Honest limits</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-muted-foreground">
            <li>No detector can prove media is real or fake. Every result is probabilistic.</li>
            <li>
              Screenshots, re-uploads and social-media compression destroy exactly the details
              detection depends on — and strip metadata from genuine files.
            </li>
            <li>
              Missing camera data is not evidence of fakery, and present camera data is not evidence
              of authenticity. Both can be stripped or forged.
            </li>
            <li>
              Generative tools improve continuously. An assessment reflects today's tell-tale signs.
            </li>
            <li>
              Provenance beats detection. Who published it first, and when, usually settles a
              question faster than any pixel analysis.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-2xl">Privacy</h2>
          <p className="mt-4 text-base leading-relaxed">
            There are no accounts and no history. A file is held only for the length of the analysis
            and is never written to storage. Reports live in your browser until you leave the page —
            copy or print one if you need to keep it.
          </p>
        </section>

        <Link
          to="/"
          className="inline-flex rounded bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Check a file
        </Link>
      </article>
    </main>
  );
}
