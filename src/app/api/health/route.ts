import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "bravoclient-customers-portal",
    checkedAt: new Date().toISOString(),
  });
}
