import { NextRequest, NextResponse } from "next/server";

/** The browser demo never calls server APIs or depends on a local SQLite file. */
export function proxy(_request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "0") {
    return NextResponse.json({ error: "Browser demo: use the app to manage papers saved on this device.", mode: "browser" }, { status: 409 });
  }
  return NextResponse.next();
}
export const config = { matcher: "/api/:path*" };
