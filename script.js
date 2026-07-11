const goalForm = document.querySelector(".goal-form");
const goalInput = document.querySelector("#goalInput");
const designGoal = document.querySelector("#designGoal");
const menuButton = document.querySelector(".menu-button");
const mainNav = document.querySelector(".main-nav");
const navLinks = document.querySelectorAll(".main-nav a");
const sectionNavLinks = document.querySelectorAll(".main-nav a[href^='#'], .bottom-tabbar a");
const personalityForm = document.querySelector("#personalityForm");
const diagnosisSteps = document.querySelectorAll(".diagnosis-step");
const diagnosisStepperItems = document.querySelectorAll(".diagnosis-stepper span");
const diagnosisBackButton = document.querySelector("#diagnosisBackButton");
const diagnosisNextButton = document.querySelector("#diagnosisNextButton");
const diagnosisStepTitle = document.querySelector("#diagnosisStepTitle");
const diagnosisStepCount = document.querySelector("#diagnosisStepCount");
const diagnosisProgressBar = document.querySelector("#diagnosisProgressBar");
const wizardStepLabel = document.querySelector("#wizardStepLabel");
const wizardProgressValue = document.querySelector("#wizardProgressValue");
const wizardLiveGoal = document.querySelector("#wizardLiveGoal");
const wizardLiveTiming = document.querySelector("#wizardLiveTiming");
const reviewGoal = document.querySelector("#reviewGoal");
const reviewPeriod = document.querySelector("#reviewPeriod");
const reviewTime = document.querySelector("#reviewTime");
const reviewReadiness = document.querySelector("#reviewReadiness");
const reviewCurrentState = document.querySelector("#reviewCurrentState");
const reviewCurrentRoutine = document.querySelector("#reviewCurrentRoutine");
const reviewPersonality = document.querySelector("#reviewPersonality");
const planPreviewPanel = document.querySelector("#planPreviewPanel");
const goalSuggestionButtons = document.querySelectorAll("[data-goal-suggestion], [data-goal-category]");
const customGoalButton = document.querySelector("#customGoalButton");
const birthDateInput = document.querySelector("#birthDate");
const birthTimeInput = document.querySelector("#birthTime");
const birthPlaceInput = document.querySelector("#birthPlace");
const mbtiInput = document.querySelector("#mbti");
const goalPeriodInput = document.querySelector("#goalPeriod");
const currentStateInput = document.querySelector("#currentState");
const routineReadinessInput = document.querySelector("#routineReadiness");
const routineTimeInput = document.querySelector("#routineTime");
const currentRoutineInput = document.querySelector("#currentRoutine");
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
const appFeatureCarousel = document.querySelector("#appFeatureCarousel");
const appFeatureSlides = document.querySelectorAll(".app-feature-slide");
const appFeatureDots = document.querySelectorAll("[data-feature-index]");
const appFeaturePrev = document.querySelector("#appFeaturePrev");
const appFeatureNext = document.querySelector("#appFeatureNext");
const appFeatureTitle = document.querySelector("#appFeatureTitle");
const appFeatureCounter = document.querySelector("#appFeatureCounter");
const appTourSection = document.querySelector("#appTour");
const designFlowSection = document.querySelector("#designFlow");
const trialPhoneInput = document.querySelector("#trialPhone");
const trialServiceConsent = document.querySelector("#trialServiceConsent");
const trialMarketingConsent = document.querySelector("#trialMarketingConsent");
const trialStartLink = document.querySelector("#trialStartLink");
const trialStatusBanner = document.querySelector("#trialStatusBanner");
const trialTimeRemaining = document.querySelector("#trialTimeRemaining");
const trialPaywall = document.querySelector("#trialPaywall");
const trialPaywallKicker = document.querySelector("#trialPaywallKicker");
const trialPaywallTitle = document.querySelector("#trialPaywallTitle");
const trialPaywallCopy = document.querySelector("#trialPaywallCopy");
const trialPaywallAction = document.querySelector("#trialPaywallAction");
const ollieEnergyMeter = document.querySelector("#ollieEnergyMeter");
const ollieEnergyBalance = document.querySelector("#ollieEnergyBalance");
const ollieEnergyBar = document.querySelector("#ollieEnergyBar");
const ollieEnergyWarning = document.querySelector("#ollieEnergyWarning");
const weeklyOptimizeButton = document.querySelector("#weeklyOptimizeButton");
const executionGoal = document.querySelector("#executionGoal");
const executionStyle = document.querySelector("#executionStyle");
const executionPeriod = document.querySelector("#executionPeriod");
const todayDateLabel = document.querySelector("#todayDateLabel");
const executionDay = document.querySelector("#executionDay");
const executionStreak = document.querySelector("#executionStreak");
const executionProgress = document.querySelector("#executionProgress");
const executionProgressBar = document.querySelector("#executionProgressBar");
const executionMessage = document.querySelector("#executionMessage");
const planStatusBadge = document.querySelector("#planStatusBadge");
const planEditor = document.querySelector("#planEditor");
const planPreviewList = document.querySelector("#planPreviewList");
const planRevisionRequest = document.querySelector("#planRevisionRequest");
const acceptPlanButton = document.querySelector("#acceptPlanButton");
const regeneratePlanButton = document.querySelector("#regeneratePlanButton");
const reviseAgainButton = document.querySelector("#reviseAgainButton");
const keepPlanButton = document.querySelector("#keepPlanButton");
const planEditorMessage = document.querySelector("#planEditorMessage");
const revisionChipButtons = document.querySelectorAll("[data-revision-chip]");
const selectedScheduleTitle = document.querySelector("#selectedScheduleTitle");
const selectedScheduleMeta = document.querySelector("#selectedScheduleMeta");
const executionChecklist = document.querySelector("#executionChecklist");
const difficultyCard = document.querySelector("#difficultyCard");
const difficultyButtons = document.querySelectorAll("[data-difficulty]");
const recoveryCard = document.querySelector("#recoveryCard");
const recoverySummary = document.querySelector("#recoverySummary");
const recoveryButtons = document.querySelectorAll("[data-recovery-action]");
const scheduleCalendar = document.querySelector("#scheduleCalendar");
const calendarSummary = document.querySelector("#calendarSummary");
const monthlyCompletion = document.querySelector("#monthlyCompletion");
const weeklyPlanList = document.querySelector("#weeklyPlanList");
const routineModeTitle = document.querySelector("#routineModeTitle");
const routineModeMeta = document.querySelector("#routineModeMeta");
const routineCueList = document.querySelector("#routineCueList");
const completeTodayButton = document.querySelector("#completeTodayButton");
const executionThemeButtons = document.querySelectorAll(".execution-theme-button");
const executionCompanion = document.querySelector("#executionCompanion");
const executionCompanionTitle = document.querySelector("#executionCompanionTitle");
const executionCompanionPath = document.querySelector("#executionCompanionPath");
const executionCompanionText = document.querySelector("#executionCompanionText");
const companionHomeImage = document.querySelector("#companionHomeImage");
const companionMoodLine = document.querySelector("#companionMoodLine");
const companionMessage = document.querySelector("#companionMessage");
const companionName = document.querySelector("#companionName");
const DEFAULT_ROUTINE_READINESS = "계획이 있으면 실행해요";
const TRIAL_ACCESS_KEY = "omwTrialAccess";
const TRIAL_LEAD_KEY = "omwTrialLead";
const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;
const OLLIE_ENERGY_KEY = "omwOllieEnergy";
const FREE_PLAN_GENERATED_KEY = "omwFreePlanGenerated";

if (appTourSection && designFlowSection && appTourSection.nextElementSibling !== designFlowSection) {
  designFlowSection.parentNode?.insertBefore(appTourSection, designFlowSection);
}

function readTrialAccess() {
  try {
    return JSON.parse(localStorage.getItem(TRIAL_ACCESS_KEY) || "null");
  } catch (error) {
    return null;
  }
}

