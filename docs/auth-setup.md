# On My Way 소셜 인증 설정

이 문서는 Google, Kakao, Naver, Apple 로그인을 Cloudflare Worker 기반으로 운영하기 위한 설정과 검증 절차를 설명한다. 실제 Client Secret, Apple private key, 세션 비밀값은 문서·소스·GitHub Actions 로그에 기록하지 않는다.

## 1. 전체 인증 아키텍처

현재 저장소에는 이미 Worker가 OAuth code를 교환하고 앱 전용 HttpOnly 쿠키를 발급하는 구조가 있었다. 새 Supabase Auth를 병행하면 세션과 사용자 원본이 둘로 갈라지므로, 이번 버전은 기존 Worker 구조를 확장했다. Supabase의 공식 Provider 목록에는 Google·Kakao·Apple이 있지만 Naver는 기본 Provider 목록에 없으므로 Naver를 포함한 네 Provider를 한 Worker 계층에서 일관되게 처리한다.

```text
브라우저 로그인 버튼
  → /api/auth/{provider}/start
  → Provider 동의 화면
  → /api/auth/callback/{provider}
  → Worker가 code·state·nonce·Provider 응답 검증
  → identity:{provider}:{providerUserId}
  → user:{internalUserId}
  → session:{sessionId}
  → HttpOnly omw_session 쿠키
```

- 내부 사용자 ID는 `usr_...` 형식이며 서버 비밀값으로 HMAC 파생한다.
- 이메일은 계정 식별자나 자동 병합 기준이 아니다.
- 동일 Provider identity에 대한 동시 요청은 같은 내부 ID를 파생하므로 중복 사용자를 만들지 않는다.
- Provider access token과 Apple private key는 브라우저로 전달하지 않는다.
- 앱 세션 쿠키는 `HttpOnly`, `Secure`(HTTPS), `SameSite=Lax`, `Path=/`를 사용한다.
- 로그아웃은 KV 세션을 삭제한 뒤 쿠키를 즉시 만료한다.

## 2. 공통 callback 구조

| Provider | 시작 | Callback | 추가 검증 |
|---|---|---|---|
| Google | `/api/auth/google/start` | `/api/auth/callback/google` | state, PKCE S256 |
| Kakao | `/api/auth/kakao/start` | `/api/auth/callback/kakao` | state |
| Naver | `/api/auth/naver/start` | `/api/auth/callback/naver` | state, one-time transaction |
| Apple | `/api/auth/apple/start` | `/api/auth/callback/apple` | state, nonce, id_token signature/iss/aud/exp/sub |

OAuth transaction은 `oauth:{state}`에 10분 TTL로 저장되며 callback 진입 시 먼저 삭제되어 재사용할 수 없다. return destination은 `/`, `/app.html`, `/admin.html` allowlist에서만 선택한다. callback 성공과 실패는 code·state·token·error_description을 최종 URL에 남기지 않고 안전한 앱 URL로 redirect한다.

## 3. Supabase 프로젝트 설정

현재 릴리스는 Supabase Auth를 사용하지 않는다. 따라서 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE`가 필수값이 아니다. 향후 Supabase로 이전한다면 Google·Kakao·Apple만 부분 도입하지 말고, Worker 세션과 identity 원본을 하나로 통합하는 별도 마이그레이션을 먼저 설계한다.

참고: [Supabase Social Login 공식 문서](https://supabase.com/docs/guides/auth/social-login)

## 4. Google 설정

1. Google Cloud Console → **Google Auth Platform → Branding**에서 앱 이름·지원 이메일·도메인을 설정한다.
2. **Audience**에서 Internal/External과 테스트 사용자를 결정한다.
3. **Data Access**에서 `openid`, `email`, `profile` 최소 scope만 사용한다.
4. **Clients → Create Client → Web application**을 선택한다.
5. Authorized JavaScript origins에 Preview 및 Production origin을 각각 등록한다.
6. Authorized redirect URIs에 다음을 정확히 등록한다.
   - Preview: `https://on-my-way-pr-3.jungslawyer.workers.dev/api/auth/callback/google`
   - Production: `https://<production-domain>/api/auth/callback/google`
