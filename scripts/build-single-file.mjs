// out/ (Next.js static export) 결과물을 단일 HTML 파일로 합친다.
// 사내망에 웹서버 없이 파일 하나만 배포하기 위한 용도.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "out");
const outputFile = join(__dirname, "..", "채권세상.html");

let html = readFileSync(join(outDir, "index.html"), "utf-8");

function readAsset(relHref) {
  const cleanPath = relHref.split("?")[0].replace(/^\.\//, "").replace(/^\//, "");
  return readFileSync(join(outDir, cleanPath), "utf-8");
}

// 1) 프리로드 힌트는 필요 없으니 제거
html = html.replace(/<link rel="preload"[^>]*>/g, "");

// HTML 파서가 태그 내부 문자열 리터럴 속의 "</script"·"</style"도 닫는 태그로
// 인식해버리는 문제를 막기 위해 이스케이프한다.
function escapeClosingTag(code, tagName) {
  const pattern = new RegExp(`</${tagName}`, "gi");
  return code.replace(pattern, `<\\/${tagName}`);
}

// 2) 스타일시트 인라인
html = html.replace(
  /<link rel="stylesheet" href="([^"]+)"[^>]*>/g,
  (_match, href) => `<style>${escapeClosingTag(readAsset(href), "style")}</style>`
);

// 3) 파비콘을 data URI로 인라인
html = html.replace(
  /<link rel="icon" href="([^"]+)"([^>]*)>/,
  (_match, href, rest) => {
    const cleanPath = href.split("?")[0].replace(/^\//, "");
    const data = readFileSync(join(outDir, cleanPath)).toString("base64");
    return `<link rel="icon" href="data:image/x-icon;base64,${data}"${rest}>`;
  }
);

// 4) 스크립트 인라인
// 코드를 텍스트로 그대로 넣으면 src 속성이 없어져 Turbopack 런타임의
// registerChunk()가 document.currentScript.src를 null로 읽어 그 자리에서
// "Cannot read properties of null (reading 'replace')" 오류가 나며 이후
// 로직(예: 업로드 기능)이 조용히 실행되지 않는다. src를 data: URI로 유지해
// currentScript.src가 계속 문자열이 되도록 한다.
html = html.replace(
  /<script src="([^"]+)"([^>]*)><\/script>/g,
  (_match, src, attrs) => {
    const cleanedAttrs = attrs.replace(/\s*crossorigin="[^"]*"/g, "").trim();
    const attrStr = cleanedAttrs ? ` ${cleanedAttrs}` : "";
    const base64 = Buffer.from(readAsset(src), "utf-8").toString("base64");
    return `<script${attrStr} src="data:text/javascript;base64,${base64}"></script>`;
  }
);

writeFileSync(outputFile, html, "utf-8");
console.log(`Wrote single-file build: ${outputFile}`);