function saveTrialLead() {
  if (!trialPhoneInput?.value.trim() || !trialServiceConsent?.checked) return;
  const phoneDigits = trialPhoneInput.value.replace(/\D/g, "");
  try {
    localStorage.setItem(
      TRIAL_LEAD_KEY,
      JSON.stringify({
        phoneLast4: phoneDigits.slice(-4),
        serviceConsent: true,
        marketingConsent: Boolean(trialMarketingConsent?.checked),
        consentedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.warn("Unable to save trial contact preferences", error);
  }
}

function startTrialAccess() {
  const startedAt = Date.now();
  saveTrialLead();
  try {
    localStorage.setItem(
      TRIAL_ACCESS_KEY,
      JSON.stringify({ startedAt, expiresAt: startedAt + TRIAL_DURATION_MS, plan: "trial" }),
    );
  } catch (error) {
    console.warn("Unable to save trial access", error);
  }
}

function lockTrialExperience(mode) {
  if (!trialPaywall) return;
  trialPaywall.hidden = false;
  document.body.classList.add("trial-locked");
  const executionApp = document.querySelector(".execution-app");
  const executionTabs = document.querySelector(".execution-tabbar");
  if (executionApp) executionApp.inert = true;
  if (executionTabs) executionTabs.inert = true;

  if (mode === "expired") {
    if (trialPaywallKicker) trialPaywallKicker.textContent = "체험이 종료되었어요";
    if (trialPaywallTitle) trialPaywallTitle.textContent = "만든 계획을 그대로 이어갈까요?";
    if (trialPaywallCopy) trialPaywallCopy.textContent = "24시간 무료 체험이 끝나 앱 이용이 잠시 멈췄어요. PRO를 시작하면 계획과 기록이 그대로 이어져요.";
    if (trialPaywallAction) {
      trialPaywallAction.textContent = "PRO 월 2,900원으로 계속하기";
      trialPaywallAction.href = "index.html#pricing";
    }
  }
}

function updateTrialStatus(expiresAt) {
  if (!trialStatusBanner || !trialTimeRemaining) return;
  const remaining = Math.max(0, expiresAt - Date.now());
  if (remaining <= 0) {
    trialStatusBanner.hidden = true;
    lockTrialExperience("expired");
    return;
  }
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  trialStatusBanner.hidden = false;
  trialTimeRemaining.textContent = `${hours}시간 ${minutes}분 남음`;
}

function initializeTrialAccess() {
  if (!document.body.classList.contains("execution-page")) return;
  const access = readTrialAccess();
  if (!access?.expiresAt) {
    lockTrialExperience("not-started");
    return;
  }
  if (Date.now() >= Number(access.expiresAt)) {
    lockTrialExperience("expired");
    return;
  }
  updateTrialStatus(Number(access.expiresAt));
  window.setInterval(() => updateTrialStatus(Number(access.expiresAt)), 60 * 1000);
}

trialStartLink?.addEventListener("click", startTrialAccess);

trialPhoneInput?.addEventListener("input", () => {
  const digits = trialPhoneInput.value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) {
    trialPhoneInput.value = digits;
  } else if (digits.length <= 7) {
    trialPhoneInput.value = `${digits.slice(0, 3)}-${digits.slice(3)}`;
  } else {
    trialPhoneInput.value = `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`;
  }
});

initializeTrialAccess();

function getMonthlyEnergyReset() {
  const reset = new Date();
  reset.setMonth(reset.getMonth() + 1, 1);
  reset.setHours(0, 0, 0, 0);
  return reset.getTime();
}

function getOllieEnergyPlan() {
  const access = readTrialAccess();
  return access?.plan === "pro" ? { plan: "pro", allocation: 300 } : { plan: "trial", allocation: 10 };
}

function readOllieEnergyState() {
  const energyPlan = getOllieEnergyPlan();
  let state = null;
  try {
    state = JSON.parse(localStorage.getItem(OLLIE_ENERGY_KEY) || "null");
  } catch (error) {
    state = null;
  }

  const shouldReset =
    !state ||
    state.plan !== energyPlan.plan ||
    !Number.isFinite(Number(state.remaining)) ||
    (energyPlan.plan === "pro" && Date.now() >= Number(state.resetAt || 0));

  if (shouldReset) {
    state = {
      plan: energyPlan.plan,
      allocation: energyPlan.allocation,
      remaining: energyPlan.allocation,
      resetAt: energyPlan.plan === "pro" ? getMonthlyEnergyReset() : Number(readTrialAccess()?.expiresAt || Date.now() + TRIAL_DURATION_MS),
    };
    saveOllieEnergyState(state);
  }

  return state;
}

function saveOllieEnergyState(state) {
  try {
    localStorage.setItem(OLLIE_ENERGY_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Unable to save Ollie Energy", error);
  }
}

function renderOllieEnergy() {
  if (!ollieEnergyMeter) return;
  const state = readOllieEnergyState();
  const allocation = Math.max(1, Number(state.allocation) || 1);
  const remaining = Math.max(0, Number(state.remaining) || 0);
  const percent = Math.max(0, Math.min(100, (remaining / allocation) * 100));
  const isLow = percent <= 20;

  if (ollieEnergyBalance) ollieEnergyBalance.textContent = `${remaining} / ${allocation}`;
  if (ollieEnergyBar) ollieEnergyBar.style.width = `${percent}%`;
  ollieEnergyMeter.classList.toggle("is-low", isLow);
  if (ollieEnergyWarning) ollieEnergyWarning.hidden = !isLow;
}

function consumeOllieEnergy(amount, label) {
  const state = readOllieEnergyState();
  const cost = Math.max(0, Number(amount) || 0);
  if (Number(state.remaining) < cost) {
    if (ollieEnergyWarning) ollieEnergyWarning.hidden = false;
    showToast(`${label}에 필요한 올리 에너지가 부족해요`);
    announce(`${label}에 필요한 올리 에너지가 부족합니다.`);
    return false;
  }

  state.remaining = Number(state.remaining) - cost;
  saveOllieEnergyState(state);
  renderOllieEnergy();
  announce(`${label}에 올리 에너지 ${cost}를 사용했습니다. ${state.remaining} 남았습니다.`);
  return true;
}

renderOllieEnergy();

function needsLowFrictionStart(readiness = DEFAULT_ROUTINE_READINESS) {
  return ["준비", "미뤄", "중단"].some((keyword) => readiness.includes(keyword));
}
const companionStage = document.querySelector("#companionStage");
const companionLevel = document.querySelector("#companionLevel");
const companionXpBar = document.querySelector("#companionXpBar");
const openCompanionChatButton = document.querySelector("#openCompanionChat");
const openCompanionChatTriggers = document.querySelectorAll("[data-open-companion-chat]");
const touchCompanionButton = document.querySelector("#touchCompanion");
const companionActionButtons = document.querySelectorAll("[data-companion-action]");
const focusTaskTitle = document.querySelector("#focusTaskTitle");
const focusTaskMeta = document.querySelector("#focusTaskMeta");
const minimumGoalText = document.querySelector("#minimumGoalText");
const focusProgressText = document.querySelector("#focusProgressText");
const startFocusButton = document.querySelector("#startFocusButton");
const companionMood = document.querySelector("#companionMood");
const companionDays = document.querySelector("#companionDays");
const companionNextGrowth = document.querySelector("#companionNextGrowth");
const journeyBadge = document.querySelector("#journeyBadge");
const journeyMap = document.querySelector("#journeyMap");
const journeyPlaceTitle = document.querySelector("#journeyPlaceTitle");
const journeyPlaceStory = document.querySelector("#journeyPlaceStory");
const journeyNextText = document.querySelector("#journeyNextText");
const journeyNextBar = document.querySelector("#journeyNextBar");
const memoryList = document.querySelector("#memoryList");
const patternList = document.querySelector("#patternList");
const chatOverlay = document.querySelector("#chatOverlay");
const companionChatSheet = document.querySelector("#companionChatSheet");
const closeCompanionChatButton = document.querySelector("#closeCompanionChat");
const energyButtons = document.querySelectorAll("[data-energy]");
const chatActionButtons = document.querySelectorAll("[data-chat-action]");
const companionChatInput = document.querySelector("#companionChatInput");
const sendCompanionMessage = document.querySelector("#sendCompanionMessage");
const companionChatResponse = document.querySelector("#companionChatResponse");
const focusModeOverlay = document.querySelector("#focusModeOverlay");
const focusMode = document.querySelector("#focusMode");
const closeFocusModeButton = document.querySelector("#closeFocusMode");
const focusTimer = document.querySelector("#focusTimer");
const focusModeTitle = document.querySelector("#focusModeTitle");
const focusCriteria = document.querySelector("#focusCriteria");
const minimizeFocusButton = document.querySelector("#minimizeFocusButton");
const finishFocusButton = document.querySelector("#finishFocusButton");
const appLiveRegion = document.querySelector("#appLiveRegion");

goalForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = goalInput.value.trim();
  if (designGoal) designGoal.value = value || designGoal.value;
  diagnosisStepIndex = 0;
  renderDiagnosisStep();
  document.querySelector("#designFlow")?.scrollIntoView({ behavior: "smooth" });
  window.setTimeout(() => designGoal?.focus({ preventScroll: true }), 450);
});

goalInput?.addEventListener("input", () => {
  if (designGoal) designGoal.value = goalInput.value.trim();
});

let diagnosisStepIndex = 0;

const wizardStepLabels = ["목표 설정 중", "실행 리듬 설정 중", "성향 설정 중", "최종 확인"];

const goalTemplates = {
  exam: {
    goal: "3개월 안에 토익 900점 달성하기",
    period: "90",
    time: "아침",
    readiness: "계획이 있으면 실행해요",
    state: "토익 720점, 평일 하루 1시간 가능",
    routine: "아침 물 마신 뒤 단어 앱 열기",
  },
  fitness: {
    goal: "12주 동안 주 4회 30분 운동 습관 만들기",
    period: "90",
    time: "저녁",
    readiness: "시작 전 준비가 필요해요",
    state: "최근 운동을 쉬었고 평일 30분 가능",
    routine: "퇴근 후 편한 옷으로 갈아입기",
  },
  english: {
    goal: "90일 동안 매일 20분 영어 회화 연습하기",
    period: "90",
    time: "아침",
    readiness: "계획이 있으면 실행해요",
    state: "간단한 문장은 가능하고 출근 전 20분 가능",
    routine: "아침 커피를 마시며 영어 영상 1개 보기",
  },
  reading: {
    goal: "30일 동안 매일 자기 전 20분 독서하기",
    period: "30",
    time: "자기 전",
    readiness: "자주 미뤄요",
    state: "한 달에 책 1권 미만, 자기 전 20분 가능",
    routine: "침대에 눕기 전 휴대전화 충전하기",
  },
  startup: {
    goal: "90일 안에 첫 유료 고객 10명 만들기",
    period: "90",
    time: "저녁",
    readiness: "바로 실행하는 편이에요",
    state: "아이디어만 있고 평일 1시간, 주말 3시간 가능",
    routine: "저녁 식사 후 노트북 열기",
  },
  habit: {
    goal: "30일 동안 매일 아침 10분 정리 루틴 만들기",
    period: "30",
    time: "아침",
    readiness: "시작해도 쉽게 중단돼요",
    state: "작심삼일이 잦고 출근 전 15분 가능",
    routine: "일어나서 물 한 잔 마시기",
  },
};

function updateWizardSummary() {
  const goal = designGoal?.value.trim() || "목표를 입력해 주세요";
  const selectedPeriod = goalPeriodInput?.selectedOptions?.[0]?.textContent.split(" · ")[0] || "기간 미정";
  const time = routineTimeInput?.value || "시간 미정";
  const readiness = routineReadinessInput?.value || "실행 스타일 미정";

  if (wizardLiveGoal) wizardLiveGoal.textContent = goal;
  if (wizardLiveTiming) wizardLiveTiming.textContent = `${selectedPeriod} · ${time}`;
  if (reviewGoal) reviewGoal.textContent = goal;
  if (reviewPeriod) reviewPeriod.textContent = selectedPeriod;
  if (reviewTime) reviewTime.textContent = time;
  if (reviewReadiness) reviewReadiness.textContent = readiness;
  if (reviewCurrentState) reviewCurrentState.textContent = currentStateInput?.value.trim() || "입력 전";
  if (reviewCurrentRoutine) reviewCurrentRoutine.textContent = currentRoutineInput?.value.trim() || "입력 전";
  if (reviewPersonality) reviewPersonality.textContent = `${mbtiInput?.value || "MBTI 미정"} · 생년월일 기반 실행 리듬`;
}

function canLeaveDiagnosisStep() {
  const fieldsByStep = [
    [designGoal],
    [goalPeriodInput, routineTimeInput, routineReadinessInput, currentStateInput, currentRoutineInput],
    [birthDateInput, birthTimeInput, birthPlaceInput, mbtiInput],
  ];
  const invalidField = (fieldsByStep[diagnosisStepIndex] || []).find((field) => field && !field.checkValidity());

  if (!invalidField) return true;
  invalidField.focus();
  invalidField.reportValidity();
  return false;
}

function renderDiagnosisStep() {
  if (!diagnosisSteps.length) return;

  diagnosisSteps.forEach((step, index) => {
    const isActive = index === diagnosisStepIndex;
    step.classList.toggle("active", isActive);
    step.hidden = !isActive;
  });

  diagnosisStepperItems.forEach((item, index) => {
    item.classList.toggle("active", index === diagnosisStepIndex);
    item.classList.toggle("done", index < diagnosisStepIndex);
    if (index === diagnosisStepIndex) {
      item.setAttribute("aria-current", "step");
    } else {
      item.removeAttribute("aria-current");
    }
  });

  const progress = Math.round(((diagnosisStepIndex + 1) / diagnosisSteps.length) * 100);
  const activeStep = diagnosisSteps[diagnosisStepIndex];
  if (diagnosisStepTitle) diagnosisStepTitle.textContent = activeStep?.dataset.stepTitle || "목표를 설정해 주세요";
  if (diagnosisStepCount) diagnosisStepCount.textContent = `${diagnosisStepIndex + 1} / ${diagnosisSteps.length}`;
  if (diagnosisProgressBar) diagnosisProgressBar.style.width = `${progress}%`;
  if (wizardStepLabel) wizardStepLabel.textContent = wizardStepLabels[diagnosisStepIndex] || "설정 중";
  if (wizardProgressValue) wizardProgressValue.textContent = `${progress}%`;

  if (diagnosisBackButton) diagnosisBackButton.hidden = diagnosisStepIndex === 0;
  if (diagnosisNextButton) diagnosisNextButton.hidden = diagnosisStepIndex === diagnosisSteps.length - 1;
  if (diagnosisNextButton) diagnosisNextButton.textContent = diagnosisStepIndex === diagnosisSteps.length - 2 ? "설정 확인" : "다음 단계";
  if (aiPreviewButton) aiPreviewButton.hidden = diagnosisStepIndex !== diagnosisSteps.length - 1;
  updateWizardSummary();
}

diagnosisBackButton?.addEventListener("click", () => {
  diagnosisStepIndex = Math.max(0, diagnosisStepIndex - 1);
  renderDiagnosisStep();
});

diagnosisNextButton?.addEventListener("click", () => {
  if (!canLeaveDiagnosisStep()) return;
  diagnosisStepIndex = Math.min(diagnosisSteps.length - 1, diagnosisStepIndex + 1);
  renderDiagnosisStep();
});

goalSuggestionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!designGoal) return;
    const category = button.dataset.goalCategory;
    const template = goalTemplates[category];

    if (template) {
      designGoal.value = template.goal;
      if (goalPeriodInput) goalPeriodInput.value = template.period;
      if (routineTimeInput) routineTimeInput.value = template.time;
      if (routineReadinessInput) routineReadinessInput.value = template.readiness;
      if (currentStateInput) currentStateInput.value = template.state;
      if (currentRoutineInput) currentRoutineInput.value = template.routine;
    } else {
      designGoal.value = button.dataset.goalSuggestion || "";
    }

    goalSuggestionButtons.forEach((item) => item.classList.toggle("selected", Boolean(category) && item.dataset.goalCategory === category));
    customGoalButton?.classList.remove("selected");
    updateWizardSummary();

    if (button.hasAttribute("data-scroll-to-builder")) {
      diagnosisStepIndex = 0;
      renderDiagnosisStep();
      document.querySelector("#designFlow")?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => {
        designGoal.focus({ preventScroll: true });
        designGoal.select();
      }, 500);
    }
  });
});

