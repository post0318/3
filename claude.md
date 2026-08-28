# 브라질국채 이자지급 신탁

## 프로젝트 개요

브라질 국채(NTN-F) 이자를 재원으로 월/반기/재투자 중 선택한 지급구분에 따라 분배하는 특정금전신탁 상품의 현금흐름 계산기입니다. `post0318/fix`(범용 채권 계산기, 미국/한국/브라질 다국가 지원)를 브라질 전용으로 정리해 시작했습니다. 정식 규칙은 PRD.md 참고 — 1단계는 반기지급만 구현되어 있고 월/재투자는 예정입니다.

## 기술스택

- Next.js 16 (app router)
- tailwind css
- vercel (배포)
- 브라질채권검색 시세는 레포에 커밋된 스냅샷(src/lib/server/ntnf-snapshot.json)을 쓰고, GitHub Actions가 주간으로 갱신한다 (scripts/fetch-ntnf-snapshot.mjs). 원본 CSV가 14MB라 요청 시점에 못 받는다.

## 코드규칙
- Typescript 사용
- 컴포넌트는 src/components/아래에 작성
- 환경변수는 .env.local에 저장 (절대 커밋하지 않음)
- 모바일 반응형 디자인
- 브라질 국채 전용 — 거래통화 BRL·수탁통화 KRW로 고정, 다른 국가/통화 지원 코드를 다시 들여오지 않는다