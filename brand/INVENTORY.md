# 자산 인벤토리

`brand/` 안의 파일과 **원본 위치**. 사본은 지워도 되지만 원본은 앱이 참조한다.

## 올리 캐릭터 이미지 — `character/assets/`

| 파일 | 크기 | 내용 | 원본 |
| --- | ---: | --- | --- |
| `on-my-way-mascot.png` | 629KB | **기본 포즈.** 정면, 옅은 미소 | `assets/` |
| `ollie-celebrate.png` | 877KB | 기쁨 — 눈 감고 활짝 웃음, 팔 벌림 | `assets/` |
| `ollie-comfort.png` | 871KB | 평온·애정 — 잔잔한 미소, 감싸는 자세 | `assets/` |
| `ollie-thinking.png` | 887KB | 불안·결심 — 위쪽 응시, 손을 입가에 | `assets/` |
| `ollie-action.png` | 856KB | 이동·결심 — 달리는 자세 | `assets/` |
| `logo-ollie-symbol.png` | 156KB | 올리 심볼 로고 | `assets/` |

전부 배경 투명 PNG, 약 1085×1449px, 3D 소프트 렌더.

## 브랜드 자산 — `identity/assets/`

| 파일 | 크기 | 원본 |
| --- | ---: | --- |
| `logo-original.png` | 6.2MB | `On My Way 로고/로고 (2).png` |
| `logo-horizontal.png` | 29KB | `assets/` |
| `logo-horizontal-symbol.png` | 9KB | `assets/` |
| `logo-horizontal-ollie.png` | 28KB | `assets/` |
| `og-ollie-share-v1.png` | 1.4MB | `assets/` |
| `og-ollie-share-v2.jpg` | 67KB | `assets/` |
| `plant.svg` `dog.svg` `cat.svg` `home.svg` `buddy.svg` | 각 1~2KB | `assets/` — 성장 테마 |

## 문서

| 파일 | 성격 |
| --- | --- |
| `README.md` | 허브 인덱스 |
| `CLAUDE.md` | 에이전트 작업 규칙 |
| `INVENTORY.md` | 이 파일 |
| `character/ollie-bible.md` | **캐릭터 바이블 v0.2 — 최상위 기준** |
| `character/design-spec.md` | 에셋에서 추출한 형태·색·렌더 스펙 |
| `character/open-questions.md` | 미확정 항목 추적 |
| `identity/brand-basics.md` | 명칭·컬러·폰트·로고 |
| `marketing/strategy.md` | Phase 모델·4축·KPI |
| `marketing/calendar/` | 월간 캘린더 |
| `marketing/weekly/` | 주간 제작 패킷 |
| `marketing/research/` | 플랫폼 데이터 (출처 포함) |
| `product/README.md` | `docs/` 인덱스 |

## 아직 없는 것 (제작 필요)

| 항목 | 왜 필요한가 | 우선순위 |
| --- | --- | --- |
| **레이어 분리된 올리 원본** (눈·입·볼·팔·다리·나무) | 이후 모든 콘텐츠 제작 속도를 좌우 | **1** |
| 표정 3종: 부끄러움·가벼운 슬픔·피곤함 | 마케팅 1주차에 필요 | 2 |
| 감정별 구름 오버레이 프리셋 | 감정 15종 표현 | 3 |
| 열매 디자인 | 성장 보상 시스템 | 4 (설정 확정 후) |
| 성장 단계 시각 (30단계) | 앱 핵심 기능 | 5 |
| 하이라이트 커버 3종 | 계정 세팅 | 2 |

## 다른 곳에 흩어져 있는 것

- `.worktrees/`, `.claude/worktrees/` 안에 같은 에셋의 사본이 여러 벌 있다. **작업용 임시 폴더이므로 여기서 파일을 가져오지 않는다.**
- `.worktrees/final-beta-blockers/docs/artifacts/mobile-ux-stage3-ollie-memory/`에 올리 화면 스크린샷(before/after, 7개 해상도)이 있다. 앱 UI QA 자료이지 브랜드 자산이 아니다.
- `marketing/_to_delete/`에 폐기된 7/27 버전 캘린더·주간 패킷이 있다. 직접 삭제해도 된다.

---

최종 정리: 2026-07-26