7. Cloudflare Worker에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`을 환경별로 저장한다.
8. 테스트 모드라면 실제 QA 계정을 Google 테스트 사용자에 추가한다.

공식 문서: [Google OAuth 설정](https://developers.google.com/identity/protocols/oauth2/web-server), [Supabase Google 참고](https://supabase.com/docs/guides/auth/social-login/auth-google)

## 5. Kakao 설정

1. Kakao Developers → **내 애플리케이션 → 애플리케이션 추가하기**에서 앱을 만든다.
2. **제품 설정 → 카카오 로그인 → 활성화 설정**을 ON으로 설정한다.
3. **Redirect URI**에 환경별 callback을 등록한다.
   - Preview: `https://on-my-way-pr-3.jungslawyer.workers.dev/api/auth/callback/kakao`
   - Production: `https://<production-domain>/api/auth/callback/kakao`
4. **동의항목**은 닉네임·프로필·이메일 중 제품에 필요한 최소 항목만 요청한다. 이메일 제공 거부 또는 미제공을 허용한다.
5. **앱 키 → REST API 키**를 `KAKAO_CLIENT_ID`로 저장한다.
6. **보안 → Client Secret**을 활성화했다면 `KAKAO_CLIENT_SECRET`으로 저장한다. 활성화하지 않았다면 Worker는 Client ID만으로 구성 여부를 판단한다.
7. 비즈 앱 전환이나 검수가 필요한 개인정보 scope는 출시 전에 별도 승인 상태를 확인한다.

