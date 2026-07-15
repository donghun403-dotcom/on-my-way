# On My Way

On My Way는 목표를 실행 가능한 일정으로 나누고, 기록과 AI 동행 기능으로 계속 이어가도록 돕는 웹 앱입니다. 정적 화면은 Cloudflare Workers Assets로 제공하고, 인증·계정 동기화·AI·결제 API는 Worker가 처리합니다.

## 출시 상태

- 운영 배포는 `main`과 `wrangler.production.jsonc`만 사용합니다.
- Preview와 운영 Worker 및 KV namespace는 분리되어 있습니다.
- Google 로그인은 운영 환경에서 별도로 수동 확인해야 하며, 다른 OAuth 공급자는 각 공급자 콘솔 설정이 필요합니다.
- AI 호출에는 Worker Secret `OPENAI_API_KEY`가 필요합니다.
- Free/Pro 가격과 AI 크레딧 정책은 아래 내용으로 확정되어 있습니다. 실제 출시 전에는 UI, 서버 차감, 마이그레이션과 테스트가 이 계약과 일치하는지 다시 검증해야 합니다.
- Toss Payments 연동 코드는 일부 존재하지만 운영 결제는 `PAYMENTS_ENABLED=false`로 비활성화되어 있습니다. 문서에 적힌 가격은 정책 목표이며 결제가 활성화되었다는 뜻이 아닙니다.
- 현재 앱 상태는 단일 목표·계획 모델입니다. Free 추가 생성 제한은 서버에서 적용하지만 Pro 다중 목표·활성 계획 UX와 독립 `create_daily_step` 실행 경로는 아직 별도 구현이 필요합니다.

## 확정 요금제

| 항목 | Free | Pro | 24시간 Pro 체험 |
| --- | ---: | ---: | ---: |
| 가격 | 무료 | 월 4,900원 | 무료, 계정당 1회 |
| 가입/체험 크레딧 | 가입 시 5 | - | 총 15 |
| 월 AI 크레딧 | 5 | 250 | - |
| 일일 사용 한도 | 2 | 30 | 30, 단 총 15 이내 |
| 목표 | 최대 1개 | 제한 없음 | Pro 기능 체험 |
| 활성 계획 | 최대 1개 | 제한 없음 | Pro 기능 체험 |
| 미사용 크레딧 이월 | 안 됨 | 안 됨 | 체험 종료 시 소멸 |

AI 사용에는 월간·일일 크레딧 한도가 적용됩니다. 화면과 운영 문서에서는 반드시 `AI 크레딧` 단위를 사용합니다. 추가 크레딧 유료 판매는 이번 정책 범위에 포함하지 않습니다.

### 기능별 차감

| 서버 action | 사용자에게 표시할 기능 | 크레딧 |
| --- | --- | ---: |
| `companion_chat` | 올리와 지금 대화 | 1 |
| `create_daily_step` | 오늘의 한 걸음 생성 | 2 |
| `revise_plan` | 계획 일부 수정 | 2 |
| `recovery_plan` | 회복 계획 생성 | 3 |
| `create_plan` | 새 목표 계획 생성 | 4 |
| `reschedule_plan` | 전체 일정 재조정 | 4 |

자세한 정책, 초기화 기준, 체험 생명주기와 마이그레이션은 [가격 및 AI 크레딧 정책](docs/pricing-and-credits.md)을 참고하세요. AI 요청의 신뢰 경계와 실패 복구는 [AI 아키텍처](docs/ai-architecture.md)에 정리되어 있습니다.

## 로컬 확인

```bash
npm ci
npm test
npm run test:e2e
```

이 저장소에는 현재 별도의 lint, typecheck, production build 스크립트가 없습니다. CI는 Node 단위·통합 테스트, JavaScript 문법 검사와 Playwright E2E를 실행합니다. 없는 검사를 성공했다고 보고하지 않습니다.

## 배포

- PR Preview: `.github/workflows/pr-preview.yml`, `wrangler.preview.jsonc`
- 운영: `.github/workflows/production.yml`, `wrangler.production.jsonc`
- 일반 `wrangler.jsonc`는 운영 도메인을 소유하지 않습니다.

배포 기준점과 Cloudflare Branch Control 설정은 [배포 정책](docs/deployment.md)을 따릅니다. Secret은 저장소에 커밋하지 말고 각 Worker 환경에 별도로 등록합니다.

## 문서

- [가격 및 AI 크레딧 정책](docs/pricing-and-credits.md)
- [AI 아키텍처](docs/ai-architecture.md)
- [회원·관리자·결제 운영 설정](docs/account-billing-setup.md)
- [인증 설정](docs/auth-setup.md)
- [배포 정책](docs/deployment.md)
- [PR Preview 수동 QA](docs/pr-preview-manual-qa.md)

## 보안 원칙

- 클라이언트가 보낸 `plan`, 가격, action별 차감량은 신뢰하지 않습니다.
- 서버가 인증된 사용자, 확정 action과 중앙 정책을 기준으로 사용 가능 여부와 차감량을 계산해야 합니다.
- API 키, OAuth secret, Toss secret과 세션 secret을 브라우저 코드나 Git에 넣지 않습니다.
- 분석 이벤트에 목표 원문, AI 프롬프트, 전화번호, 이메일 같은 개인정보를 포함하지 않습니다.
