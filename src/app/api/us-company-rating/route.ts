import { NextRequest, NextResponse } from "next/server";
import { findBondByIsin, findCikByName, getLatestRating } from "@/lib/server/secEdgar";

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  const isin = request.nextUrl.searchParams.get("isin");
  if (!name) {
    return NextResponse.json({ error: "name 파라미터가 필요합니다." }, { status: 400 });
  }
  try {
    const cik = await findCikByName(name);
    if (!cik) {
      return NextResponse.json({ rating: null, couponFrequencyMonths: null, calcBasis: null });
    }

    // 같은 발행자(회사 또는 국채)가 이 ISIN으로 SEC에도 실제 발행한 적이
    // 있으면 등급뿐 아니라 지급주기/날짜계산기준까지 그 트랜치의 진짜
    // 값으로 반영한다.
    if (isin) {
      const matched = await findBondByIsin(cik, isin).catch(() => null);
      if (matched) {
        return NextResponse.json({
          rating: matched.rating,
          couponFrequencyMonths: matched.couponFrequencyMonths,
          calcBasis: matched.calcBasis,
        });
      }
    }

    const rating = await getLatestRating(cik);
    return NextResponse.json({ rating, couponFrequencyMonths: null, calcBasis: null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 502 }
    );
  }
}
