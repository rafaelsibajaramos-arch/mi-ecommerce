import { ReactNode } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";

export default function AdminLayoutShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f4f6fb] flex">
      <AdminSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <AdminTopbar />
        <section className="p-8">{children}</section>
      </div>
    </main>
  );
}