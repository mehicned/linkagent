import { Sidebar } from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Sidebar />
      <div className="lg:pl-60">
        <main className="mx-auto max-w-6xl px-5 pb-24">{children}</main>
      </div>
    </div>
  );
}
