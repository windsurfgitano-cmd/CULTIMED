import { requireStaff } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const staff = requireStaff();

  return (
    <div className="min-h-screen bg-surface">
      <TopBar staff={staff} />
      <Sidebar role={staff.role} />
      <main className="md:ml-[240px] pt-14 min-h-screen">
        <div className="max-w-[1400px] mx-auto px-3 py-5 sm:px-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
