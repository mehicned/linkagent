"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";

interface ScanResult {
  token: string;
  host: string;
  totalUrls: number;
  pagesScanned: number;
  oppCount: number;
  samples: { from: string; to: string; anchor: string; sentence: string }[];
}

const SCAN_STEPS = [
  "Reading the sitemap",
  "Scanning your pages",
  "Mapping topics",
  "Finding link opportunities",
];

export default function Landing() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<"idle" | "scanning" | "done">("idle");
  const [scanStep, setScanStep] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState("");

  // Signed-in users belong in the app, not on the landing page.
  useEffect(() => {
    if (session) router.replace("/dashboard");
  }, [session, router]);

  // The step list advances on a timer while the real scan runs, and the
  // last step waits for the response.
  useEffect(() => {
    if (phase !== "scanning") return;
    setScanStep(0);
    const t = setInterval(() => setScanStep((s) => Math.min(s + 1, SCAN_STEPS.length - 1)), 3500);
    return () => clearInterval(t);
  }, [phase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || phase === "scanning") return;
    setError("");
    setPhase("scanning");
    setResult(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setPhase("idle");
        return;
      }
      setResult(data);
      setPhase("done");
    } catch {
      setError("The scan failed. Try again.");
      setPhase("idle");
    }
  }

  return (
    <div>
      <section className="pt-20 pb-12">
        <div className="max-w-2xl">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-faint">
            Open source · MIT · Self hosted
          </p>
          <h1 className="text-[44px] md:text-[52px] font-semibold tracking-[-0.03em] leading-[1.06]">
            Internal linking
            <br />
            on <span className="text-accent">autopilot</span>.
          </h1>
          <p className="mt-5 max-w-lg text-muted text-[17px] leading-relaxed">
            Linkagent crawls your site, finds the internal links you are missing, and adds them with
            one tiny script. Anchors come from text already on your pages.
          </p>

          <form onSubmit={submit} className="mt-8 flex max-w-lg gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="yoursite.com"
              className="card flex-1 rounded-lg px-3.5 py-2.5 text-[15px] outline-none placeholder:text-faint focus:border-line2 transition-colors"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={phase === "scanning" || !url.trim() || isPending}
              className="btn btn-primary px-4 text-[14px]"
            >
              {phase === "scanning" ? "Scanning..." : "Scan free"}
            </button>
          </form>
          {error && <p className="mt-3 text-sm text-bad">{error}</p>}
          {phase === "idle" && (
            <p className="mt-3 text-xs text-faint">Free scan, no account needed. Takes about 20 seconds.</p>
          )}
        </div>

        {phase === "scanning" && (
          <div className="card mt-8 max-w-lg p-5">
            <div className="space-y-3">
              {SCAN_STEPS.map((label, i) => (
                <div key={label} className="flex items-center gap-3">
                  {i < scanStep ? (
                    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent text-ink">
                      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2.5 6.5 5 9l4.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  ) : i === scanStep ? (
                    <svg className="h-[18px] w-[18px] animate-spin text-accent" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
                      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <span className="h-[18px] w-[18px] rounded-full border border-line2" />
                  )}
                  <span className={`text-sm ${i <= scanStep ? "text-body" : "text-faint"}`}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {phase === "done" && result && <ScanTeaser result={result} />}
      </section>

      <section className="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3 mb-8">
        <Step
          n="01"
          title="Crawl and map"
          body="Reads your sitemap, crawls every page, and builds a real picture of your content: topics, clusters, orphan pages, and link depth."
        />
        <Step
          n="02"
          title="Score opportunities"
          body="Finds pages that should link to each other and picks anchor text that already exists in your copy. Balanced, varied, never spammy."
        />
        <Step
          n="03"
          title="Ship with one script"
          body="A 2 KB script injects links by wrapping existing text. New posts get linked automatically on every re-crawl. No rewrites, no layout shift."
        />
      </section>

      <section className="mb-16 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-faint">
        <span>Runs on your own server</span>
        <span className="h-1 w-1 rounded-full bg-line2" />
        <span>Your review decisions survive every re-crawl</span>
        <span className="h-1 w-1 rounded-full bg-line2" />
        <span>Anchors are never invented, only found</span>
        <span className="h-1 w-1 rounded-full bg-line2" />
        <span>Works without an AI key</span>
      </section>
    </div>
  );
}

function ScanTeaser({ result }: { result: ScanResult }) {
  const locked = Math.max(result.oppCount - result.samples.length, 0);
  return (
    <div className="card mt-8 max-w-2xl overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <p className="text-[15px]">
          <span className="num font-semibold text-accent">{result.oppCount}</span>{" "}
          <span className="font-medium">missing internal links found</span>{" "}
          <span className="text-muted">
            in just the first {result.pagesScanned} of about {result.totalUrls.toLocaleString()} pages on{" "}
            {result.host}
          </span>
        </p>
      </div>

      <div>
        {result.samples.map((s, i) => (
          <div key={i} className="border-b border-line/60 px-5 py-3">
            <div className="flex items-center gap-2 text-[13px]">
              <span className="mono truncate max-w-[200px] text-faint">{s.from}</span>
              <svg viewBox="0 0 20 20" className="h-3 w-3 shrink-0 text-faint" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 10h12m0 0-4-4m4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="mono truncate max-w-[200px] text-body">{s.to}</span>
            </div>
            <p className="mt-1 truncate text-sm text-muted">
              anchor: <mark className="anchor">{s.anchor}</mark>
            </p>
          </div>
        ))}
        {locked > 0 &&
          [0, 1].map((i) => (
            <div key={i} className="select-none border-b border-line/60 px-5 py-3 blur-[5px]" aria-hidden>
              <div className="flex items-center gap-2 text-[13px]">
                <span className="mono text-faint">/blog/some-post-title</span>
                <span className="text-faint">→</span>
                <span className="mono text-body">/target/page</span>
              </div>
              <p className="mt-1 text-sm text-muted">anchor: hidden until you sign up</p>
            </div>
          ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="text-sm text-muted">
          {locked > 0 ? (
            <>
              <span className="num font-medium text-body">{locked}</span> more waiting, plus the rest of your site.
            </>
          ) : (
            "The full crawl covers your whole site and finds much more."
          )}
        </p>
        <Link href={`/signup?scan=${result.token}`} className="btn btn-primary">
          Get every link free
        </Link>
      </div>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="bg-panel p-6">
      <div className="mono mb-4 text-xs text-faint">{n}</div>
      <h3 className="font-medium text-[15px]">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
