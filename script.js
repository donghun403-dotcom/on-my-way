const goalForm = document.querySelector(".goal-form");
const goalInput = document.querySelector("#goalInput");
const designGoal = document.querySelector("#designGoal");
const menuButton = document.querySelector(".menu-button");
const mainNav = document.querySelector(".main-nav");
const navLinks = document.querySelectorAll(".main-nav a");
const sectionNavLinks = document.querySelectorAll(".app-tabs a, .bottom-tabbar a");
const themeButtons = document.querySelectorAll(".theme-button");
const companionArt = document.querySelector("#companionArt");
const themeTitle = document.querySelector("#themeTitle");
const themePath = document.querySelector("#themePath");
const themeText = document.querySelector("#themeText");
const personalityForm = document.querySelector("#personalityForm");
const birthDateInput = document.querySelector("#birthDate");
const birthTimeInput = document.querySelector("#birthTime");
const birthPlaceInput = document.querySelector("#birthPlace");
const mbtiInput = document.querySelector("#mbti");
const goalPeriodInput = document.querySelector("#goalPeriod");
const currentStateInput = document.querySelector("#currentState");
const manseProfile = document.querySelector("#manseProfile");
const mbtiProfile = document.querySelector("#mbtiProfile");
const planningStyle = document.querySelector("#planningStyle");
const aiPreviewButton = document.querySelector("#aiPreviewButton");
const aiPreviewStatus = document.querySelector("#aiPreviewStatus");
const aiPreviewTitle = document.querySelector("#aiPreviewTitle");
const aiPreviewList = document.querySelector("#aiPreviewList");
const aiCoachMessage = document.querySelector("#aiCoachMessage");
const previewPersonality = document.querySelector("#previewPersonality");
const previewStyle = document.querySelector("#previewStyle");
const previewAction = document.querySelector("#previewAction");
const dashboardGoalPreview = document.querySelector("#dashboardGoalPreview");
const dashboardProgressValue = document.querySelector("#dashboardProgressValue");
const dashboardProgressBar = document.querySelector("#dashboardProgressBar");
const dashboardPaceText = document.querySelector("#dashboardPaceText");
const executionGoal = document.querySelector("#executionGoal");
const executionStyle = document.querySelector("#executionStyle");
const executionPeriod = document.querySelector("#executionPeriod");
const executionDay = document.querySelector("#executionDay");
const executionProgress = document.querySelector("#executionProgress");
const executionProgressBar = document.querySelector("#executionProgressBar");
const executionMessage = document.querySelector("#executionMessage");
const executionFirstTask = document.querySelector("#executionFirstTask");
const executionChecks = document.querySelectorAll(".execution-check");
const completeTodayButton = document.querySelector("#completeTodayButton");
const executionThemeButtons = document.querySelectorAll(".execution-theme-button");
const executionCompanion = document.querySelector("#executionCompanion");
const executionCompanionTitle = document.querySelector("#executionCompanionTitle");
const executionCompanionPath = document.querySelector("#executionCompanionPath");
const executionCompanionText = document.querySelector("#executionCompanionText");
const downloadPlanButton = document.querySelector("#downloadPlanButton");

const themes = {
  plant: {
    title: "식물 키우기",
    path: "씨앗 → 새싹 → 꽃",
    text: "30일 뒤 작은 정원이 완성됩니다. 오늘은 새싹이 고개를 들었어요.",
    image: "assets/plant.svg",
    alt: "식물 성장 캐릭터",
  },
  dog: {
    title: "강아지 키우기",
    path: "첫 만남 → 산책 친구",
    text: "매일 체크인할 때마다 조금 더 친해집니다. 오늘은 첫 산책을 기다리고 있어요.",
    image: "assets/dog.svg",
    alt: "강아지 성장 캐릭터",
  },
  cat: {
    title: "고양이 키우기",
    path: "낯가림 → 무릎 친구",
    text: "차분히 쌓아가는 목표와 잘 어울립니다. 오늘은 가까이 앉아 응원해요.",
    image: "assets/cat.svg",
    alt: "고양이 성장 캐릭터",
  },
  home: {
    title: "집짓기",
    path: "터 → 방 → 작은 집",
    text: "하루 계획을 완수할 때마다 공간이 채워집니다. 오늘은 첫 벽을 세웠어요.",
    image: "assets/home.svg",
    alt: "집짓기 성장 캐릭터",
  },
};

goalForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = goalInput.value.trim();
  if (designGoal) designGoal.value = value || designGoal.value;
  document.querySelector("#designFlow")?.scrollIntoView({ behavior: "smooth" });
});

goalInput?.addEventListener("input", () => {
  if (designGoal) designGoal.value = goalInput.value.trim();
});

menuButton?.addEventListener("click", () => {
  const isOpen = mainNav.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
});

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    mainNav?.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
  });
});

function setActiveSectionLink(hash) {
  const activeTargets = hash === "#top" ? ["#top", "#diagnosis"] : [hash];
  sectionNavLinks.forEach((link) => {
    const isActive = activeTargets.includes(link.getAttribute("href"));
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

sectionNavLinks.forEach((link) => {
  link.addEventListener("click", () => {
    const hash = link.getAttribute("href");
    if (hash) setActiveSectionLink(hash);
  });
});

const sectionAnchors = ["#top", "#designFlow", "#companion", "#pricing"]
  .map((hash) => ({ hash, element: document.querySelector(hash) }))
  .filter((item) => item.element);

if (sectionAnchors.length > 0) {
  window.addEventListener(
    "scroll",
    () => {
      const current = [...sectionAnchors].reverse().find((item) => item.element.offsetTop <= window.scrollY + 180);
      if (current) setActiveSectionLink(current.hash);
    },
    { passive: true },
  );
}

themeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const theme = themes[button.dataset.theme];
    if (!theme) return;

    themeButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");

    companionArt.src = theme.image;
    companionArt.alt = theme.alt;
    themeTitle.textContent = theme.title;
    themePath.textContent = theme.path;
    themeText.textContent = theme.text;
  });
});

const stems = [
  { ko: "갑", element: "목", trait: "시작과 성장 욕구가 강한 확장형" },
  { ko: "을", element: "목", trait: "유연하게 쌓아가는 적응형" },
  { ko: "병", element: "화", trait: "몰입과 표현력이 강한 추진형" },
  { ko: "정", element: "화", trait: "섬세한 동기와 리듬이 중요한 집중형" },
  { ko: "무", element: "토", trait: "기반을 다지며 꾸준히 가는 안정형" },
  { ko: "기", element: "토", trait: "작은 단위로 관리할 때 강한 관리형" },
  { ko: "경", element: "금", trait: "기준과 결과가 분명할 때 강한 실행형" },
  { ko: "신", element: "금", trait: "정교한 피드백과 개선에 강한 분석형" },
  { ko: "임", element: "수", trait: "큰 흐름과 자율성이 필요한 탐색형" },
  { ko: "계", element: "수", trait: "차분한 관찰과 누적에 강한 기록형" },
];

