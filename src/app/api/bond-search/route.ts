import { NextRequest, NextResponse } from "next/server";
import { searchBondsByIssuer } from "@/lib/server/boerseFrankfurt";

export async function GET(request: NextRequest) {
  const issuer = request.nextUrl.searchParams.get("issuer");
  if (!issuer) {
    return NextResponse.json({ error: "issuer 파라미터가 필요합니다." }, { status: 400 });
  }
  try {
    const bonds = await searchBondsByIssuer(issuer);
    return NextResponse.json({ bonds });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 502 }
    );
  }
}
