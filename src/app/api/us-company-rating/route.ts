import { NextRequest, NextResponse } from "next/server";
import { findCompanyByName, getLatestRating } from "@/lib/server/secEdgar";

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "name 파라미터가 필요합니다." }, { status: 400 });
  }
  try {
    const company = await findCompanyByName(name);
    if (!company) return NextResponse.json({ rating: null });
    const rating = await getLatestRating(company.cik);
    return NextResponse.json({ rating });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 502 }
    );
  }
}
