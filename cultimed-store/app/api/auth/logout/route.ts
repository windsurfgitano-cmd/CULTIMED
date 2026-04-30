import { NextResponse, type NextRequest } from "next/server";
import { logoutCustomer } from "@/lib/auth";

export async function POST(req: NextRequest) {
  logoutCustomer();
  return NextResponse.redirect(new URL("/", req.url));
}
