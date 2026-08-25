import { NextResponse } from "next/server";
import { getIssuers } from "@/lib/server/boerseFrankfurt";

export async function GET() {
  try {
    const issuers = await getIssuers();
    return NextResponse.json({ issuers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 502 }
    );
  }
}
