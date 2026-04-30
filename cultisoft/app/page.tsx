import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/auth";

export default async function Home() {
  const staff = await getCurrentStaff();
  redirect(staff ? "/dashboard" : "/login");
}
