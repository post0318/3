import { NextRequest, NextResponse } from "next/server";
import { getSalt } from "@/lib/server/boerseFrankfurt";

/**
 * Vercel Cron(vercel.json)이 하루 1회 호출해 boerse-frankfurt salt를
 * Redis에 미리 데워둔다(24시간 TTL). 접속이 뜸해 캐시가 비면 그 요청
 * 하나가 홈페이지+메인 JS 번들(2MB대)을 다시 받는 8초짜리 지연을
 * 떠안는 문제(브라질채권검색 캐시와 동일한 이유)를 막는다. CRON_SECRET
 * 검증은 브라질 캐시 워밍과 동일하게 적용한다.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    await getSalt(true);
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : "실패" },
      { status: 502 }
    );
  }
}