const branches = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function getJulianDay(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function calculateSimpleManse(birthDate, birthTime) {
  const date = new Date(`${birthDate}T${birthTime || "12:00"}:00+09:00`);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const hour = date.getHours();
  const julianDay = getJulianDay(new Date(Date.UTC(year, date.getMonth(), date.getDate())));

  const yearStem = stems[positiveModulo(year - 4, 10)];
  const yearBranch = branches[positiveModulo(year - 4, 12)];
  const monthStem = stems[positiveModulo((year - 4) * 12 + month + 1, 10)];
  const monthBranch = branches[positiveModulo(month + 1, 12)];
  const dayStem = stems[positiveModulo(julianDay + 9, 10)];
  const dayBranch = branches[positiveModulo(julianDay + 1, 12)];
  const hourBranchIndex = positiveModulo(Math.floor((hour + 1) / 2), 12);
  const hourStem = stems[positiveModulo(dayStem.ko.charCodeAt(0) + hourBranchIndex, 10)];
  const hourBranch = branches[hourBranchIndex];

  return {
    pillars: {
      year: `${yearStem.ko}${yearBranch}`,
      month: `${monthStem.ko}${monthBranch}`,
      day: `${dayStem.ko}${dayBranch}`,
      hour: `${hourStem.ko}${hourBranch}`,
    },
    dayMaster: dayStem,
    summary: `${dayStem.ko}${dayBranch} 일주 기반으로 ${dayStem.element} 기운이 중심입니다. ${dayStem.trait} 성향으로 보고, 계획은 성취 기준과 하루 리듬을 함께 잡는 방식이 좋습니다.`,
  };
}

function analyzeMbti(mbti) {
  const upper = mbti.toUpperCase();
  const energy = upper.includes("E") ? "외부 자극과 공유가 동기 유지에 도움" : "혼자 집중할 수 있는 조용한 루틴이 중요";
  const structure = upper.includes("J") ? "마감과 체크리스트가 분명할수록 강함" : "선택지가 있는 유연한 계획이 유지에 유리";
  const feedback = upper.includes("T") ? "수치와 결과 중심 피드백 선호" : "응원과 의미 중심 피드백 선호";
  const rhythm = upper.includes("S") ? "구체적인 하루 행동으로 쪼갤 때 안정적" : "큰 방향과 이유가 선명해야 오래 지속";
  return `${upper}: ${energy}, ${structure}, ${feedback}, ${rhythm}.`;
}

function decidePlanningStyle(manse, mbti) {
  const isJudging = mbti.includes("J");
  const isIntrovert = mbti.includes("I");
  const isFeeling = mbti.includes("F");
  const element = manse.dayMaster.element;

  if ((element === "토" || element === "금") && isJudging) return "루틴 점검형";
  if ((element === "화" || element === "목") && !isIntrovert) return "몰입 추진형";
  if (isFeeling) return "응원 성장형";
  if (element === "수" || mbti.includes("P")) return "유연 조정형";
  return "균형 실행형";
}

function buildAiPlanPayload({ goal, period, currentState, birthDate, birthTime, birthPlace, mbti, manse, style }) {
  return {
    endpoint: "POST /api/ai/goal-plan",
    modelRole: "goal_planning_coach",
    input: {
      goal,
      periodDays: Number(period),
      currentState,
      birth: {
        date: birthDate,
        time: birthTime,
        place: birthPlace,
      },
      mbti,
      manseoryeok: manse,
      recommendedPlanningStyle: style,
    },
    instruction:
      "만세력 기반 성향과 MBTI 성향을 함께 비교해 사용자가 목표를 달성하기 쉬운 계획 스타일을 정하고, 전체 기간 계획, 오늘의 스케줄, 체크인 방식, 성장 보상 메시지를 생성한다.",
    outputSchema: {
      personalitySummary: "string",
      planningStyle: "string",
      fullSchedule: "array",
      todaySchedule: "array",
      checkInRules: "array",
      companionGrowthPlan: "array",
      pdfSections: "array",
    },
  };
}

function getGoalKind(goal) {
  const text = goal.toLowerCase();
  if (text.includes("토익") || text.includes("시험") || text.includes("자격증")) return "exam";
  if (text.includes("운동") || text.includes("다이어트") || text.includes("체지방")) return "fitness";
  if (text.includes("취업") || text.includes("이직") || text.includes("포트폴리오")) return "career";
  if (text.includes("독서") || text.includes("습관")) return "habit";
  if (text.includes("저축") || text.includes("돈")) return "money";
  return "project";
}

function getGoalPlanTemplates(goal) {
  const kind = getGoalKind(goal);
  const templates = {
    exam: {
      firstAction: "단어 40개 + LC 1세트",
      weekTitle: "이번 주에는 공부 시간을 고정합니다",
      weekPlan: ["평일 같은 시간에 단어 40개를 먼저 끝냅니다.", "LC와 RC를 하루씩 번갈아 배치합니다.", "주말에는 오답만 모아 약한 유형을 다시 풉니다."],
      pace: "남은 기간 52일 · 현재 페이스 안정",
    },
    fitness: {
      firstAction: "20분 걷기 + 식사 기록 1개",
      weekTitle: "이번 주에는 운동보다 기록을 먼저 안정화합니다",
      weekPlan: ["평일 3일은 짧은 유산소부터 시작합니다.", "식사 기록은 완벽함보다 빠짐없는 체크를 우선합니다.", "주말에는 체중보다 컨디션 변화를 확인합니다."],
      pace: "남은 기간 52일 · 초반 루틴 형성 중",
    },
    career: {
      firstAction: "포트폴리오 목차 3개 정리",
      weekTitle: "이번 주에는 결과물의 뼈대를 먼저 만듭니다",
      weekPlan: ["첫날은 지원 직무와 필요한 증거를 정리합니다.", "중간에는 대표 프로젝트 1개를 완성도 있게 다듬습니다.", "주말에는 피드백 받을 버전을 만듭니다."],
      pace: "남은 기간 52일 · 산출물 중심 진행",
    },
    habit: {
      firstAction: "20분 실행 + 체크인 1회",
      weekTitle: "이번 주에는 반복 가능한 최소 단위를 찾습니다",
      weekPlan: ["하루 목표를 20분 이하로 유지합니다.", "못한 날은 다음 날 2배로 만들지 않고 다시 시작합니다.", "완료 후 한 줄 기록으로 흐름을 남깁니다."],
      pace: "남은 기간 52일 · 반복 안정화 중",
    },
    money: {
      firstAction: "이번 주 지출 3개 분류",
      weekTitle: "이번 주에는 돈의 흐름을 먼저 보이게 합니다",
      weekPlan: ["고정비와 변동비를 한 번에 분리합니다.", "작은 절약 목표를 하루 단위로 배치합니다.", "주말에는 목표 금액 대비 현재 위치를 확인합니다."],
      pace: "남은 기간 52일 · 추적 루틴 형성 중",
    },
    project: {
      firstAction: "작업 범위 3개로 나누기",
      weekTitle: "이번 주에는 시작 가능한 단위로 쪼갭니다",
      weekPlan: ["가장 작은 첫 산출물을 정의합니다.", "평일에는 30분 단위 실행을 반복합니다.", "주말에는 다음 주에 넘길 일을 다시 정렬합니다."],
      pace: "남은 기간 52일 · 실행 단위 정리 중",
    },
  };
  return templates[kind];
}

function buildLocalAiPreview(payload) {
  const { goal, periodDays, currentState, mbti, manseoryeok, recommendedPlanningStyle } = payload.input;
  const template = getGoalPlanTemplates(goal);
  const period = Number(periodDays) || 90;
  const progress = Math.max(12, Math.min(48, Math.round(1800 / period)));
  const personalitySummary = `${manseoryeok.dayMaster.trait} 성향과 ${mbti}의 유지 방식을 함께 보면, 처음부터 큰 계획을 밀어붙이기보다 오늘 실행할 단위를 선명하게 두는 편이 좋습니다.`;

  return {
    personalitySummary,
    planningStyle: `${recommendedPlanningStyle} 계획`,
    firstAction: template.firstAction,
    weekTitle: template.weekTitle,
    weekPlan: template.weekPlan,
    coachMessage: `${currentState || "현재 상태"}를 기준으로 보면, 이번 주는 완성보다 흐름을 만드는 것이 우선입니다.`,
    dashboard: {
      goal: goal.replace("하기", ""),
      progress,
      pace: template.pace,
    },
  };
}

async function requestAiPlan(payload) {
  // 실제 서비스에서는 이 함수에서 서버 API를 호출하고, 화면에는 응답 결과만 노출합니다.
  return buildLocalAiPreview(payload);
}

function renderAiPreview(preview) {
  if (planningStyle) planningStyle.textContent = preview.planningStyle.replace(" 계획", "");
  if (manseProfile) manseProfile.textContent = preview.personalitySummary;
  if (mbtiProfile) mbtiProfile.textContent = `${preview.planningStyle}으로 시작하고, 첫 행동은 "${preview.firstAction}"으로 잡습니다.`;
  if (aiPreviewTitle) aiPreviewTitle.textContent = preview.weekTitle;
  if (aiPreviewList) {
    aiPreviewList.innerHTML = preview.weekPlan.map((item) => `<li>${item}</li>`).join("");
  }
  if (aiCoachMessage) aiCoachMessage.textContent = preview.coachMessage;
  if (previewPersonality) previewPersonality.textContent = preview.personalitySummary;
  if (previewStyle) previewStyle.textContent = preview.planningStyle;
  if (previewAction) previewAction.textContent = preview.firstAction;
  if (dashboardGoalPreview) dashboardGoalPreview.textContent = preview.dashboard.goal;
  if (dashboardProgressValue) dashboardProgressValue.textContent = `${preview.dashboard.progress}%`;
  if (dashboardProgressBar) dashboardProgressBar.style.width = `${preview.dashboard.progress}%`;
  if (dashboardPaceText) dashboardPaceText.textContent = preview.dashboard.pace;
}

async function runPersonalityAnalysis({ showLoading = false } = {}) {
  if (!personalityForm) return;

  const goal = designGoal.value.trim() || goalInput?.value.trim() || "목표 미입력";
  const period = goalPeriodInput.value;
  const currentState = currentStateInput.value.trim();
  const birthDate = birthDateInput.value;
  const birthTime = birthTimeInput.value;
  const birthPlace = birthPlaceInput.value.trim();
  const mbti = mbtiInput.value;

  if (!birthDate || !birthTime || !mbti) {
    manseProfile.textContent = "생년월일시와 MBTI를 입력하면 성향 분석이 표시됩니다.";
    return;
  }

  const manse = calculateSimpleManse(birthDate, birthTime);
  const mbtiSummary = analyzeMbti(mbti);
  const style = decidePlanningStyle(manse, mbti);
  const payload = buildAiPlanPayload({
    goal,
    period,
    currentState,
    birthDate,
    birthTime,
    birthPlace,
    mbti,
    manse,
    style,
  });

  if (showLoading) {
    aiPreviewStatus.textContent = "AI가 목표 설계 중";
    aiPreviewButton.disabled = true;
    aiPreviewButton.textContent = "AI 미리보기 생성 중...";
  }

  const preview = await requestAiPlan(payload);
  renderAiPreview(preview);

  if (aiPreviewStatus) aiPreviewStatus.textContent = "AI 목표 설계 미리보기";
  if (aiPreviewButton) {
    aiPreviewButton.disabled = false;
    aiPreviewButton.textContent = "AI 목표 설계 미리보기";
  }

  try {
    localStorage.setItem(
      "omwExecutionPlan",
      JSON.stringify({
        goal,
        period: Number(period),
        currentState,
        mbti,
        style,
        firstAction: preview.firstAction,
        coachMessage: preview.coachMessage,
        manseSummary: manse.summary,
        mbtiSummary,
        aiPreview: preview,
        createdAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.warn("Unable to save execution plan", error);
  }
}

personalityForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  runPersonalityAnalysis({ showLoading: true });
});

[birthDateInput, birthTimeInput, birthPlaceInput, mbtiInput, goalPeriodInput, currentStateInput, designGoal].forEach((field) => {
  field?.addEventListener("change", runPersonalityAnalysis);
});

runPersonalityAnalysis();

const adminLoginForm = document.querySelector("#adminLoginForm");
const adminPassword = document.querySelector("#adminPassword");
const adminLogin = document.querySelector("#adminLogin");
const adminDashboard = document.querySelector("#adminDashboard");
const loginError = document.querySelector("#loginError");
const TEMP_ADMIN_PASSWORD = "OMW-2026";
const riskFilter = document.querySelector("#riskFilter");
const goalFilter = document.querySelector("#goalFilter");
const adminRows = document.querySelectorAll(".admin-table tbody tr[data-risk]");
const adminEmptyRow = document.querySelector(".admin-empty-row");

adminLoginForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (adminPassword.value.trim() === TEMP_ADMIN_PASSWORD) {
    loginError.textContent = "";
    adminLogin.style.display = "none";
    adminDashboard.classList.remove("locked");
    return;
  }

  loginError.textContent = "임시 비밀번호가 맞지 않습니다.";
});

