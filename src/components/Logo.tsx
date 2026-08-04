export function Logo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden>
      <path d="M12.5 19.5 19.5 12.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M14 9.5 16.2 7.3a5 5 0 0 1 7.07 0l1.43 1.43a5 5 0 0 1 0 7.07L22.5 18"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M18 22.5 15.8 24.7a5 5 0 0 1-7.07 0L7.3 23.27a5 5 0 0 1 0-7.07L9.5 14"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
