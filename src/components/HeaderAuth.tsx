"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth-client";

export function HeaderAuth() {
  const { data: session, isPending } = useSession();

  if (isPending) return <div className="h-8 w-24" />;

  if (!session) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/login" className="btn btn-ghost btn-sm">
          Sign in
        </Link>
        <Link href="/signup" className="btn btn-primary btn-sm">
          Get started
        </Link>
      </div>
    );
  }

  return (
    <Link href="/dashboard" className="btn btn-primary btn-sm">
      Open dashboard
    </Link>
  );
}
