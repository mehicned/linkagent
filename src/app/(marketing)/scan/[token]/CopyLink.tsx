"use client";

import { useState } from "react";

export function CopyLink() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="btn btn-ghost btn-sm"
    >
      {copied ? "Link copied" : "Copy link"}
    </button>
  );
}
