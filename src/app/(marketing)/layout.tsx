import Link from "next/link";
import { Logo } from "@/components/Logo";
import { HeaderAuth } from "@/components/HeaderAuth";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-line sticky top-0 z-40 bg-ink/85 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-5 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5 group">
            <Logo className="h-5 w-5 text-accent" />
            <span className="font-[family-name:var(--font-display)] font-semibold text-[15.5px] tracking-tight">
              Linkagent
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted">
            <a
              href="https://github.com/mehicned/linkagent"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-body transition-colors flex items-center gap-1.5"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>
              GitHub
            </a>
            <HeaderAuth />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-24">{children}</main>
    </>
  );
}
