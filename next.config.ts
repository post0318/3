import type { NextConfig } from "next";

/**
 * 기본(Vercel 배포용)은 서버 포함 일반 빌드다. 영업점 오프라인 zip/bat
 * 배포용 정적 export는 STATIC_EXPORT=1로만 활성화한다(scripts/build-offline.mjs 참고) —
 * 서버가 필요한 기능(예: 종목검색 API route)은 이 모드에서 빌드 대상에서 제외해야 한다.
 */
const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = isStaticExport
  ? { output: "export", assetPrefix: "." }
  : {};

export default nextConfig;