function applyAdminTableFilters() {
  if (!adminRows.length) return;

  const risk = riskFilter?.value || "all";
  const goal = goalFilter?.value || "all";
  let visibleCount = 0;

  adminRows.forEach((row) => {
    const matchesRisk = risk === "all" || row.dataset.risk === risk;
    const matchesGoal = goal === "all" || row.dataset.goal === goal;
    const visible = matchesRisk && matchesGoal;
    row.hidden = !visible;
    if (visible) visibleCount += 1;
  });

  if (adminEmptyRow) {
    adminEmptyRow.hidden = visibleCount !== 0;
  }
}

[riskFilter, goalFilter].forEach((filter) => {
  filter?.addEventListener("change", applyAdminTableFilters);
});

applyAdminTableFilters();

function readExecutionPlan() {
  try {
    return JSON.parse(localStorage.getItem("omwExecutionPlan")) || {};
  } catch (error) {
    return {};
  }
}

function getExecutionState() {
  try {
    return JSON.parse(localStorage.getItem("omwExecutionState")) || {};
  } catch (error) {
    return {};
  }
}

function saveExecutionState(state) {
  try {
    localStorage.setItem("omwExecutionState", JSON.stringify(state));
  } catch (error) {
    console.warn("Unable to save execution state", error);
  }
}

