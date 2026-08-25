import { NextRequest, NextResponse } from "next/server";
import { getBondDetail } from "@/lib/server/boerseFrankfurt";

export async function GET(request: NextRequest) {
  const isin = request.nextUrl.searchParams.get("isin");
  if (!isin) {
    return NextResponse.json({ error: "isin 파라미터가 필요합니다." }, { status: 400 });
  }
  try {
    const detail = await getBondDetail(isin);
    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 502 }
    );
  }
}
