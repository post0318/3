import { Redis } from "@upstash/redis";

/** Upstash Redis(Vercel Marketplace 연동, KV_REST_API_*)가 설정되어 있으면 클라이언트를,
 *  아니면(로컬 개발 등) null을 반환해 호출부가 조용히 폴백할 수 있게 한다. */
export function getRedis(): Redis | null {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  try {
    return Redis.fromEnv();
  } catch {
    return null;
  }
}