function updateExecutionProgress() {
  if (!executionProgress || !executionProgressBar || !executionChecks.length) return;

  const checkedCount = [...executionChecks].filter((item) => item.checked).length;
  const taskBoost = Math.round((checkedCount / executionChecks.length) * 8);
  const progress = Math.min(100, 42 + taskBoost);
  const allDone = checkedCount === executionChecks.length;

  executionProgress.textContent = `${progress}%`;
  executionProgressBar.style.width = `${progress}%`;
  if (executionMessage) {
    executionMessage.textContent = allDone
      ? "오늘 계획을 모두 완료했어요. 성장 대상이 한 단계 자랐습니다."
      : `오늘 계획 ${executionChecks.length - checkedCount}개가 남았어요. 작게 끝내도 흐름은 이어집니다.`;
  }

  saveExecutionState({
    checked: [...executionChecks].map((item) => item.checked),
    progress,
    completedToday: allDone,
    updatedAt: new Date().toISOString(),
  });
}

function applyExecutionTheme(themeName) {
  const theme = themes[themeName] || themes.plant;
  executionThemeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === themeName);
  });

  if (executionCompanion) {
    executionCompanion.src = theme.image;
    executionCompanion.alt = theme.alt;
  }
  if (executionCompanionTitle) executionCompanionTitle.textContent = theme.title;
  if (executionCompanionPath) executionCompanionPath.textContent = theme.path;
  if (executionCompanionText) {
    executionCompanionText.textContent = `${theme.text} 오늘 계획을 모두 완료하면 내일 모습이 조금 더 달라집니다.`;
  }

  try {
    localStorage.setItem("omwExecutionTheme", themeName);
  } catch (error) {
    console.warn("Unable to save execution theme", error);
  }
}

