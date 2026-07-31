# 실기기 검증용 Capacitor 셸

**제품이 아니다.** `docs/capacitor-spike.md` §5에 남은 "실기기 없이는 확인 불가능한 것"
여섯 개를 재기 위한 계측 장치다. 이 셸을 앱스토어에 낼 계획은 없고, 여기서 잰 결과가
나온 뒤에 진짜 앱 셸의 형태를 정한다.

체크리스트와 관측 기록지는 [`docs/capacitor-shell-checklist.md`](../docs/capacitor-shell-checklist.md).

## 서버 코드를 고치지 않는다

이 단계는 **무엇을 고쳐야 하는지를 재는 단계**다. 고칠 곳을 미리 정해 놓고 재면 재는 게
아니라 확인이 된다. `worker.mjs`도 `script.js`도 이 PR에서 한 줄도 바뀌지 않았다.

## 두 구성

| | A | B |
| --- | --- | --- |
| 웹 에셋 | 원격 (`server.url`) | 앱 번들 |
| WebView origin | `https://onmyway.olivenrich.com` | `https://onmyway.olivenrich.com` (`server.hostname`으로 위장) |
| `CapacitorHttp` | 끔 | 켬 |
| appId | `com.olivenrich.onmyway.verifya` | `com.olivenrich.onmyway.verifyb` |
| 런처 이름 | OMW 검증 A | OMW 검증 B |

appId가 다르므로 **한 대에 둘 다 설치해서 번갈아 볼 수 있다.** 같았다면 B를 설치하는
순간 A가 지워져서 재측정 비용이 생긴다.

각 구성이 무엇을 묻는지는 `scripts/prepare.mjs` 상단 주석에 적어 두었다.

## 로컬에서 빌드하기

Android SDK와 JDK 21이 필요하다. 없으면 GitHub Actions의 `Android debug APK`
워크플로를 `workflow_dispatch`로 돌려 APK 아티팩트를 받는 쪽이 빠르다.

```bash
cd mobile
npm ci
node scripts/prepare.mjs b      # 또는 a
npx cap add android             # 이미 있으면 건너뛴다
npx cap sync android
cd android && ./gradlew assembleDebug
```

산출물: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`

**구성을 바꿀 때는 `mobile/android`를 지우고 다시 만든다.** `cap add android`가 appId를
네이티브 프로젝트에 굽기 때문에, `prepare.mjs`만 다시 돌려서는 패키지 이름이 바뀌지 않는다.

```bash
rm -rf mobile/android
```

## 왜 `mobile/android/`를 커밋하지 않는가

`cap add android`가 만드는 것은 Gradle 보일러플레이트 수십 파일이고, 우리가 손댈 내용이
아직 하나도 없다. 커밋하면 (1) 리뷰할 수 없는 디프가 리포에 들어오고 (2) Capacitor 버전을
올릴 때마다 그 디프를 사람이 병합해야 한다.

지금은 템플릿에서 매번 새로 만드는 쪽이 재현 가능하다. **네이티브 쪽에 우리 코드가
생기는 순간**(딥링크 인텐트 필터, 인쇄 브릿지 등) 이 판단을 다시 한다 — 그때는 커밋해야
한다.

## 번들 목록이 낡으면 빌드가 깨진다

구성 B가 번들에 넣는 파일은 `scripts/prepare.mjs`의 `BUNDLE_ENTRIES`에 명시돼 있고,
목록의 항목이 리포에 없으면 **빌드가 그 자리에서 실패한다**. `.assetsignore`의 제외
규칙을 흉내 내지 않은 이유가 이것이다 — 규칙으로 뽑으면 무엇이 들어갔는지가 해석에
달리고, 화면이 깨졌을 때 파일이 빠진 건지 코드가 깨진 건지 구분되지 않는다.

알려진 구멍 하나: 확장자 없는 법률 페이지 경로(`/privacy`, `/terms`, `/support`,
`/delete-account`)는 워커가 매핑하는 것이라 **번들에서는 열리지 않는다.** 구성 B에서
그 링크는 깨진다. 이번 회차의 측정 항목이 아니라서 그대로 뒀다.
