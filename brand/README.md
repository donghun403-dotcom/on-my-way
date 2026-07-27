# On My Way · 올리(OLLIE) 브랜드 허브

올리와 On My Way에 관한 모든 자료의 **단일 출처(single source of truth)**. 새 대화를 시작하는 사람도, Claude Code도, 여기서부터 읽는다.

## 지금 가장 중요한 사실

> **현재는 Phase 1 — 올리를 독립 캐릭터로 각인시키는 단계다. 앱 홍보가 아니다.**
>
> 올리는 마음의 날씨가 온몸에 드러나고, 그 날씨를 먹고 자라는 작은 나무와 함께 떠다니는 구름 친구.
> 구름은 순간 감정, 나무는 누적된 마음. 대표 미스터리는 "올리는 왜 나무를 데리고 어딘가로 가고 있는가?"

## 어디에 뭐가 있나

| 폴더 | 내용 | 먼저 읽을 파일 |
| --- | --- | --- |
| `character/` | 올리 캐릭터 정의·디자인·이미지 | **`ollie-bible.md`** → `design-spec.md` |
| `identity/` | 로고·컬러·폰트·서비스 명칭 | `brand-basics.md` |
| `marketing/` | 전략·캘린더·주간 콘텐츠·플러그인 소스 | `strategy.md` |
| `product/` | 앱 기획 문서로 가는 인덱스 | `README.md` |

## 상황별 진입점

| 하려는 일 | 읽을 것 |
| --- | --- |
| 올리 콘텐츠를 만든다 | `character/ollie-bible.md` + `character/design-spec.md` |
| 올리를 새로 그리거나 애니메이션한다 | `character/design-spec.md` + `character/open-questions.md` |
| 이번 주 SNS 콘텐츠를 만든다 | `marketing/strategy.md` → `marketing/weekly/` 최신 파일 |
| 다음 달 계획을 짠다 | `marketing/calendar/` 최신 파일 |
| 앱 기능·가격을 확인한다 | `product/README.md` |
| 로고·색을 쓴다 | `identity/brand-basics.md` |
| 자산 파일이 어디 있는지 찾는다 | `INVENTORY.md` |

## 규칙 3가지

1. **`brand/`가 원본이다.** 마케팅 플러그인(`marketing/plugin/src/`)은 이 폴더의 복사본을 담고 있다. 브랜드 내용을 바꾸면 플러그인도 다시 만들어야 한다. 자세한 건 `CLAUDE.md`.
2. **Phase 1에서는 앱을 언급하지 않는다.** 판단 기준 한 줄 — 이 콘텐츠가 앱 없이도 그 자체로 재미있는가?
3. **검증 안 된 수치를 쓰지 않는다.** 사용자 수·달성률·후기는 실제 데이터가 있을 때만.

## 배포 제외

`brand/`와 `marketing/`은 `.assetsignore`에 등록되어 있어 Cloudflare 정적 자산으로 배포되지 않는다. 이미지 원본이 공개 URL로 노출되지 않도록 이 설정을 지운다.

---

최종 정리: 2026-07-26
