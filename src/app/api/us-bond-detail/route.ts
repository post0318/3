import { NextRequest, NextResponse } from "next/server";
import { fetchFwpDetail } from "@/lib/server/secEdgar";

export async function GET(request: NextRequest) {
  const cik = request.nextUrl.searchParams.get("cik");
  const indexUrl = request.nextUrl.searchParams.get("indexUrl");
  const filedDate = request.nextUrl.searchParams.get("filedDate") ?? "";
  if (!cik || !indexUrl) {
    return NextResponse.json(
      { error: "cik, indexUrl 파라미터가 필요합니다." },
      { status: 400 }
    );
  }
  try {
    const detail = await fetchFwpDetail(indexUrl, cik, filedDate);
    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 502 }
    );
  }
}
