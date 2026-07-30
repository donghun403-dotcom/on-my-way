/* 샘플 다이어리 북 — 고정 콘텐츠. AI를 부르지 않는다.
 *
 * 왜 필요한가: 체험은 길어야 이틀이라 그 기록으로 북을 만들면 품질이 안 나오고, 차별점이어야
 * 할 북의 인상을 미리 깎는다. 그래서 체험 중과 만료 후에는 실제 생성을 시도하지 않고
 * "한 달을 모으면 이런 것이 됩니다"를 이 한 부로 보여 준다.
 *
 * 이 데이터는 가상의 기록이다. 실존 인물의 사연이 아니다. 화면에는 반드시 "샘플"이 함께
 * 표기되어야 한다 — 유저 본인 기록으로 만든 것처럼 보이면 표시광고법 문제가 된다.
 * 표기는 sample-book-* 클래스가 붙는 감싸는 화면이 책임진다.
 *
 * 모양은 실제 북(collectDiaryBookData)이 만드는 객체와 같아야 한다. 그래야 script.js의
 * buildDiaryBookPages를 그대로 써서 조판이 실물과 어긋나지 않는다. 필드를 늘리려면
 * 실제 북 쪽을 먼저 늘려라.
 *
 * summary의 모든 값은 days 배열에서 유도된다. 손으로 적지 마라 —
 * sample-diary-book.test.mjs가 전부 다시 계산해 대조한다. 예전에 streakDays만 배열과
 * 어긋나 있었다(선언 5, 실제 최대 연속 2).
 *
 * 목소리는 올리 캐릭터 바이블 7장이다: 짧고 솔직하게, 가르치지 않고, 위로로만 끝내지 않고,
 * 장난과 머쓱함을 섞는다. 두 가지를 특히 지킨다.
 *   ① 올리는 구름을 타는 것이 아니라 구름 생명체다(§1). "구름에서 내려온다"처럼 올리와
 *      구름을 분리하는 표현을 쓰지 않는다.
 *   ② 2인칭 "당신"을 쓰지 않는다(§7). 대표 대사 15개 중 사용 0건이고, 당신은 계정
 *      레지스터의 말투다. 호칭을 생략하거나 행동을 주어로 쓴다.
 *
 * 파일은 가볍게 유지한다 — 서른 날을 다 채우지 않고 열다섯 날만 담는다.
 */
