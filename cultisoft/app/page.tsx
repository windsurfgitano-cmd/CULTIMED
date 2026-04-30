import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth";

export default function Home() {
  const staff = getCurrentStaff();
  redirect(staff ? "/dashboard" : "/login");
}
