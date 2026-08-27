import { NextRequest, NextResponse } from "next/server";
import { warmNtnFCache } from "@/lib/server/brazilBondData";

/**
 * Vercel Cron(vercel.json)이 하루 1회 호출해 브라질채권검색 캐시를 미리
 * 데워둔다. Vercel이 CRON_SECRET 환경변수를 설정해두면 cron 요청에
 * Authorization: Bearer <CRON_SECRET> 헤더를 자동으로 실어 보내므로, 그
 * 값을 검증해 외부에서 임의로 호출(=쓸데없이 14MB를 계속 받게 하는 것)하지
 * 못하게 막는다.
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
    const result = await warmNtnFCache();
    return NextResponse.json({ status: "ok", ...result });
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : "실패" },
      { status: 502 }
    );
  }
}
