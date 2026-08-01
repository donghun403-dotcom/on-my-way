# 사문 판정의 살아있는 집합 — 런타임 조립 지점

클래스 이름이 런타임에 조립되면 소스에 문자열로 존재하지 않는다. 문자열 검색만으로
사문을 판정하면 **살아있는 CSS를 지운다.** 이 문서는 그 조립 지점을 전수로 적는다.

조사 방법 — 이 정규식이 전부를 찾는다:

```
(className|classList\.(add|toggle|remove))[^;]*(\$\{|\+ )
```

```bash
grep -rnE '(className|classList\.(add|toggle|remove))[^;]*(\$\{|\+ )' script.js *.mjs *.js | grep -v '\.test\.'
```

## 조립 지점 5곳

| 지점 | 코드 | 만들어지는 클래스 | 열거 |
| --- | --- | --- | --- |
| `script.js:7595` | `` `chat-turn ${isOllie ? "is-ollie" : "is-user"}` `` | `is-ollie` · `is-user` | 리터럴 — 검색으로 잡힌다 |
| `script.js:8402` | `` `task-row task-${period.theme}` `` | `task-morning` · `task-afternoon` · `task-evening` · `task-night` | **닫힘** |
| `script.js:8932` | `` `journey-stop journey-${stop.theme}` `` | `journey-room` · `journey-path` · `journey-forest` · `journey-hill` · `journey-garden` | **닫힘** |
| `script.js:9743` | `` `book-page ${className}` `` | `book-cover` · `book-foreword` · `book-stats` · `book-days` · `book-letter` | 호출부 5곳 전부 리터럴 |
| `script.js:10165` | `` `daily-memory-item diary-entry mood-${normalizeMemoryMood(memory.mood)}` `` | `mood-happy` · `mood-calm` · **그 외 저장값 무엇이든** | **안 닫힘 → 접두사째 살림** |

값의 출처:

- 시간대 `theme` — `script.js:8355-8358` (`morning` `afternoon` `evening` `night`)
- 여정 단계 `theme` — `script.js:8915-8919` (`room` `path` `forest` `hill` `garden`)
- `normalizeMemoryMood` — `script.js:8988-8990`
- `createBookPage` 호출부 — `script.js:9764` `9775` `9784` `9806` `9837`

## 규칙

- **열거가 닫히는 접두사**는 그 값들만 살아있는 집합에 더한다.
- **열거가 닫히지 않는 접두사**(`mood-`)는 **접두사로 시작하는 모든 클래스를 살린다.**

  ```js
  function normalizeMemoryMood(mood) {
    return { light: "happy", steady: "calm" }[mood] || mood || "calm";
  }
  ```

  `[mood] || mood`이므로 매핑에 없는 값은 **그대로 통과한다.** 저장된 임의의 mood가
  클래스가 되므로 열거할 수 없다. 닫을 수 없는 것을 닫았다고 가정하지 않는다.

## 이 조사가 실제로 막은 오삭제

순진한 문자열 검색은 아래 6개를 사문이라 판정했다. **전부 살아 있다.**

```
task-afternoon  task-evening  task-night
journey-forest  journey-hill  journey-garden
```

지웠다면 오늘 화면의 시간대별 테마와 여정 지도의 단계별 스타일이 죽었을 것이다.

`journey-room`·`journey-path`는 **우연히** 살아남았다 — `room`·`path`가 저장소 다른
곳에 부분 문자열로 있었기 때문이다. 같은 조립에서 나온 형제인데 셋은 사문으로,
둘은 생존으로 갈렸다. **검색은 양방향으로 못 믿는다.**

## 이미 머지된 삭제 재검사 (PR #61)

PR #61이 지운 43개 클래스에 조립 접두사가 걸리는지 확인했다. `journey-lane` 하나가
접두사에 걸렸지만 `lane`은 theme 값 다섯 개(`room` `path` `forest` `hill` `garden`)에
없다 — 조립으로 만들어지지 않으므로 사문 판정이 맞았다. **되돌릴 이유가 없다.**

## 새 조립 지점을 만들면

위 정규식에 걸리는 코드를 추가했다면 **이 표에 행을 더하라.** 값이 열거되면 그 값들을,
열거되지 않으면 접두사를 적는다. 다음 사문 청소가 이 문서를 살아있는 집합의 근거로
쓴다.
