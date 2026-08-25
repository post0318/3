import { NextResponse } from "next/server";
import { getCompanies } from "@/lib/server/secEdgar";

export async function GET() {
  try {
    const companies = await getCompanies();
    return NextResponse.json({ companies });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 502 }
    );
  }
}