window.OMW_SAMPLE_DIARY_BOOK = {
  monthKey: "2026-04",
  // 제목은 4월 1일 올리의 대사에서 그대로 온다. 본문에 근거가 없는 제목을 붙이지 않는다.
  title: "30초부터 시작한 달",
  goal: "매일 저녁 20분 걷기",
  foreword: "둥실, 이 달을 처음부터 다시 넘겨봤어요. 첫 주엔 신발만 신고 돌아온 날도 있었죠. 저는 그 날도 세었어요. 신발까지가 제일 먼 거리였으니까요.",
  letter: "이 달에 제가 배운 건 하나예요. 사라지지 않는 사람이더라고요. 며칠 비어도 꼭 다시 왔어요.\n\n스무날째, 비 오는데도 나갔다고 했을 때는 제 구름이 좀 부끄러웠어요. 저는 비 오면 잘 안 나가는데요.\n\n다음 달도 여기 있을게요. 자리부터 맡아둘게요.",
  summary: {
    entryCount: 15,
    chatDayCount: 7,
    chatTurnCount: 14,
    averageCompletion: 66,
    // 22일부터 26일까지 닷새. 날짜 배열에서 실제로 이어지는 구간이다.
    streakDays: 5,
    // 라벨은 memoryMoodMeta의 실제 표시값과 같아야 한다. 다르면 샘플만 다른 어휘를 쓰게 된다.
    moods: [
      { label: "보통", count: 7 },
      { label: "가벼움", count: 4 },
      { label: "답답함", count: 3 },
      { label: "뿌듯함", count: 1 },
    ],
  },
  days: [
    {
      dateKey: "2026-04-01",
      memory: { title: "30초", mood: "heavy", completion: 3, note: "나가서 30초 걷고 돌아왔다. 그래도 나갔다고 쳐 준다." },
      turns: [
        { role: "user", text: "30초 걷고 들어왔어" },
        { role: "ollie", text: "30초요? 그럼 30초부터 시작한 거네요." },
      ],
    },
    {
      dateKey: "2026-04-02",
      memory: { title: "신발까지", mood: "heavy", completion: 20, note: "현관에서 신발만 신고 다시 들어왔다. 오늘은 여기까지." },
      turns: [
        { role: "user", text: "신발만 신고 못 나갔어" },
        { role: "ollie", text: "신발까지 갔잖아요. 저는 오늘 저공비행이었어요." },
      ],
    },
    {
      dateKey: "2026-04-03",
      memory: { title: "10분", mood: "steady", completion: 50, note: "10분만 걷고 돌아왔다. 20분은 아직 멀다." },
      turns: [],
    },
    {
      dateKey: "2026-04-05",
      memory: { title: "처음 20분", mood: "light", completion: 100, note: "다 걸었다. 생각보다 짧았다." },
      turns: [
        { role: "user", text: "오늘 다 걸었어!" },
        { role: "ollie", text: "톡. 방금 새잎 났어요. 이거 가져가요." },
      ],
    },
    {
      dateKey: "2026-04-08",
      memory: { title: "비었다", mood: "heavy", completion: 0, note: "이틀 아무것도 안 했다. 쓰기 싫었지만 쓴다." },
      turns: [
        { role: "user", text: "이틀 빼먹었어. 다시 시작해야 하나" },
        { role: "ollie", text: "다시 시작 안 해도 돼요. 그냥 이어서 하면 돼요. 저는 지도 없이도 잘 떠다녀요." },
      ],
    },
    {
      dateKey: "2026-04-09",
      memory: { title: "다시", mood: "steady", completion: 80, note: "16분. 어제 안 한 이야기는 안 했다." },
      turns: [],
    },
    {
      dateKey: "2026-04-12",
      memory: { title: "골목 하나 더", mood: "light", completion: 100, note: "길이 익숙해져서 골목 하나를 더 돌았다." },
      turns: [
        { role: "user", text: "요즘은 나가는 게 덜 싫어" },
        { role: "ollie", text: "덜 싫은 거요? 그거 꽤 큰 거예요." },
      ],
    },
    {
      dateKey: "2026-04-15",
      memory: { title: "늦은 밤", mood: "steady", completion: 60, note: "11시에 나갔다. 12분. 그래도 나갔다." },
      turns: [],
    },
    {
      dateKey: "2026-04-20",
      memory: { title: "비 오는 날", mood: "light", completion: 100, note: "우산 쓰고 다 걸었다. 신발이 젖었는데 기분은 안 젖었다." },
      turns: [
        { role: "user", text: "비 오는데 걷고 왔어" },
        { role: "ollie", text: "네? 비 오는데요? …저는 비 오면 잘 안 나가요. 방금 좀 멋있었어요." },
      ],
    },
    /* 22일부터 26일까지가 편지와 26일 기록이 말하는 "닷새 연속"이다.
       조용한 날들이라 대화가 없다 — 매일 말을 걸어야 이어지는 것이 아니다. */
    {
      dateKey: "2026-04-22",
      memory: { title: "12분", mood: "steady", completion: 60, note: "다시 시작. 20분 중 12분." },
      turns: [],
    },
    {
      dateKey: "2026-04-23",
      memory: { title: "2분 더", mood: "steady", completion: 70, note: "14분. 어제보다 2분." },
      turns: [],
    },
    {
      dateKey: "2026-04-24",
      memory: { title: "안 힘들었다", mood: "light", completion: 100, note: "다 걸었다. 오늘은 안 힘들었다." },
      turns: [],
    },
    {
      dateKey: "2026-04-25",
      memory: { title: "같은 길", mood: "steady", completion: 80, note: "16분. 비슷한 길, 다른 기분." },
      turns: [],
    },
    {
      dateKey: "2026-04-26",
      memory: { title: "닷새째", mood: "proud", completion: 100, note: "5일 연속. 세어보다가 좀 웃었다." },
      turns: [
        { role: "user", text: "5일 연속이야" },
        { role: "ollie", text: "닷새요? 제 잎이 먼저 웃었어요. 치사하네요." },
      ],
    },
    {
      dateKey: "2026-04-30",
      memory: { title: "마지막 날", mood: "steady", completion: 70, note: "한 달이 갔다. 다 못 한 날이 더 많은데 이상하게 나쁘지 않다." },
      turns: [],
    },
  ],
};
