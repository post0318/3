import { NextResponse } from "next/server";
import { fetchLatestNtnF } from "@/lib/server/brazilBondData";

export async function GET() {
  try {
    const { asOfDate, items } = await fetchLatestNtnF();
    return NextResponse.json({ asOfDate, bonds: items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 502 }
    );
  }
}
