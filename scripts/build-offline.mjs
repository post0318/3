// 영업점 오프라인 zip/bat 배포용 정적 export 빌드.
// 서버 전용 라우트(src/app/api)는 output:"export"와 호환되지 않으므로
// 빌드하는 동안 잠깐 폴더명을 바꿔 빌드 대상에서 제외했다가 끝나면 되돌린다.
import { existsSync, cpSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const apiDir = path.join(process.cwd(), "src", "app", "api");
const hiddenDir = path.join(process.cwd(), "src", "app", "_api_disabled_for_offline_build");
const hadApiDir = existsSync(apiDir);
const nextCacheDir = path.join(process.cwd(), ".next");

// api route가 존재했던 이전 빌드(npm run dev 포함)의 타입 캐시가 남아있으면
// 방금 숨긴 api 폴더를 참조하다 타입체크가 실패하므로 먼저 지운다.
if (existsSync(nextCacheDir)) {
  rmSync(nextCacheDir, { recursive: true, force: true });
}

if (hadApiDir) {
  cpSync(apiDir, hiddenDir, { recursive: true });
  rmSync(apiDir, { recursive: true, force: true });
  console.log("[build-offline] src/app/api 를 임시로 제외했습니다.");
}

let exitCode = 0;
try {
  const result = spawnSync("npx", ["next", "build"], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, STATIC_EXPORT: "1" },
  });
  exitCode = result.status ?? 1;
} finally {
  if (hadApiDir) {
    cpSync(hiddenDir, apiDir, { recursive: true });
    rmSync(hiddenDir, { recursive: true, force: true });
    console.log("[build-offline] src/app/api 를 원래대로 복원했습니다.");
  }
}

process.exit(exitCode);
