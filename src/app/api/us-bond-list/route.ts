import { NextRequest, NextResponse } from "next/server";
import { getRecentBondList } from "@/lib/server/secEdgar";

export async function GET(request: NextRequest) {
  const cik = request.nextUrl.searchParams.get("cik");
  if (!cik) {
    return NextResponse.json({ error: "cik 파라미터가 필요합니다." }, { status: 400 });
  }
  try {
    const bonds = await getRecentBondList(cik);
    return NextResponse.json({ bonds });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 502 }
    );
  }
}