customGoalButton?.addEventListener("click", () => {
  if (!designGoal) return;
  designGoal.value = "";
  goalSuggestionButtons.forEach((item) => item.classList.remove("selected"));
  customGoalButton.classList.add("selected");
  updateWizardSummary();
  designGoal.focus({ preventScroll: true });
  designGoal.scrollIntoView({ behavior: "smooth", block: "center" });
});

renderDiagnosisStep();

let appFeatureIndex = 0;
let appFeatureScrollFrame = 0;

function updateAppFeatureUi(index) {
  if (!appFeatureSlides.length) return;
  appFeatureIndex = Math.max(0, Math.min(index, appFeatureSlides.length - 1));
  const activeSlide = appFeatureSlides[appFeatureIndex];
  if (appFeatureTitle) appFeatureTitle.textContent = activeSlide?.dataset.featureTitle || "올리와 함께하는 앱";
  if (appFeatureCounter) appFeatureCounter.textContent = `${appFeatureIndex + 1} / ${appFeatureSlides.length}`;
  appFeatureDots.forEach((dot, dotIndex) => {
    const isActive = dotIndex === appFeatureIndex;
    dot.classList.toggle("active", isActive);
    dot.setAttribute("aria-selected", String(isActive));
  });
}

function showAppFeature(index, { animate = true } = {}) {
  if (!appFeatureCarousel || !appFeatureSlides.length) return;
  const nextIndex = (index + appFeatureSlides.length) % appFeatureSlides.length;
  updateAppFeatureUi(nextIndex);
  appFeatureCarousel.scrollTo({ left: appFeatureCarousel.clientWidth * nextIndex, behavior: animate ? "smooth" : "auto" });
}

appFeaturePrev?.addEventListener("click", () => showAppFeature(appFeatureIndex - 1));
appFeatureNext?.addEventListener("click", () => showAppFeature(appFeatureIndex + 1));

appFeatureDots.forEach((dot) => {
  dot.addEventListener("click", () => showAppFeature(Number(dot.dataset.featureIndex || 0)));
});

appFeatureCarousel?.addEventListener("scroll", () => {
  window.cancelAnimationFrame(appFeatureScrollFrame);
  appFeatureScrollFrame = window.requestAnimationFrame(() => {
    if (!appFeatureCarousel.clientWidth) return;
    updateAppFeatureUi(Math.round(appFeatureCarousel.scrollLeft / appFeatureCarousel.clientWidth));
  });
});

appFeatureCarousel?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    showAppFeature(appFeatureIndex - 1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    showAppFeature(appFeatureIndex + 1);
  }
});

updateAppFeatureUi(0);

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

setActiveSectionLink(window.location.hash || "#top");

const sectionAnchors = ["#top", "#appTour", "#designFlow", "#pricing"]
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

