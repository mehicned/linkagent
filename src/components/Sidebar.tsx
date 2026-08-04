"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { useSession, signOut } from "@/lib/auth-client";

interface SiteRow {
  id: number;
  name: string;
  host: string;
  status: string;
}

export function Favicon({ host, className = "h-4 w-4" }: { host: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
      alt=""
      className={`${className} shrink-0 rounded-[3px]`}
      loading="lazy"
    />
  );
}

const DOT: Record<string, string> = {
  new: "bg-warn",
  ready: "bg-good",
  error: "bg-bad",
  crawling: "bg-accent pulse",
  analyzing: "bg-accent pulse",
  queued: "bg-faint",
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [sites, setSites] = useState<SiteRow[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/sites");
    if (res.ok) setSites(await res.json());
  }, []);

  useEffect(() => {
    if (!session) return;
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [session, load]);

  // The app shell is for signed-in users only.
  useEffect(() => {
    if (!isPending && !session) router.replace("/login");
  }, [isPending, session, router]);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-panel lg:flex">
      <div className="flex h-14 items-center border-b border-line px-4">
        <Link href="/dashboard" className="flex items-center gap-1.5">
          <Logo className="h-5 w-5 text-accent" />
          <span className="font-[family-name:var(--font-display)] font-semibold text-[15px] tracking-tight">
            LinkAgent
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <Link
          href="/dashboard"
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            pathname === "/dashboard" ? "bg-panel2 text-body" : "text-muted hover:bg-panel2/60 hover:text-body"
          }`}
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 9.5 10 3l7 6.5M5 8v8h10V8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Dashboard
        </Link>

        <div className="mt-5 mb-1.5 flex items-center justify-between px-3">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-faint">Sites</span>
          <Link href="/dashboard" className="text-faint hover:text-body transition-colors" title="Add a site">
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10 4v12M4 10h12" strokeLinecap="round" />
            </svg>
          </Link>
        </div>
        {sites.map((s) => {
          const active = pathname.startsWith(`/sites/${s.id}`);
          return (
            <Link
              key={s.id}
              href={`/sites/${s.id}`}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? "bg-panel2 text-body font-medium" : "text-muted hover:bg-panel2/60 hover:text-body"
              }`}
            >
              <Favicon host={s.host} className="h-4 w-4" />
              <span className="flex-1 truncate">{s.name}</span>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[s.status] ?? "bg-faint"}`} />
            </Link>
          );
        })}
        {sites.length === 0 && <p className="px-3 py-2 text-xs text-faint">No sites yet.</p>}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="truncate text-xs text-faint">{session?.user.email}</span>
          <button
            onClick={async () => {
              await signOut();
              router.push("/");
              router.refresh();
            }}
            className="btn btn-ghost btn-sm shrink-0"
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
