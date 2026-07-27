# 에이전트 작업 규칙 — brand/

Claude Code, Cowork, Codex 등 이 폴더에서 작업하는 모든 에이전트가 따른다. 저장소 루트의 `AGENTS.md`와 함께 적용하고, 브랜드·마케팅 작업에서는 이 문서가 우선한다.

## 시작하기 전에

1. `brand/README.md`를 먼저 읽는다.
2. 캐릭터가 관련되면 `brand/character/ollie-bible.md`를 **반드시** 읽는다. 이 문서가 다른 모든 문서를 이긴다.
3. 그리기·애니메이션이 관련되면 `brand/character/design-spec.md`를 읽는다. 실제 에셋에서 추출한 값이므로 추측하지 않는다.

## 절대 규칙

- **Phase를 확인하지 않고 콘텐츠를 만들지 않는다.** 현재 Phase 1(캐릭터 각인)에서는 앱·기능·가격·가입을 일절 언급하지 않는다. Phase 정의는 `marketing/strategy.md`.
- **`character/open-questions.md`의 미확정 항목에 의존하는 결과물을 만들지 않는다.** 미확정이면 그 항목을 피해서 연출한다. 확정되면 그 파일을 먼저 갱신한다.
- **검증되지 않은 수치를 만들지 않는다.** 사용자 수, 달성률, 후기, 시장 통계 전부. 외부 통계를 쓸 때는 출처 URL을 함께 남긴다.
- **미구현 기능을 현재형으로 말하지 않는다.** 애플 로그인, 캘린더 연동, 친구·스터디 공유, 챌린지, 전문가 코칭, 팀 목표 관리는 아직 없다.
- **`assets/`의 원본을 옮기거나 지우지 않는다.** 앱 코드(`script.js`, `app.html`)가 그 경로를 참조한다. `brand/`에 있는 것은 사본이다.

## 동기화 규칙

같은 내용이 두 곳에 있는 파일이 있다. **왼쪽이 원본이다.**

| 원본 | 사본 |
| --- | --- |
| `brand/character/ollie-bible.md` | `brand/marketing/plugin/src/skills/on-my-way-brand/references/ollie-voice.md` |
| `brand/marketing/research/platform-rules-2026-07.md` | `brand/marketing/plugin/src/skills/on-my-way-brand/references/platform-rules.md` |

원본을 고쳤으면 사본에도 반영하고, 플러그인을 다시 압축해 Cowork에 재설치해야 실제 동작이 바뀐다.

```
cd brand/marketing/plugin/src && zip -r ../on-my-way-marketing.plugin . -x "*.DS_Store"
```

## 파일을 어디에 쓸까

| 만드는 것 | 위치 |
| --- | --- |
| 주간 콘텐츠 패킷 | `brand/marketing/weekly/ollie-week-YYYYMMDD.md` |
| 월간 캘린더 | `brand/marketing/calendar/ollie-calendar-YYYY-MM-DD.md` |
| 성과 리뷰 | `brand/marketing/review/YYYY-MM-DD.md` |
| 새 캐릭터 설정 | `brand/character/` 안. 바이블에 통합할지 별도 파일로 둘지 판단 |
| 새 이미지 자산 | `brand/character/assets/` 또는 `brand/identity/assets/`. 앱에서도 쓴다면 루트 `assets/`에도 사본 |

파일명은 영문 kebab-case + 날짜. 한글 파일명은 만들지 않는다(기존 `On My Way 로고/`는 예외).

## git

이 저장소는 Cloudflare Workers로 배포된다. 주의할 점:

- `brand/`와 `marketing/`은 `.assetsignore`에 등록되어 배포에서 제외된다. **이 항목을 지우지 않는다.**
- 현재 브랜치는 `codex/detailed-plan-editor`이고 `origin/main`과 갈라져 있다. 브랜드 파일은 코드와 섞이지 않으므로 별도 커밋으로 분리한다.
- 원격 세션(Cowork 클라우드)에서는 이 폴더의 git 명령이 lock 권한 문제로 실패한다. **커밋은 사용자 컴퓨터의 터미널이나 Claude Code에서 한다.**

## 하지 않을 것

- 브랜드 문서를 근거 없이 다시 쓰지 않는다. 바꿀 이유가 있으면 무엇을 왜 바꾸는지 먼저 말한다.
- `docs/`의 제품 기획 문서를 `brand/`로 복사하지 않는다. 인덱스로만 연결한다(`product/README.md`).
- 비밀정보(토큰, 키, 계정)를 이 폴더에 남기지 않는다.
