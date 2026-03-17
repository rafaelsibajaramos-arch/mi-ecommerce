import { ReactNode } from "react";
import AdminLayoutShell from "../../components/admin/AdminLayoutShell";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AdminLayoutShell>{children}</AdminLayoutShell>;
}