공식 문서: [Kakao Login](https://developers.kakao.com/docs/latest/ko/kakaologin/common), [Supabase Kakao 참고](https://supabase.com/docs/guides/auth/social-login/auth-kakao)

## 6. Naver 설정

1. Naver Developers → **Application → 애플리케이션 등록**으로 이동한다.
2. 사용 API에서 **네이버 로그인**을 선택한다.
3. 제공 정보는 닉네임·프로필 이미지·이메일 중 최소 항목만 선택한다. 이메일은 고유 키로 사용하지 않는다.
4. 서비스 URL에 환경 origin을 등록한다.
5. Callback URL에 다음을 등록한다.
   - Preview: `https://on-my-way-pr-3.jungslawyer.workers.dev/api/auth/callback/naver`
   - Production: `https://<production-domain>/api/auth/callback/naver`
6. Client ID와 Client Secret을 각각 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`으로 저장한다.
7. 개발 상태에서는 등록된 테스트 계정만 가능한지 확인하고, 출시 전 검수 상태와 서비스 URL을 재확인한다.

Worker는 state를 KV에 저장하고 code를 Naver token endpoint에서 교환한 뒤 profile API의 `response.id`만 identity 기준으로 사용한다.

공식 문서: [네이버 로그인 API](https://developers.naver.com/docs/login/api/api.md)

## 7. Apple Developer 설정

Apple 웹 로그인에는 유료 Apple Developer Program, Primary App ID, Services ID, Sign in with Apple key가 필요하다.

1. Apple Developer → **Certificates, Identifiers & Profiles → Identifiers**에서 Primary App ID를 만들거나 기존 App ID를 연다.
2. **Sign in with Apple** capability를 활성화한다.
3. Identifiers에서 **Services IDs**를 만들고 Primary App ID에 연결한다.
4. Services ID의 **Sign in with Apple → Configure**에서 Website domain과 Return URL을 등록한다.
   - Preview Return URL: `https://on-my-way-pr-3.jungslawyer.workers.dev/api/auth/callback/apple`
   - Production Return URL: `https://<production-domain>/api/auth/callback/apple`
5. **Keys**에서 Sign in with Apple key를 생성하고 `.p8` 파일을 한 번만 내려받아 안전한 비밀 저장소에 보관한다.
6. `APPLE_CLIENT_ID`에는 Services ID, `APPLE_TEAM_ID`에는 Team ID, `APPLE_KEY_ID`에는 Key ID, `APPLE_PRIVATE_KEY`에는 `.p8` 원문을 Worker secret으로 저장한다.
7. Apple private email relay를 사용할 경우 **Services → Sign in with Apple for Email Communication**에서 발신 도메인·이메일을 등록한다.

Worker는 매 로그인마다 짧은 수명의 ES256 client secret을 생성한다. Apple id_token은 Apple JWKS로 RS256 서명을 검증하고 issuer, audience, expiration, nonce, subject를 확인한다. 이름은 최초 승인 때만 전달될 수 있으므로 최초 값만 저장하고 이후 누락 시 덮어쓰지 않는다.

`workers.dev` Preview 도메인이 Apple Website domain 정책 또는 운영 심사에 맞지 않으면 우회하지 말고 `staging.<custom-domain>`을 별도로 연결한다. Production은 브랜드와 피싱 방지를 위해 custom domain을 권장한다.

공식 문서: [Sign in with Apple REST API](https://developer.apple.com/documentation/signinwithapplerestapi), [Supabase Apple 설정 참고](https://supabase.com/docs/guides/auth/social-login/auth-apple)

## 8. Preview 환경 설정

- Worker: `on-my-way-pr-3`
- Config: `wrangler.preview.jsonc`
- KV: Preview 전용 `USERS_KV`
- `APP_ENV=preview`
- `ALLOW_DEV_LOGIN=false`
- `ALLOW_DEMO_BILLING=false`
- Preview Provider 앱 또는 Preview callback을 별도로 등록한다.
- Production Client Secret과 Production KV를 Preview에서 사용하지 않는다.

Secret 등록 예시(값은 터미널 prompt에서만 입력):

```powershell
npx wrangler secret put SESSION_SECRET --config wrangler.preview.jsonc
npx wrangler secret put IDENTITY_SECRET --config wrangler.preview.jsonc
npx wrangler secret put GOOGLE_CLIENT_ID --config wrangler.preview.jsonc
npx wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler.preview.jsonc
```

나머지 Provider secret도 같은 방식으로 등록한다. 명령행 인자로 실제 값을 넣지 않는다.

## 9. Production 환경 설정

- Config: `wrangler.jsonc`
- `APP_ENV=production`
- Production 전용 `USERS_KV`, Provider 앱, callback, secret을 사용한다.
- `ALLOW_DEV_LOGIN`과 테스트 fixture는 설정하지 않는다.
- Production custom domain, HTTPS, HSTS, CSP, CORS를 배포 후 다시 확인한다.

## 10. GitHub Actions Secrets

PR Preview 배포 workflow에는 다음만 필요하다.

- `CLOUDFLARE_API_TOKEN`: 해당 Worker/KV 배포에 필요한 최소 권한 토큰
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account identifier

OAuth Provider secret과 Apple private key를 GitHub Actions에 복제하지 않는다. 이 값은 Cloudflare Worker 환경별 secret 저장소에서만 관리한다.

## 11. Cloudflare Worker Secrets

필수 공통:

- `SESSION_SECRET`: 32자 이상의 예측 불가능한 세션 서명 비밀값
- `IDENTITY_SECRET`: 내부 사용자 ID 파생 전용 비밀값(권장). 없으면 `SESSION_SECRET`을 사용한다.

Provider별:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`(Kakao 콘솔에서 활성화한 경우)
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
- `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`

결제·운영 기존 secret:

- `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`
- `OPENAI_API_KEY`
- `ADMIN_PASSWORD` 또는 KV에 저장된 관리자 비밀번호

## 12. CSP와 CORS

- OAuth 동의 화면은 top-level redirect로 열리며 Provider script를 클라이언트에서 로드하지 않는다. 따라서 Provider 도메인을 `script-src`, `connect-src`, `frame-src`에 무분별하게 추가할 필요가 없다.
- API는 같은 origin 요청만 허용한다.
- Apple `form_post` callback만 `Origin: https://appleid.apple.com`인 POST를 예외적으로 허용하고 state·nonce를 다시 검증한다.
- `*`, `unsafe-eval`, 모든 frame/connect 허용은 금지한다.
- Provider access token, code, state, error_description은 로그에 출력하지 않는다.

## 13. 실제 로그인 수동 테스트

각 Provider마다 Preview와 Production에서 다음을 수행한다.

1. 로그인 버튼을 한 번 클릭한다.
2. 정확한 Provider 동의 화면과 등록된 앱 이름인지 확인한다.
3. 동의 후 callback과 앱 복귀가 성공하는지 확인한다.
4. 주소창에 code, state, token, error_description이 남지 않는지 확인한다.
5. 새로고침 후 세션이 복원되는지 확인한다.
6. 로그아웃 후 보호 API가 401을 반환하는지 확인한다.
7. 취소·동의 거부·잘못된 callback에서 spinner가 종료되고 재시도 안내가 표시되는지 확인한다.
8. 브라우저 콘솔과 Network에서 secret이나 Provider access token이 노출되지 않는지 확인한다.

## 14. 계정 A/B 데이터 격리 테스트

1. 익명 상태에서 목표를 만든다.
2. 계정 A로 로그인하고 익명 데이터 가져오기 질문에 각각 수락·거절을 테스트한다.
3. 계정 A에서 목표를 만든 후 로그아웃한다.
4. 계정 B로 로그인하여 A의 목표·기록·XP가 보이지 않는지 확인한다.
5. 계정 B 데이터를 만든 뒤 로그아웃한다.
6. A로 다시 로그인하여 A 데이터만 복원되는지 확인한다.

현재 저장 키는 `onmyway:user:{internalUserId}:state`, 익명 키는 `onmyway:anonymous:{deviceId}:state`다. 이는 브라우저 내 임시 격리이며 기기 간 동기화를 제공하지 않는다.

## 15. 로그아웃과 세션 만료 테스트

- 로그아웃 요청 후 `session:{sessionId}`가 삭제되는지 확인한다.
- 이전 쿠키를 다시 보내도 `/api/auth/session`이 사용자를 반환하지 않아야 한다.
- 만료 세션, 변조 cookie, 잘못된 issuer/audience/signature/sub를 거부해야 한다.
- 로그아웃 직후 메모리·DOM의 사용자 정보가 사라지고 익명 namespace로 전환되어야 한다.

## 16. Provider별 오류 코드

| 상황 | 사용자 표시 |
|---|---|
| 사용자 취소 | 로그인이 취소되었으며 다른 방법을 선택할 수 있음 |
| state 누락·불일치·만료·재사용 | 로그인 확인 시간이 만료되어 재시도 필요 |
| token/profile/id_token 검증 실패 | 로그인 정보를 확인하지 못했으며 재시도 또는 다른 방법 안내 |
| Provider 설정 누락 | 로그인 설정이 아직 완료되지 않았음 |
| 401 | 세션 만료, 다시 로그인 필요 |
| 403 | 권한 또는 요청 출처 확인 필요 |
| 429 | 잠시 후 재시도 |

내부 stack, code 원문, Client Secret은 사용자 메시지에 포함하지 않는다.

## 17. 계정 연결 정책

이메일이 같아도 자동 연결하지 않는다. 현재 MVP에는 계정 연결 UI가 없으므로 서로 다른 Provider identity는 별도 내부 계정이 될 수 있다. 향후 연결 기능은 로그인된 세션에서 추가 Provider 인증, 기존 identity 충돌 검사, 사용자 재확인, 감사 로그를 모두 구현한 뒤 제공한다.

## 18. Apple private email 처리

- `@privaterelay.appleid.com` 이메일을 정상 Provider 부가 정보로 저장한다.
- relay 이메일을 내부 사용자 ID나 자동 연결 기준으로 사용하지 않는다.
- 사용자가 이메일을 숨기거나 이후 callback에서 이메일·이름이 누락되어도 기존 값을 삭제하거나 기본값으로 덮어쓰지 않는다.

## 19. 사용자 탈퇴 및 identity 삭제 고려사항

현재 계정 탈퇴 API는 구현하지 않았다. 출시 전에 다음 원자적 흐름이 필요하다.

1. 최근 인증 또는 재인증
2. 모든 app session 폐기
3. 결제·구독 상태 확인 및 정책에 따른 해지
4. Provider identity 매핑 삭제
5. user와 서버 데이터 삭제 또는 법적 보존 분리
6. Apple 사용 시 token revoke 및 server-to-server notification 검토
7. 감사 로그에는 최소 정보만 보존

## 20. 출시 전 체크리스트

- [ ] 네 Provider 콘솔에 Preview/Production callback 등록
- [ ] Preview/Production Provider 앱 또는 credentials 분리
- [ ] Preview/Production KV 분리
- [ ] `SESSION_SECRET`, `IDENTITY_SECRET` 등록
- [ ] Apple `.p8` 비밀 저장 및 유출 검사
- [ ] Google consent screen 테스트/검수 상태 확인
- [ ] Kakao 동의항목·비즈 앱·검수 상태 확인
- [ ] Naver 개발/검수 상태와 테스트 계정 확인
- [ ] Apple Services ID, domain, Return URL 확인
- [ ] 실제 네 Provider 로그인·취소·오류 수동 QA
- [ ] 계정 A/B와 익명 데이터 수락·거절 QA
- [ ] 로그아웃·만료·401 재로그인 QA
- [ ] iPhone Safari·Galaxy Chrome QA
- [ ] 운영 CSP/CORS와 브라우저 Network 점검
- [ ] 계정 탈퇴와 서버 데이터 동기화 구현 여부에 따른 출시 범위 결정