function initializeExecutionPage() {
  if (!executionGoal) return;

  const plan = readExecutionPlan();
  const state = getExecutionState();
  const period = plan.period || 90;
  const day = Math.max(1, Math.min(period, Math.round(period * 0.2)));

  executionGoal.textContent = plan.goal || "3개월 안에 토익 900점 달성하기";
  if (executionStyle) executionStyle.textContent = plan.style || "루틴 점검형";
  if (executionPeriod) executionPeriod.textContent = `${period}일 계획`;
  if (executionDay) executionDay.textContent = `Day ${day} / ${period}`;
  if (executionFirstTask) executionFirstTask.textContent = plan.firstAction || "단어 40개 암기";

  if (Array.isArray(state.checked)) {
    executionChecks.forEach((item, index) => {
      item.checked = Boolean(state.checked[index]);
    });
  }

  let savedTheme = "plant";
  try {
    savedTheme = localStorage.getItem("omwExecutionTheme") || "plant";
  } catch (error) {
    savedTheme = "plant";
  }
  applyExecutionTheme(savedTheme);
  updateExecutionProgress();
}

executionChecks.forEach((item) => {
  item.addEventListener("change", updateExecutionProgress);
});

completeTodayButton?.addEventListener("click", () => {
  executionChecks.forEach((item) => {
    item.checked = true;
  });
  updateExecutionProgress();
});

executionThemeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyExecutionTheme(button.dataset.theme);
  });
});

downloadPlanButton?.addEventListener("click", () => {
  window.print();
});

initializeExecutionPage();
