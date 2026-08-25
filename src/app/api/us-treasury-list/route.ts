import { NextResponse } from "next/server";
import { getTreasuryList } from "@/lib/server/treasuryFiscalData";

export async function GET() {
  try {
    const bonds = await getTreasuryList();
    return NextResponse.json({ bonds });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 502 }
    );
  }
}