function buildAiPlanPayload({
  goal,
  period,
  currentState,
  routineReadiness,
  routineTime,
  currentRoutine,
  birthDate,
  birthTime,
  birthPlace,
  mbti,
  manse,
  style,
}) {
  return {
    endpoint: "POST /api/ai/goal-plan",
    modelRole: "goal_planning_coach",
    input: {
      goal,
      periodDays: Number(period),
      currentState,
      routine: {
        readiness: routineReadiness,
        preferredTime: routineTime,
        existingRoutine: currentRoutine,
      },
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
      "만세력 기반 성향, MBTI 성향, 기존 루틴과 실행 성향을 함께 비교해 사용자가 목표를 달성하기 쉬운 계획 스타일을 정하고, 전체 기간 계획, 오늘의 스케줄, 체크인 방식, 성장 보상 메시지를 생성한다.",
    outputSchema: {
      personalitySummary: "string",
      planningStyle: "string",
      fullSchedule: "array",
      todaySchedule: "array",
      checkInRules: "array",
      companionGrowthPlan: "array",
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
  const { goal, periodDays, currentState, mbti, manseoryeok, recommendedPlanningStyle, routine = {} } = payload.input;
  const template = getGoalPlanTemplates(goal);
  const period = Number(periodDays) || 90;
  const progress = Math.max(12, Math.min(48, Math.round(1800 / period)));
  const routineTime = routine.preferredTime || "아침";
  const existingRoutine = routine.existingRoutine || "이미 하는 작은 행동";
  const readiness = routine.readiness || DEFAULT_ROUTINE_READINESS;
  const lowFriction = needsLowFrictionStart(readiness);
  const routineAdvice = lowFriction
    ? `${routineTime}에 ${existingRoutine} 직후 10분만 시작하고, 알림으로 다시 불러옵니다.`
    : `${routineTime}에 ${existingRoutine}와 새 목표를 붙여 바로 실행 흐름을 만듭니다.`;
  const personalitySummary = `${manseoryeok.dayMaster.trait} 성향과 ${mbti}의 유지 방식을 함께 보면, 처음부터 큰 계획을 밀어붙이기보다 오늘 실행할 단위를 선명하게 두는 편이 좋습니다.`;

  return {
    personalitySummary,
    planningStyle: `${recommendedPlanningStyle} 계획`,
    firstAction: lowFriction ? `${routineTime} 10분 루틴: ${template.firstAction}` : `${routineTime} 루틴: ${template.firstAction}`,
    weekTitle: template.weekTitle,
    weekPlan: [routineAdvice, ...template.weekPlan.slice(0, 2)],
    coachMessage: `${currentState || "현재 상태"}를 기준으로 보면, 이번 주는 완성보다 흐름을 만드는 것이 우선입니다. ${routineAdvice}`,
    dashboard: {
      goal: goal.replace("하기", ""),
      progress,
      pace: template.pace,
    },
  };
}

async function requestAiPlan(payload) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch("/api/ai/goal-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload.input),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "AI 계획을 만드는 중 문제가 생겼어요.");
    }

    return result.plan || result;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("AI 응답 시간이 길어졌어요. 잠시 후 다시 시도해 주세요.");
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function playAnalysisLoading() {
  if (!aiPreviewStatus) return;

  const steps = [
    "목표를 실행 가능한 크기로 나누고 있어요",
    "현재 루틴과 연결할 시간을 찾고 있어요",
    "미루기 쉬운 구간에 대비책을 넣고 있어요",
    "첫 주 계획을 만들고 있어요",
  ];

  for (const step of steps) {
    aiPreviewStatus.textContent = step;
    await new Promise((resolve) => setTimeout(resolve, 320));
  }
}

function renderAiPreview(preview) {
  if (planningStyle) planningStyle.textContent = preview.planningStyle.replace(" 계획", "");
  if (manseProfile) manseProfile.textContent = preview.personalitySummary;
  if (mbtiProfile) mbtiProfile.textContent = `${preview.planningStyle}으로 시작하고, 첫 행동은 "${preview.firstAction}"으로 잡습니다.`;
  if (aiPreviewTitle) aiPreviewTitle.textContent = preview.weekTitle;
  if (aiPreviewList) {
    const items = (preview.weekPlan || []).map((item) => {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      return listItem;
    });
    aiPreviewList.replaceChildren(...items);
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

  if (showLoading && readTrialAccess()?.plan !== "pro") {
    try {
      if (localStorage.getItem(FREE_PLAN_GENERATED_KEY) === "true") {
        if (aiPreviewStatus) aiPreviewStatus.textContent = "무료 목표 계획 1개를 이미 만들었어요";
        planPreviewPanel?.classList.add("is-ready");
        showToast("무료 플랜은 목표 계획 1개를 만들 수 있어요. 앱에서 올리 에너지로 수정해 보세요.");
        return;
      }
    } catch (error) {
      /* storage unavailable — continue */
    }
  }

  const goal = designGoal.value.trim() || goalInput?.value.trim() || "목표 미입력";
  const period = goalPeriodInput.value;
  const currentState = currentStateInput.value.trim();
  const routineReadiness = routineReadinessInput?.value || DEFAULT_ROUTINE_READINESS;
  const routineTime = routineTimeInput?.value || "아침";
  const currentRoutine = currentRoutineInput?.value.trim() || "이미 하는 작은 행동";
  const birthDate = birthDateInput.value;
  const birthTime = birthTimeInput.value;
  const birthPlace = birthPlaceInput.value.trim();
  const mbti = mbtiInput.value || "ISFJ";
  const safeBirthDate = birthDate || "1995-01-01";
  const safeBirthTime = birthTime || "12:00";

  const manse = calculateSimpleManse(safeBirthDate, safeBirthTime);
  const mbtiSummary = analyzeMbti(mbti);
  const style = decidePlanningStyle(manse, mbti);
  const payload = buildAiPlanPayload({
    goal,
    period,
    currentState,
    routineReadiness,
    routineTime,
    currentRoutine,
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
    await playAnalysisLoading();
  }

  let preview;
  try {
    preview = showLoading ? await requestAiPlan(payload) : buildLocalAiPreview(payload);
  } catch (error) {
    console.error("Unable to generate AI goal plan", error);
    if (aiPreviewStatus) aiPreviewStatus.textContent = error.message || "AI 연결을 확인해 주세요";
    if (aiPreviewButton) {
      aiPreviewButton.disabled = false;
      aiPreviewButton.textContent = "다시 AI 맞춤 계획 만들기";
    }
    showToast(error.message || "AI 계획을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    return;
  }
  renderAiPreview(preview);
  if (showLoading) planPreviewPanel?.classList.add("is-ready");

  if (aiPreviewStatus) aiPreviewStatus.textContent = "올리가 만든 오늘의 계획";
  if (aiPreviewButton) {
    aiPreviewButton.disabled = false;
    aiPreviewButton.textContent = "AI 맞춤 계획 만들고 1일 체험 준비";
  }

  try {
    localStorage.setItem(
      "omwExecutionPlan",
      JSON.stringify({
        goal,
        period: Number(period),
        currentState,
        routineReadiness,
        routineTime,
        currentRoutine,
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

  if (showLoading) saveTrialLead();
  if (showLoading && readTrialAccess()?.plan !== "pro") {
    try {
      localStorage.setItem(FREE_PLAN_GENERATED_KEY, "true");
    } catch (error) {
      /* storage unavailable — ignore */
    }
  }
}

personalityForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (diagnosisSteps.length && diagnosisStepIndex < diagnosisSteps.length - 1) {
    if (!canLeaveDiagnosisStep()) return;
    diagnosisStepIndex += 1;
    renderDiagnosisStep();
    return;
  }
  runPersonalityAnalysis({ showLoading: true });
});

[birthDateInput, birthTimeInput, birthPlaceInput, mbtiInput, goalPeriodInput, currentStateInput, routineReadinessInput, routineTimeInput, currentRoutineInput, designGoal].forEach(
  (field) => {
    field?.addEventListener("change", runPersonalityAnalysis);
    field?.addEventListener("input", updateWizardSummary);
  },
);

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

const appStateVersion = 2;

function safeJsonParse(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readStorageObject(key, fallback = {}) {
  try {
    return safeJsonParse(localStorage.getItem(key), fallback);
  } catch (error) {
    return fallback;
  }
}

function writeStorageObject(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Unable to save ${key}`, error);
  }
}

function readExecutionPlan() {
  const plan = readStorageObject("omwExecutionPlan", {});
  if (!plan || typeof plan !== "object") return {};
  return plan;
}

function migrateExecutionState(rawState) {
  const todayKey = getTodayKey();
  const state = rawState && typeof rawState === "object" ? { ...rawState } : {};
  const checkedByDay =
    state.checkedByDay && typeof state.checkedByDay === "object" && !Array.isArray(state.checkedByDay)
      ? state.checkedByDay
      : {};

  const migrated = {
    version: appStateVersion,
    scheduleKey: state.scheduleKey || "",
    planText: typeof state.planText === "string" ? state.planText : "",
    revisionRequest: typeof state.revisionRequest === "string" ? state.revisionRequest : "",
    pendingPlanText: typeof state.pendingPlanText === "string" ? state.pendingPlanText : "",
    pendingRevisionRequest: typeof state.pendingRevisionRequest === "string" ? state.pendingRevisionRequest : "",
    status: state.status || "AI 제안",
    selectedDay: Math.max(1, Number(state.selectedDay) || 1),
    checkedByDay,
    difficultyByTask:
      state.difficultyByTask && typeof state.difficultyByTask === "object" && !Array.isArray(state.difficultyByTask)
        ? state.difficultyByTask
        : {},
    recoveryActions: Array.isArray(state.recoveryActions) ? state.recoveryActions.slice(-30) : [],
    completedLog: Array.isArray(state.completedLog) ? state.completedLog.slice(-80) : [],
    lastCompletion: state.lastCompletion || null,
    lastSeenDate: state.lastSeenDate || todayKey,
    rolloverNotice: state.rolloverNotice || null,
    updatedAt: state.updatedAt || new Date().toISOString(),
  };

  if (migrated.lastSeenDate !== todayKey) {
    const previousDay = String(migrated.selectedDay);
    const previousChecked = checkedByDay[previousDay] || [];
    const missedCount = previousChecked.filter((checked) => !checked).length;
    migrated.rolloverNotice = missedCount > 0 ? { day: migrated.selectedDay, missedCount, date: migrated.lastSeenDate } : null;
    migrated.lastSeenDate = todayKey;
  }

  return migrated;
}

function readCompanionEvents() {
  try {
    const events = safeJsonParse(localStorage.getItem(companionEventKey), []);
    return Array.isArray(events) ? events : [];
  } catch (error) {
    return [];
  }
}

function getExecutionState() {
  return migrateExecutionState(readStorageObject("omwExecutionState", {}));
}

function saveExecutionState(state) {
  writeStorageObject("omwExecutionState", migrateExecutionState(state));
}

function hashText(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getDefaultPlanText(plan) {
  const preview = plan.aiPreview || {};
  const weekPlan = Array.isArray(preview.weekPlan) ? preview.weekPlan : [];
  const lines = [
    `${plan.routineTime || "아침"}에 ${plan.currentRoutine || "기존 루틴"}와 목표를 연결하기`,
    plan.firstAction || preview.firstAction || "단어 40개 + LC 1세트",
    ...weekPlan,
    "하루 끝에는 완료 여부를 체크하고, 놓친 항목은 다음 날 작은 단위로 다시 배치합니다.",
  ];
  return lines.map((line) => `- ${line}`).join("\n");
}

function parsePlanText(planText, fallbackAction) {
  const parsed = planText
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\d.\s]+/, "").trim())
    .filter(Boolean);

  const unique = [...new Set(parsed)];
  if (unique.length >= 3) return unique;
  return [
    fallbackAction || "단어 40개 + LC 1세트",
    "오답 정리 20분",
    "오늘 진행 상황 체크인",
  ];
}

function buildRevisedPlanText(baseText, revisionRequest) {
  const request = revisionRequest.trim().replace(/\s+/g, " ");
  if (!request) return baseText;

  return [
    `- 수정 요청 반영: ${request}`,
    "- AI 재작성 기준: 요청사항을 우선 적용하고 부담이 큰 일정은 더 작은 단위로 나눕니다.",
    baseText.trim(),
  ].join("\n");
}

function getScheduleHints(revisionRequest) {
  const request = revisionRequest || "";
  return {
    avoidMorning: request.includes("아침") && /제외|빼|어려|힘들|부족|싫/.test(request),
    lightWeekend: /주말|토요일|일요일/.test(request) && /가볍|복습|휴식|쉬|비우|줄여/.test(request),
    shorterTasks: /10분|15분|짧|가볍|부담|줄여|작게/.test(request),
  };
}

function getRoutineTimes(plan, revisionRequest = "") {
  const request = revisionRequest || "";
  const timeSet = {
    아침: ["07:00", "12:30", "21:00"],
    점심: ["10:30", "13:00", "21:00"],
    저녁: ["09:00", "18:30", "22:00"],
    "자기 전": ["08:00", "20:30", "23:00"],
  };

  if (request.includes("자기 전")) return timeSet["자기 전"];
  if (request.includes("저녁")) return timeSet["저녁"];
  if (request.includes("점심")) return timeSet["점심"];
  if (request.includes("아침") && !getScheduleHints(request).avoidMorning) return timeSet["아침"];
  if (getScheduleHints(request).avoidMorning) return timeSet["저녁"];

  return timeSet[plan.routineTime] || timeSet["아침"];
}

function buildSchedule(plan, planText, revisionRequest = "") {
  const period = Math.max(7, Math.min(Number(plan.period) || 30, 100));
  const baseTasks = parsePlanText(planText, plan.firstAction);
  const times = getRoutineTimes(plan, revisionRequest);
  const hints = getScheduleHints(revisionRequest);
  const weeklyFocus = ["루틴 고정", "기초 반복", "중간 점검", "약점 보완", "실전 적용", "가벼운 복습", "주간 리포트"];

  return Array.from({ length: period }, (_, index) => {
    const day = index + 1;
    const focus = weeklyFocus[index % weeklyFocus.length];
    const isWeekend = day % 7 === 6 || day % 7 === 0;
    const tasks =
      hints.lightWeekend && isWeekend
        ? [
            { time: times[0], text: "가벼운 복습과 기록 확인" },
            { time: times[2], text: "다음 실행일에 넘길 항목 1개만 정리" },
          ]
        : times.map((time, taskIndex) => ({
            time,
            text:
              taskIndex === 2 && day % 7 === 0
                ? "이번 주 완료율 확인하고 다음 주 난이도 조정"
                : `${hints.shorterTasks ? "작게: " : ""}${baseTasks[(index + taskIndex) % baseTasks.length]}`,
          }));

    return {
      day,
      title: `Day ${day} · ${focus}`,
      tasks,
    };
  });
}

function getScheduleCompletion(schedule, checkedByDay) {
  const totalTasks = schedule.reduce((sum, day) => sum + day.tasks.length, 0);
  const completedTasks = schedule.reduce((sum, day) => {
    const checked = checkedByDay[String(day.day)] || [];
    return sum + checked.filter(Boolean).length;
  }, 0);
  return totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
}

function getVisibleMonthSchedule(schedule) {
  return schedule.slice(0, Math.min(30, schedule.length));
}

function getDayCompletion(dayPlan, checkedByDay) {
  const checked = checkedByDay[String(dayPlan.day)] || [];
  const completed = checked.filter(Boolean).length;
  const total = dayPlan.tasks.length || 1;
  return {
    completed,
    total,
    percent: Math.round((completed / total) * 100),
  };
}

function getCompletedDayCount(schedule, checkedByDay) {
  return schedule.filter((dayPlan) => getDayCompletion(dayPlan, checkedByDay).percent === 100).length;
}

function getPlanBundle({ reset = false, customText, revisionRequest } = {}) {
  const plan = readExecutionPlan();
  const previous = getExecutionState();
  const planText = customText ?? previous.planText ?? getDefaultPlanText(plan);
  const requestText = revisionRequest ?? previous.revisionRequest ?? "";
  const schedule = buildSchedule(plan, planText, requestText);
  const scheduleKey = hashText(`${plan.goal || ""}|${plan.period || ""}|${planText}|${requestText}`);
  const canReuse = !reset && previous.scheduleKey === scheduleKey;
  const state = canReuse
    ? previous
    : {
        version: appStateVersion,
        scheduleKey,
        planText,
        revisionRequest: requestText,
        pendingPlanText: previous.pendingPlanText || "",
        pendingRevisionRequest: previous.pendingRevisionRequest || "",
        status: previous.status || "AI 제안",
        selectedDay: previous.selectedDay || 1,
        checkedByDay: previous.checkedByDay || {},
        difficultyByTask: previous.difficultyByTask || {},
        recoveryActions: previous.recoveryActions || [],
        completedLog: previous.completedLog || [],
        lastCompletion: previous.lastCompletion || null,
        lastSeenDate: previous.lastSeenDate || getTodayKey(),
        rolloverNotice: previous.rolloverNotice || null,
        updatedAt: new Date().toISOString(),
      };

  state.version = appStateVersion;
  state.planText = planText;
  state.revisionRequest = requestText;
  state.scheduleKey = scheduleKey;
  state.selectedDay = Math.max(1, Math.min(Number(state.selectedDay) || 1, schedule.length));

  return { plan, planText, schedule, state };
}

function savePlanBundleState(state) {
  saveExecutionState({
    ...state,
    updatedAt: new Date().toISOString(),
  });
}

const companionStateKey = "omwCompanionState";
const companionEventKey = "omwCompanionEvents";
let activeFocusTaskIndex = 0;

function getDefaultCompanionState() {
  return {
    name: "올리",
    level: 1,
    xp: 0,
    mood: "ready",
    relationship: 1,
    energy: "normal",
    touched: 0,
    recentDialogueIds: [],
    updatedAt: new Date().toISOString(),
  };
}

function getCompanionState() {
  try {
    return {
      ...getDefaultCompanionState(),
      ...(JSON.parse(localStorage.getItem(companionStateKey)) || {}),
    };
  } catch (error) {
    return getDefaultCompanionState();
  }
}

function saveCompanionState(state) {
  try {
    localStorage.setItem(companionStateKey, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }));
  } catch (error) {
    console.warn("Unable to save companion state", error);
  }
}

function getXpRequirement(level) {
  return 40 + Math.max(0, level - 1) * 18;
}

function addCompanionXp(amount, mood = "happy") {
  const state = getCompanionState();
  let nextXp = Math.max(0, (state.xp || 0) + amount);
  let nextLevel = state.level || 1;

  while (nextXp >= getXpRequirement(nextLevel)) {
    nextXp -= getXpRequirement(nextLevel);
    nextLevel += 1;
  }

  const nextState = {
    ...state,
    xp: nextXp,
    level: nextLevel,
    mood,
  };
  saveCompanionState(nextState);
  return nextState;
}

function trackCompanionEvent(type, detail = {}) {
  try {
    const events = JSON.parse(localStorage.getItem(companionEventKey)) || [];
    events.push({ type, detail, createdAt: new Date().toISOString() });
    localStorage.setItem(companionEventKey, JSON.stringify(events.slice(-80)));
  } catch (error) {
    console.warn("Unable to save companion event", error);
  }
}

function showToast(message) {
  let toast = document.querySelector(".app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "app-toast";
    document.body.append(toast);
  }

  const [title, detail] = message.split(" · ");
  toast.innerHTML = "";
  const titleEl = document.createElement("strong");
  titleEl.textContent = title || message;
  toast.append(titleEl);
  if (detail) {
    const detailEl = document.createElement("span");
    detailEl.textContent = detail;
    toast.append(detailEl);
  }
  toast.classList.add("show");
  if (appLiveRegion) appLiveRegion.textContent = `${title || message}${detail ? `. ${detail}` : ""}`;
  window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function announce(message) {
  if (appLiveRegion) appLiveRegion.textContent = message;
}

function pulseCompanion() {
  if (!companionHomeImage) return;
  companionHomeImage.classList.remove("is-celebrating");
  window.requestAnimationFrame(() => {
    companionHomeImage.classList.add("is-celebrating");
    window.setTimeout(() => companionHomeImage.classList.remove("is-celebrating"), 900);
  });
}

function showOllieReaction(message) {
  if (message && companionMessage) companionMessage.textContent = message;
  closeCompanionChat();
  const speech = document.querySelector("#companionHome .companion-speech");
  window.setTimeout(() => {
    speech?.scrollIntoView({ behavior: "smooth", block: "center" });
    pulseCompanion();
    if (!speech) return;
    speech.classList.remove("is-reacting");
    window.requestAnimationFrame(() => {
      speech.classList.add("is-reacting");
      window.setTimeout(() => speech.classList.remove("is-reacting"), 1600);
    });
  }, 80);
}

function appendRevisionRequest(text, response = "좋아요. 그 요청을 플랜 수정 요청에 넣어둘게요.") {
  if (!text || !planRevisionRequest) return;

  const current = planRevisionRequest.value.trim();
  planRevisionRequest.value = current ? `${current}\n${text}` : text;
  updateRevisionButtonState();
  if (planEditorMessage) {
    planEditorMessage.textContent = "올리의 제안을 수정 요청에 담았습니다. 변경안 만들기를 누르면 적용 전 미리보기를 볼 수 있어요.";
  }
  if (companionChatResponse) companionChatResponse.textContent = response;
  if (companionMessage) companionMessage.textContent = response;
  announce(response);
}

let activeSheet = null;
let previousFocusElement = null;

function getFocusableElements(container) {
  if (!container) return [];
  return [...container.querySelectorAll("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])")].filter(
    (element) => !element.disabled && !element.hidden
  );
}

function setSheetOpen(sheet, overlay, open) {
  if (!sheet || !overlay) return;

  sheet.hidden = !open;
  overlay.hidden = !open;
  document.body.classList.toggle("sheet-open", open);
  if (open) {
    previousFocusElement = document.activeElement;
    activeSheet = sheet;
    window.setTimeout(() => {
      const focusTarget = getFocusableElements(sheet)[0] || sheet;
      focusTarget.focus();
    }, 0);
  } else if (activeSheet === sheet) {
    activeSheet = null;
    previousFocusElement?.focus?.();
    previousFocusElement = null;
  }
}

function openCompanionChat() {
  setSheetOpen(companionChatSheet, chatOverlay, true);
  if (companionChatInput) companionChatInput.focus();
  trackCompanionEvent("companion_chat_opened");
}

function closeCompanionChat() {
  setSheetOpen(companionChatSheet, chatOverlay, false);
}

function openFocusMode() {
  const bundle = getPlanBundle();
  const dayPlan = bundle.schedule[bundle.state.selectedDay - 1] || bundle.schedule[0];
  const checked = bundle.state.checkedByDay[String(dayPlan.day)] || [];
  const nextIndex = Math.max(0, dayPlan.tasks.findIndex((_, index) => !checked[index]));
  const taskIndex = nextIndex === -1 ? 0 : nextIndex;
  const task = dayPlan.tasks[taskIndex];

  activeFocusTaskIndex = taskIndex;
  if (focusModeTitle) focusModeTitle.textContent = task?.text || "오늘의 한 걸음";
  if (focusCriteria) focusCriteria.textContent = `완료 기준: ${task?.time || "오늘"}에 5분만 해도 성공`;
  if (focusTimer) focusTimer.textContent = "15:00";
  setSheetOpen(focusMode, focusModeOverlay, true);
  trackCompanionEvent("focus_started", { day: dayPlan.day, taskIndex });
}

function closeFocusMode() {
  setSheetOpen(focusMode, focusModeOverlay, false);
}

function getTaskKey(day, taskIndex) {
  return `${day}:${taskIndex}`;
}

function recordTaskCompletion(state, dayPlan, taskIndex) {
  const task = dayPlan.tasks[taskIndex];
  if (!task) return;
  const taskKey = getTaskKey(dayPlan.day, taskIndex);
  const exists = (state.completedLog || []).some((item) => item.taskKey === taskKey);
  if (!exists) {
    state.completedLog = [
      ...(state.completedLog || []),
      {
        taskKey,
        day: dayPlan.day,
        taskIndex,
        time: task.time,
        text: task.text,
        completedAt: new Date().toISOString(),
      },
    ].slice(-80);
  }
  state.lastCompletion = { taskKey, day: dayPlan.day, taskIndex, text: task.text };
}

function completeFocusTask() {
  const bundle = getPlanBundle();
  const selectedDay = String(bundle.state.selectedDay);
  const dayPlan = bundle.schedule[bundle.state.selectedDay - 1] || bundle.schedule[0];
  const checked = bundle.state.checkedByDay[selectedDay] || Array(dayPlan.tasks.length).fill(false);
  const wasUnchecked = !checked[activeFocusTaskIndex];

  checked[activeFocusTaskIndex] = true;
  bundle.state.checkedByDay[selectedDay] = checked;
  if (wasUnchecked) recordTaskCompletion(bundle.state, dayPlan, activeFocusTaskIndex);
  savePlanBundleState(bundle.state);
  if (wasUnchecked) addCompanionXp(10, "happy");
  closeFocusMode();
  pulseCompanion();
  showToast(wasUnchecked ? "오늘의 한 걸음 완료 · 올리가 10 XP를 얻었어요" : "이미 완료된 한 걸음이에요");
  trackCompanionEvent("focus_completed", { day: dayPlan.day, taskIndex: activeFocusTaskIndex, rewarded: wasUnchecked });
  renderExecutionPage(bundle);
}

function renderFocusTask(dayPlan, selectedCompletion) {
  if (!focusTaskTitle || !dayPlan) return;

  const bundle = getPlanBundle();
  const checked = bundle.state.checkedByDay[String(dayPlan.day)] || [];
  const nextIndex = dayPlan.tasks.findIndex((_, index) => !checked[index]);
  const taskIndex = nextIndex === -1 ? 0 : nextIndex;
  const task = dayPlan.tasks[taskIndex];

  if (focusTaskTitle) focusTaskTitle.textContent = task?.text || "오늘 기록 돌아보기";
  if (focusTaskMeta) focusTaskMeta.textContent = `${dayPlan.title.replace(/^Day \d+ · /, "")} · ${task?.time || "오늘"}`;
  if (minimumGoalText) minimumGoalText.textContent = selectedCompletion.percent === 100 ? "오늘 계획을 모두 마쳤어요" : "최소 성공: 5분만 해도 완료";
  if (focusProgressText) focusProgressText.textContent = `${selectedCompletion.completed}/${selectedCompletion.total} 완료`;
  if (startFocusButton) {
    startFocusButton.dataset.taskIndex = String(taskIndex);
    startFocusButton.textContent = selectedCompletion.percent === 100 ? "다시 보기" : "올리와 시작하기";
  }
}

function renderChecklist(dayPlan, state) {
  if (!executionChecklist) return;

  executionChecklist.innerHTML = "";
  const checked = state.checkedByDay[String(dayPlan.day)] || [];

  dayPlan.tasks.forEach((task, index) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    const content = document.createElement("span");
    const time = document.createElement("strong");
    const text = document.createElement("span");

    label.className = "task-row";
    input.className = "execution-check";
    input.type = "checkbox";
    input.dataset.taskIndex = String(index);
    input.checked = Boolean(checked[index]);
    label.classList.toggle("is-complete", input.checked);
    content.className = "task-content";

    time.textContent = task.time;
    text.textContent = task.text;

    const minimum = document.createElement("small");
    minimum.className = "minimum-action";
    minimum.textContent = "최소 성공: 5분만 해도 완료";

    content.append(time, text, minimum);
    label.append(input, content);
    executionChecklist.append(label);
  });
}

function renderCalendar(schedule, state) {
  if (!scheduleCalendar) return;

  scheduleCalendar.innerHTML = "";
  const monthDays = getVisibleMonthSchedule(schedule);

  monthDays.forEach((dayPlan) => {
    const completion = getDayCompletion(dayPlan, state.checkedByDay);
    const button = document.createElement("button");
    const day = document.createElement("strong");
    const percent = document.createElement("span");

    button.type = "button";
    button.className = "calendar-day";
    button.dataset.day = String(dayPlan.day);
    button.style.setProperty("--day-progress", `${completion.percent}%`);
    button.classList.toggle("selected", dayPlan.day === state.selectedDay);
    button.classList.toggle("done", completion.percent === 100);
    button.classList.toggle("partial", completion.percent > 0 && completion.percent < 100);

    day.textContent = String(dayPlan.day);
    percent.textContent = `${completion.percent}%`;
    button.setAttribute("aria-label", `${dayPlan.day}일차 ${completion.percent}% 완료`);
    button.append(day, percent);
    scheduleCalendar.append(button);
  });
}

function renderWeeklyPlan(schedule) {
  if (!weeklyPlanList) return;
  const labels = ["월", "수", "금", "일"];
  const picks = [0, 2, 4, 6].map((index) => schedule[index]).filter(Boolean);

  weeklyPlanList.innerHTML = "";
  picks.forEach((dayPlan, index) => {
    const item = document.createElement("li");
    const day = document.createElement("span");
    const title = document.createElement("strong");
    const detail = document.createElement("p");

    day.textContent = labels[index] || `D${dayPlan.day}`;
    title.textContent = dayPlan.title.replace(/^Day \d+ · /, "");
    detail.textContent = dayPlan.tasks.map((task) => task.text).slice(0, 2).join(" · ");
    item.append(day, title, detail);
    weeklyPlanList.append(item);
  });
}

function renderRoutineInsight(plan) {
  if (!routineModeTitle) return;

  const routineTime = plan.routineTime || "아침";
  const currentRoutine = plan.currentRoutine || "기존 루틴";
  const readiness = plan.routineReadiness || DEFAULT_ROUTINE_READINESS;
  const isDelayProne = needsLowFrictionStart(readiness);
  const cues = isDelayProne
    ? [`${currentRoutine} 뒤 10분만`, "알림으로 다시 시작", "못한 날은 다음 칸으로 이동"]
    : [`${currentRoutine}와 연결`, "완료 즉시 체크", "달력에서 진행률 확인"];

  routineModeTitle.textContent = `${routineTime} 루틴 모드`;
  if (routineModeMeta) {
    routineModeMeta.textContent = isDelayProne
      ? `${readiness} 성향에 맞춰 작게 시작하고 다시 불러옵니다`
      : `${readiness} 성향에 맞춰 바로 실행할 수 있게 배치합니다`;
  }

  if (routineCueList) {
    routineCueList.innerHTML = "";
    cues.forEach((cue) => {
      const item = document.createElement("span");
      item.textContent = cue;
      routineCueList.append(item);
    });
  }
}

function getCompanionStage(overallProgress) {
  const stages = [
    { threshold: 0, title: "작은 방", badge: "출발", level: 1 },
    { threshold: 25, title: "집 앞 산책길", badge: "25%", level: 2 },
    { threshold: 50, title: "작은 숲", badge: "50%", level: 3 },
    { threshold: 75, title: "별빛 언덕", badge: "75%", level: 4 },
    { threshold: 100, title: "목표의 정원", badge: "완주", level: 5 },
  ];

  return stages.reduce((current, stage) => (overallProgress >= stage.threshold ? stage : current), stages[0]);
}

function pickCompanionCopy(situation, options) {
  const state = getCompanionState();
  const recent = Array.isArray(state.recentDialogueIds) ? state.recentDialogueIds : [];
  const pick = options.find((option) => !recent.includes(option.id)) || options[0];
  saveCompanionState({
    ...state,
    recentDialogueIds: [...recent.filter((id) => id !== pick.id), pick.id].slice(-6),
  });
  return {
    ...pick,
    situation,
  };
}

function getCompanionCopy({ selectedCompletion, remainingTasks, completedDays, overallProgress, readiness }) {
  if (selectedCompletion.percent === 100) {
    return pickCompanionCopy("complete", [
      {
        id: "complete-1",
        mood: "뿌듯함",
        line: "해냈다! 오늘의 우리는 한 걸음 더 갔어요.",
        message: "완료한 기록은 그대로 남아 있어요. 내일은 조금 더 쉽게 시작할 수 있어요.",
      },
      {
        id: "complete-2",
        mood: "뿌듯함",
        line: "오늘의 한 걸음이 올리의 여정에 남았어요.",
        message: "작은 완료도 다음 계획을 더 정확하게 만드는 단서가 됩니다.",
      },
    ]);
  }

  if (needsLowFrictionStart(readiness) || remainingTasks > 1) {
    return pickCompanionCopy("overloaded", [
      {
        id: "overloaded-1",
        mood: "응원",
        line: "5분만 시작해도 오늘은 성공이에요.",
        message: "계획이 컸다면 올리가 더 작은 단계로 나눠줄게요.",
      },
      {
        id: "overloaded-2",
        mood: "응원",
        line: "오늘은 전부 말고, 열리는 문 하나만 고를게요.",
        message: "부담스러운 일정은 Journey에서 변경안으로 줄일 수 있어요.",
      },
    ]);
  }

  if (overallProgress >= 50) {
    return pickCompanionCopy("midway", [
      {
        id: "midway-1",
        mood: "기대",
        line: "절반을 지나왔어요. 속도보다 계속 가는 게 중요해요.",
        message: "남은 일정은 실행 성향과 오늘 상황에 맞춰 조절해도 괜찮아요.",
      },
      {
        id: "midway-2",
        mood: "기대",
        line: "여기까지 온 기록이 다음 길을 더 선명하게 해줘요.",
        message: "완료한 일정은 지키고, 남은 것만 다시 설계할 수 있어요.",
      },
    ]);
  }

  return pickCompanionCopy("ready", [
    {
      id: "ready-1",
      mood: completedDays > 0 ? "기대" : "기본",
      line: "오늘 첫 걸음을 기다리고 있어요.",
      message: "함께 시작하면 부담이 조금 작아져요. 가장 작은 행동부터 가볼까요?",
    },
    {
      id: "ready-2",
      mood: completedDays > 0 ? "기대" : "기본",
      line: "계획보다 시작이 먼저예요.",
      message: "올리와 시작하기를 누르면 오늘 할 한 가지만 꺼내볼게요.",
    },
  ]);
}

function renderJourneyMap(overallProgress) {
  if (!journeyMap) return;
  const stage = getCompanionStage(overallProgress);
  const stops = [
    { title: "작은 방", shortTitle: "방", threshold: 0, icon: "⌂", theme: "room", story: "첫 마음을 심고, 아주 작은 시작을 준비하는 포근한 공간이에요." },
    { title: "집 앞 산책길", shortTitle: "산책길", threshold: 25, icon: "✿", theme: "path", story: "반복이 발걸음이 되어 올리와 천천히 밖으로 나왔어요." },
    { title: "작은 숲", shortTitle: "숲", threshold: 50, icon: "♧", theme: "forest", story: "절반을 지나며 루틴이 나무처럼 단단하게 자라고 있어요." },
    { title: "별빛 언덕", shortTitle: "언덕", threshold: 75, icon: "✦", theme: "hill", story: "쌓아 온 시간을 내려다보며 마지막 걸음을 준비하는 곳이에요." },
    { title: "목표의 정원", shortTitle: "정원", threshold: 100, icon: "❀", theme: "garden", story: "목표를 이룬 마음이 꽃처럼 피어나 오래 기억되는 정원이에요." },
  ];

  const currentIndex = stops.reduce((index, stop, stopIndex) => (overallProgress >= stop.threshold ? stopIndex : index), 0);
  const currentStop = stops[currentIndex];
  const nextStop = stops[currentIndex + 1];
  const segmentStart = currentStop.threshold;
  const segmentEnd = nextStop?.threshold ?? 100;
  const segmentProgress = nextStop ? Math.min(100, Math.round(((overallProgress - segmentStart) / (segmentEnd - segmentStart)) * 100)) : 100;

  journeyMap.innerHTML = "";
  stops.forEach((stop, index) => {
    const item = document.createElement("article");
    item.className = `journey-stop journey-${stop.theme}`;
    item.classList.toggle("done", overallProgress >= stop.threshold);
    item.classList.toggle("current", index === currentIndex);
    item.classList.toggle("locked", overallProgress < stop.threshold);
    item.setAttribute("aria-label", `${stop.title}, ${index === currentIndex ? "현재 장소" : overallProgress >= stop.threshold ? "지나온 장소" : `${stop.threshold}%에 열림`}`);
    item.innerHTML = `
      <div class="journey-scene" aria-hidden="true">
        <span class="scene-sun"></span>
        <span class="scene-cloud scene-cloud-one"></span>
        <span class="scene-cloud scene-cloud-two"></span>
        <span class="scene-landmark">${stop.icon}</span>
        <span class="scene-ground"></span>
        ${index === currentIndex ? '<span class="journey-ollie"><img src="assets/ollie-celebrate.png" alt=""><b>여기!</b></span>' : ""}
      </div>
      <div class="journey-stop-copy">
        <small>STEP ${index + 1}</small>
        <strong>${stop.shortTitle}</strong>
        <em>${stop.threshold === 0 ? "출발" : `${stop.threshold}%`}</em>
      </div>`;
    journeyMap.append(item);
  });

  journeyMap.scrollLeft = Math.max(0, currentIndex * 148 - 12);

  if (journeyBadge) journeyBadge.textContent = stage.badge;
  if (journeyPlaceTitle) journeyPlaceTitle.textContent = currentStop.title;
  if (journeyPlaceStory) journeyPlaceStory.textContent = currentStop.story;
  if (journeyNextText) journeyNextText.textContent = nextStop ? `${nextStop.shortTitle}까지 ${Math.max(0, nextStop.threshold - overallProgress)}% 남음` : "정원에 도착했어요!";
  if (journeyNextBar) journeyNextBar.style.width = `${segmentProgress}%`;
}

function renderMemoryCards({ selectedCompletion, completedDays, overallProgress }) {
  if (!memoryList) return;
  const state = getExecutionState();
  const meolliees = [
    completedDays > 0 ? `처음으로 ${completedDays}일의 실행 기록을 만들었어요.` : "오늘 첫 체크인을 준비하고 있어요.",
    selectedCompletion.percent > 0 ? `오늘 계획의 ${selectedCompletion.percent}%를 진행했어요.` : "아직 시작 전이어도, 계획은 여기서 기다리고 있어요.",
    overallProgress >= 50 ? "목표의 절반을 넘어선 순간을 올리가 기억해요." : "작은 실행이 쌓이면 다음 장소가 열려요.",
  ];

  memoryList.innerHTML = "";
  meolliees.forEach((memory) => {
    const item = document.createElement("article");
    item.textContent = memory;
    memoryList.append(item);
  });

  renderPatternCards(state);
  renderDifficultyPrompt(state);
}

function renderPatternCards(state) {
  if (!patternList) return;
  const completedLog = state.completedLog || [];
  const difficultyValues = Object.values(state.difficultyByTask || {});
  const eveningCount = completedLog.filter((item) => Number(String(item.time).slice(0, 2)) >= 18).length;
  const hardCount = difficultyValues.filter((value) => value === "hard").length;
  const recoveryCount = (state.recoveryActions || []).length;
  const patterns = [
    completedLog.length
      ? `올리는 ${completedLog.length}개의 실행 기록을 기억하고 있어요.`
      : "아직 패턴을 만들기 전이에요. 첫 완료가 기록의 시작입니다.",
    eveningCount >= 2
      ? "저녁 시간대 실행률이 높아요. 다음 변경안도 저녁 중심으로 제안할 수 있어요."
      : "완료 시간이 쌓이면 가장 잘 맞는 시간대를 찾아드릴게요.",
    hardCount
      ? `${hardCount}개의 과제가 어렵다고 표시됐어요. 다음 계획은 더 작게 나누는 편이 좋아요.`
      : "난이도 피드백을 남기면 올리가 다음 계획의 무게를 맞출 수 있어요.",
    recoveryCount
      ? `놓친 일정 ${recoveryCount}개를 회복 흐름으로 연결했어요.`
      : "놓친 일정도 실패가 아니라 다음 선택지로 바꿀 수 있어요.",
  ];

  patternList.innerHTML = "";
  patterns.forEach((pattern) => {
    const item = document.createElement("article");
    item.textContent = pattern;
    patternList.append(item);
  });
}

function renderDifficultyPrompt(state) {
  if (!difficultyCard) return;
  const last = state.lastCompletion;
  const hasFeedback = last && state.difficultyByTask?.[last.taskKey];
  difficultyCard.hidden = !last || Boolean(hasFeedback);
  difficultyButtons.forEach((button) => {
    button.classList.toggle("active", Boolean(last && button.dataset.difficulty === state.difficultyByTask?.[last.taskKey]));
  });
}

function renderRecoveryPrompt(state, selectedCompletion) {
  if (!recoveryCard) return;
  const notice = state.rolloverNotice;
  const shouldShow = Boolean(notice && selectedCompletion.percent < 100);
  recoveryCard.hidden = !shouldShow;
  if (recoverySummary && notice) {
    recoverySummary.textContent = `지난 접속에서 ${notice.missedCount}개가 남았어요. 올리가 다시 시작할 형태로 바꿔둘게요.`;
  }
}

function renderCompanionExperience({ plan, selectedCompletion, remainingTasks, completedDays, overallProgress }) {
  const stage = getCompanionStage(overallProgress);
  const companionState = getCompanionState();
  const xpNeed = getXpRequirement(companionState.level || stage.level);
  const xpPercent = xpNeed ? Math.round(((companionState.xp || 0) / xpNeed) * 100) : overallProgress;
  const copy = getCompanionCopy({
    selectedCompletion,
    remainingTasks,
    completedDays,
    overallProgress,
    readiness: plan.routineReadiness || DEFAULT_ROUTINE_READINESS,
  });
  const nextMilestone = [25, 50, 75, 100].find((value) => overallProgress < value) || 100;

  const ollieMoodImage =
    companionState.mood === "happy"
      ? "assets/ollie-celebrate.png"
      : companionState.mood === "caring" || companionState.energy === "tired"
        ? "assets/ollie-comfort.png"
        : companionState.mood === "ready" || companionState.energy === "good"
          ? "assets/ollie-action.png"
          : "assets/ollie-thinking.png";

  if (companionName) companionName.textContent = companionState.name || "올리";
  if (companionHomeImage) companionHomeImage.src = ollieMoodImage;
  if (executionCompanion) executionCompanion.src = ollieMoodImage;
  if (companionMoodLine) {
    companionMoodLine.textContent =
      companionState.energy === "tired" ? "오늘은 작게 줄이는 것도 실행이에요." : copy.line;
  }
  if (companionMessage) {
    companionMessage.textContent =
      companionState.mood === "happy" ? "방금 만든 실행 기록을 올리가 기억했어요." : copy.message;
  }
  if (companionStage) companionStage.textContent = stage.title;
  if (companionLevel) companionLevel.textContent = `Lv. ${Math.max(stage.level, companionState.level || 1)}`;
  if (companionXpBar) companionXpBar.style.width = `${Math.max(6, xpPercent || overallProgress)}%`;
  if (companionMood) companionMood.textContent = copy.mood;
  if (companionDays) companionDays.textContent = `${Math.max(1, completedDays || 1)}일`;
  if (companionNextGrowth) companionNextGrowth.textContent = `${nextMilestone}%`;
  if (executionCompanionText) executionCompanionText.textContent = copy.message;
  if (executionCompanionTitle) executionCompanionTitle.textContent = "목표 메이트 올리";
  if (executionCompanionPath) executionCompanionPath.textContent = "작은 방 → 산책길 → 숲 → 별빛 언덕";

  renderJourneyMap(overallProgress);
  renderMemoryCards({ selectedCompletion, completedDays, overallProgress });
}

function renderPlanPreview(planText, pendingPlanText = "") {
  if (!planPreviewList) return;

  const tasks = parsePlanText(planText, "오늘 첫 행동 정하기").slice(0, 6);
  const pendingTasks = pendingPlanText ? parsePlanText(pendingPlanText, "오늘 첫 행동 정하기").slice(0, 4) : [];
  planPreviewList.innerHTML = "";

  if (pendingTasks.length) {
    const summary = document.createElement("article");
    summary.className = "proposal-summary";
    const label = document.createElement("span");
    const title = document.createElement("strong");
    const detail = document.createElement("p");

    label.textContent = "변경안";
    title.textContent = "올리가 이렇게 바꿔봤어요";
    detail.textContent = pendingTasks.map((task) => task.replace(/^수정 요청 반영:\s*/, "")).slice(0, 3).join(" · ");
    summary.append(label, title, detail);
    planPreviewList.append(summary);
  }

  tasks.forEach((task, index) => {
    const item = document.createElement("article");
    const day = document.createElement("span");
    const title = document.createElement("strong");
    const detail = document.createElement("p");

    day.textContent = `D${index + 1}`;
    title.textContent = task.replace(/^수정 요청 반영:\s*/, "요청 반영");
    detail.textContent = pendingTasks.length
      ? "현재 적용 중인 계획입니다. 변경안 적용 전까지 유지됩니다."
      : index === 0
        ? "AI가 가장 먼저 반영할 실행 기준입니다."
        : "완료 기준과 최소 성공 기준을 함께 잡습니다.";
    item.append(day, title, detail);
    planPreviewList.append(item);
  });
}

function updateRevisionButtonState() {
  if (!regeneratePlanButton || !planRevisionRequest) return;

  const hasRequest = planRevisionRequest.value.trim().length > 0;
  regeneratePlanButton.disabled = !hasRequest;
  if (planEditorMessage && !hasRequest) {
    planEditorMessage.textContent = "바꾸고 싶은 내용을 한 가지 이상 적으면 적용 전 변경안을 만들 수 있어요.";
  }
}

function renderExecutionPage(bundle) {
  if (!executionGoal) return;

  const { plan, planText, schedule, state } = bundle;
  const period = schedule.length;
  const selectedDay = schedule[state.selectedDay - 1] || schedule[0];
  const selectedCompletion = getDayCompletion(selectedDay, state.checkedByDay);
  const overallProgress = getScheduleCompletion(schedule, state.checkedByDay);
  const visibleMonth = getVisibleMonthSchedule(schedule);
  const monthProgress = getScheduleCompletion(visibleMonth, state.checkedByDay);
  const monthCompletedDays = getCompletedDayCount(visibleMonth, state.checkedByDay);
  const completedDays = getCompletedDayCount(schedule, state.checkedByDay);
  const remainingTasks = selectedCompletion.total - selectedCompletion.completed;

  if (planEditor && planEditor.value !== planText) planEditor.value = planText;
  renderPlanPreview(planText, state.pendingPlanText || "");
  if (planRevisionRequest && document.activeElement !== planRevisionRequest && planRevisionRequest.value !== (state.revisionRequest || "")) {
    planRevisionRequest.value = state.revisionRequest || "";
  }
  updateRevisionButtonState();
  if (planStatusBadge) planStatusBadge.textContent = state.pendingPlanText ? "변경안 대기" : state.status || "AI 제안";
  if (acceptPlanButton) acceptPlanButton.disabled = !state.pendingPlanText;
  if (keepPlanButton) keepPlanButton.disabled = !state.pendingPlanText;
  if (reviseAgainButton) reviseAgainButton.disabled = false;
  if (todayDateLabel) todayDateLabel.textContent = "Today";
  executionGoal.textContent = "오늘의 한 걸음";
  if (executionStyle) {
    const todayLabel = new Date().toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
      weekday: "long",
    });
    executionStyle.textContent = `${todayLabel} · ${selectedCompletion.completed}/${selectedCompletion.total} 완료`;
  }
  if (executionPeriod) executionPeriod.textContent = plan.goal || `${period}일 목표`;
  if (executionDay) executionDay.textContent = `Day ${selectedDay.day} / ${period}`;
  if (executionStreak) executionStreak.textContent = `${completedDays}일 완료`;
  if (executionProgress) executionProgress.textContent = `${overallProgress}%`;
  if (executionProgressBar) {
    executionProgressBar.style.width = `${overallProgress}%`;
    executionProgressBar.parentElement?.style.setProperty("--journey-dot", `${overallProgress}%`);
  }
  if (selectedScheduleTitle) selectedScheduleTitle.textContent = `${selectedDay.day}일차 스케줄`;
  if (selectedScheduleMeta) selectedScheduleMeta.textContent = `${selectedCompletion.percent}% 완료 · ${remainingTasks}개 남음`;
  if (monthlyCompletion) monthlyCompletion.textContent = `${monthProgress}%`;
  if (calendarSummary) calendarSummary.textContent = `첫 ${visibleMonth.length}일 중 ${monthCompletedDays}일을 완료했습니다`;

  if (executionMessage) {
    executionMessage.textContent =
      selectedCompletion.percent === 100
        ? `${selectedDay.day}일차 계획을 모두 완료했어요. 올리와 다음 장소에 가까워졌습니다.`
        : `${selectedDay.day}일차 계획 ${remainingTasks}개가 남았어요. 체크할 때마다 완성률이 바로 반영됩니다.`;
  }

  renderChecklist(selectedDay, state);
  renderCalendar(schedule, state);
  renderWeeklyPlan(schedule);
  renderRoutineInsight(plan);
  renderFocusTask(selectedDay, selectedCompletion);
  renderRecoveryPrompt(state, selectedCompletion);
  renderCompanionExperience({ plan, selectedCompletion, remainingTasks, completedDays, overallProgress });
}

function applyExecutionTheme(themeName) {
  const theme = themes[themeName] || themes.buddy;
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

  const bundle = getPlanBundle();
  savePlanBundleState(bundle.state);
  renderExecutionPage(bundle);

  let savedTheme = "buddy";
  try {
    savedTheme = localStorage.getItem("omwExecutionTheme") || "buddy";
  } catch (error) {
    savedTheme = "buddy";
  }
  if (savedTheme !== "buddy") savedTheme = "buddy";
  applyExecutionTheme(savedTheme);
}

executionChecklist?.addEventListener("change", (event) => {
  if (!event.target.classList.contains("execution-check")) return;

  const bundle = getPlanBundle();
  const selectedDay = String(bundle.state.selectedDay);
  const taskIndex = Number(event.target.dataset.taskIndex);
  const dayPlan = bundle.schedule[bundle.state.selectedDay - 1];
  const checked = bundle.state.checkedByDay[selectedDay] || Array(dayPlan.tasks.length).fill(false);
  const wasUnchecked = !checked[taskIndex];
  checked[taskIndex] = event.target.checked;
  bundle.state.checkedByDay[selectedDay] = checked;
  savePlanBundleState(bundle.state);
  if (event.target.checked && wasUnchecked) {
    recordTaskCompletion(bundle.state, dayPlan, taskIndex);
    savePlanBundleState(bundle.state);
    addCompanionXp(10, "happy");
    pulseCompanion();
    showToast("오늘의 한 걸음 완료 · 올리가 10 XP를 얻었어요");
    trackCompanionEvent("task_completed", { day: dayPlan.day, taskIndex });
  }
  renderExecutionPage(bundle);
});

completeTodayButton?.addEventListener("click", () => {
  const bundle = getPlanBundle();
  const selectedDay = String(bundle.state.selectedDay);
  const dayPlan = bundle.schedule[bundle.state.selectedDay - 1];
  const current = bundle.state.checkedByDay[selectedDay] || [];
  const newlyCompleted = dayPlan.tasks.filter((_, index) => !current[index]).length;
  bundle.state.checkedByDay[selectedDay] = dayPlan.tasks.map(() => true);
  dayPlan.tasks.forEach((_, index) => {
    if (!current[index]) recordTaskCompletion(bundle.state, dayPlan, index);
  });
  savePlanBundleState(bundle.state);
  if (newlyCompleted > 0) {
    addCompanionXp(newlyCompleted * 10 + 8, "happy");
    pulseCompanion();
    showToast(`오늘 계획 완료 · 올리가 ${newlyCompleted * 10 + 8} XP를 얻었어요`);
    trackCompanionEvent("all_day_completed", { day: dayPlan.day, newlyCompleted });
  }
  renderExecutionPage(bundle);
});

scheduleCalendar?.addEventListener("click", (event) => {
  const button = event.target.closest(".calendar-day");
  if (!button) return;

  const bundle = getPlanBundle();
  bundle.state.selectedDay = Number(button.dataset.day);
  savePlanBundleState(bundle.state);
  renderExecutionPage(bundle);
});

revisionChipButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!planRevisionRequest) return;

    const chipText = button.dataset.revisionChip || "";
    const current = planRevisionRequest.value.trim();
    planRevisionRequest.value = current ? `${current}\n${chipText}` : chipText;
    planRevisionRequest.focus();
    updateRevisionButtonState();
  });
});

planRevisionRequest?.addEventListener("input", updateRevisionButtonState);

companionActionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.companionAction;
    const actionText = {
      light: "오늘은 최소 성공 기준만 보이도록 가장 작은 행동으로 줄여줘.",
      steady: "오늘은 기본 계획대로 진행할 수 있게 집중 순서만 정리해줘.",
      hard: "오늘은 조금 힘들어서 가장 중요한 한 가지 과제만 남기고 나머지는 내일로 옮겨줘.",
    }[action];

    if (!actionText) return;
    const state = getCompanionState();
    saveCompanionState({ ...state, energy: action === "hard" ? "tired" : action === "light" ? "normal" : "good", mood: "thinking" });
    appendRevisionRequest(actionText, "좋아요. 올리가 그 요청을 기준으로 새 스케줄 제안을 준비할게요.");
    addCompanionXp(2, "thinking");
    trackCompanionEvent("energy_selected", { action });
  });
});

openCompanionChatButton?.addEventListener("click", openCompanionChat);
openCompanionChatTriggers.forEach((button) => {
  button.addEventListener("click", openCompanionChat);
});
closeCompanionChatButton?.addEventListener("click", closeCompanionChat);
chatOverlay?.addEventListener("click", closeCompanionChat);

touchCompanionButton?.addEventListener("click", () => {
  const state = getCompanionState();
  const nextState = {
    ...state,
    relationship: (state.relationship || 1) + 1,
    touched: (state.touched || 0) + 1,
    mood: "happy",
  };
  saveCompanionState(nextState);
  addCompanionXp(2, "happy");
  pulseCompanion();
  showToast("올리와 가까워졌어요 · 관계 XP 2를 얻었어요");
  if (companionMessage) companionMessage.textContent = "고마워요. 오늘은 아주 작은 행동부터 같이 해봐요.";
  trackCompanionEvent("companion_touched", { touched: nextState.touched });
  renderExecutionPage(getPlanBundle());
});

energyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const energy = button.dataset.energy;
    const state = getCompanionState();
    const copy = {
      good: "좋아요. 지금 흐름이면 첫 번째 행동부터 바로 시작해도 괜찮겠어요.",
      normal: "보통인 날은 기준을 작게 잡으면 오래 갑니다.",
      tired: "지친 날은 하나만 남기고 나머지는 내일로 보내는 제안을 만들 수 있어요.",
    }[energy];

    saveCompanionState({ ...state, energy, mood: energy === "tired" ? "caring" : "ready" });
    energyButtons.forEach((item) => item.classList.toggle("active", item === button));
    if (companionChatResponse) companionChatResponse.textContent = copy;
    showOllieReaction(copy);
    addCompanionXp(2, "ready");
    trackCompanionEvent("chat_energy_selected", { energy });
  });
});

chatActionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.chatAction;
    const request = {
      shorten: "오늘 할 일을 5~10분 단위의 더 짧은 행동으로 나눠줘.",
      "move-evening": "오늘 실행 시간을 저녁으로 옮기고, 늦은 시간에도 부담 없는 순서로 다시 짜줘.",
      encourage: "오늘 계획 앞에 바로 시작할 수 있는 짧은 응원 문장을 추가해줘.",
      "one-task": "오늘은 가장 중요한 한 가지 과제만 남기고 나머지는 내일 이후로 옮기는 제안을 해줘.",
    }[action];

    if (!request) return;
    appendRevisionRequest(request, "수정 요청에 담아뒀어요. 새 스케줄은 사용자가 확인한 뒤 적용됩니다.");
    showOllieReaction();
    trackCompanionEvent("quick_adjustment_selected", { action });
  });
});

sendCompanionMessage?.addEventListener("click", () => {
  const message = companionChatInput?.value.trim() || "";
  if (!message) {
    if (companionChatResponse) companionChatResponse.textContent = "바꾸고 싶은 조건을 한 줄만 적어도 충분해요.";
    return;
  }

  if (!consumeOllieEnergy(1, "간단한 계획 수정")) return;

  appendRevisionRequest(`사용자 추가 요청: ${message}`, "좋아요. 이 내용을 참고해서 AI가 다시 짠 스케줄 미리보기를 만들 수 있어요.");
  companionChatInput.value = "";
  showOllieReaction();
  addCompanionXp(3, "thinking");
  trackCompanionEvent("custom_revision_requested", { length: message.length });
});

startFocusButton?.addEventListener("click", openFocusMode);
focusModeOverlay?.addEventListener("click", closeFocusMode);
closeFocusModeButton?.addEventListener("click", closeFocusMode);
finishFocusButton?.addEventListener("click", completeFocusTask);
minimizeFocusButton?.addEventListener("click", () => {
  if (focusTimer) focusTimer.textContent = "05:00";
  appendRevisionRequest("오늘은 이 행동을 5분짜리 최소 성공 기준으로 줄여줘.", "좋아요. 오늘은 5분만 해도 성공으로 제안할게요.");
  trackCompanionEvent("minimum_focus_selected");
});

difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const bundle = getPlanBundle();
    const last = bundle.state.lastCompletion;
    if (!last) return;
    bundle.state.difficultyByTask[last.taskKey] = button.dataset.difficulty;
    savePlanBundleState(bundle.state);
    const copy = {
      easy: "쉬웠던 과제는 다음에도 이 리듬을 유지할게요.",
      okay: "적당했던 난이도를 기준으로 다음 계획을 맞출게요.",
      hard: "어려웠던 과제는 더 작은 단위로 나누는 게 좋아요.",
    }[button.dataset.difficulty];
    showToast("난이도를 기록했어요 · 다음 변경안에 반영할 수 있어요");
    if (companionMessage) companionMessage.textContent = copy;
    trackCompanionEvent("task_difficulty_rated", { taskKey: last.taskKey, difficulty: button.dataset.difficulty });
    renderExecutionPage(bundle);
  });
});

recoveryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.recoveryAction;
    const request = {
      tomorrow: "놓친 일정은 내일 첫 번째 할 일로 옮겨줘.",
      five: "놓친 일정은 5분짜리 최소 성공 버전으로 줄여줘.",
      skip: "이번 주에는 놓친 일정을 제외하고 핵심 한 가지만 남겨줘.",
      time: "놓친 일정은 저녁 시간대로 다시 배치해줘.",
    }[action];
    const bundle = getPlanBundle();
    bundle.state.recoveryActions = [
      ...(bundle.state.recoveryActions || []),
      { action, request, createdAt: new Date().toISOString(), notice: bundle.state.rolloverNotice },
    ].slice(-30);
    bundle.state.rolloverNotice = null;
    savePlanBundleState(bundle.state);
    appendRevisionRequest(request, "좋아요. 놓친 일정은 실패가 아니라 변경안으로 다시 연결할게요.");
    trackCompanionEvent("missed_task_recovery_selected", { action });
    renderExecutionPage(getPlanBundle());
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeSheet) {
    event.preventDefault();
    if (activeSheet === companionChatSheet) closeCompanionChat();
    if (activeSheet === focusMode) closeFocusMode();
  }

  if (event.key !== "Tab" || !activeSheet) return;
  const focusable = getFocusableElements(activeSheet);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

acceptPlanButton?.addEventListener("click", () => {
  const current = getPlanBundle();
  if (!current.state.pendingPlanText) {
    if (planEditorMessage) planEditorMessage.textContent = "먼저 변경안 만들기를 눌러 적용할 내용을 확인해 주세요.";
    return;
  }
  const bundle = getPlanBundle({
    reset: true,
    customText: current.state.pendingPlanText,
    revisionRequest: current.state.pendingRevisionRequest || planRevisionRequest?.value.trim() || "",
  });
  bundle.state.pendingPlanText = "";
  bundle.state.pendingRevisionRequest = "";
  bundle.state.status = "적용 완료";
  savePlanBundleState(bundle.state);
  if (planEditorMessage) planEditorMessage.textContent = "변경안을 적용했어요. 오늘 일정도 함께 업데이트했습니다.";
  showToast("변경안을 적용했어요 · 완료한 일정은 그대로 보호했어요");
  renderExecutionPage(bundle);
});

regeneratePlanButton?.addEventListener("click", () => {
  const currentBundle = getPlanBundle();
  const baseText = planEditor?.value.trim() || currentBundle.state.planText || getDefaultPlanText(readExecutionPlan());
  const revisionRequest = planRevisionRequest?.value.trim() || "";
  if (!revisionRequest) {
    updateRevisionButtonState();
    return;
  }
  if (!consumeOllieEnergy(3, "오늘 일정 다시 만들기")) return;
  const customText = buildRevisedPlanText(baseText, revisionRequest);
  const bundle = getPlanBundle();
  bundle.state.pendingPlanText = customText;
  bundle.state.pendingRevisionRequest = revisionRequest;
  bundle.state.status = "변경안 대기";
  savePlanBundleState(bundle.state);
  if (planEditorMessage) {
    planEditorMessage.textContent = "올리가 변경안을 만들었습니다. 아직 적용되지 않았고, 완료한 일정은 그대로 보호됩니다.";
  }
  renderExecutionPage(bundle);
});

weeklyOptimizeButton?.addEventListener("click", () => {
  if (!consumeOllieEnergy(5, "주간 최적화")) return;
  appendRevisionRequest(
    "이번 주 완료율과 남은 일정을 기준으로 다음 7일의 실행 순서와 난이도를 최적화해줘.",
    "이번 주 흐름을 살펴보고, 무리 없이 이어갈 수 있는 변경안을 준비했어요.",
  );
  showToast("주간 최적화 제안을 준비했어요 · 올리 에너지 5 사용");
  trackCompanionEvent("weekly_optimization_requested", { energy: 5 });
});

reviseAgainButton?.addEventListener("click", () => {
  planRevisionRequest?.focus();
  if (planEditorMessage) planEditorMessage.textContent = "원하는 조건을 더 적으면 변경안을 다시 만들 수 있어요.";
});

keepPlanButton?.addEventListener("click", () => {
  const bundle = getPlanBundle();
  bundle.state.pendingPlanText = "";
  bundle.state.pendingRevisionRequest = "";
  bundle.state.status = "기존 계획 유지";
  savePlanBundleState(bundle.state);
  if (planEditorMessage) planEditorMessage.textContent = "기존 계획을 유지했어요. 변경안은 적용하지 않았습니다.";
  renderExecutionPage(bundle);
});

executionThemeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyExecutionTheme(button.dataset.theme);
  });
});

initializeExecutionPage();
