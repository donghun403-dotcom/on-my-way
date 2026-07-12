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
const planPreviewPanel = document.querySelector("#planPreviewPanel");
const goalSuggestionButtons = document.querySelectorAll("[data-goal-suggestion], [data-goal-category]");
const customGoalButton = document.querySelector("#customGoalButton");
const birthDateInput = document.querySelector("#birthDate");
const birthTimeInput = document.querySelector("#birthTime");
const birthPlaceInput = document.querySelector("#birthPlace");
const mbtiInput = document.querySelector("#mbti");
const goalPeriodInput = document.querySelector("#goalPeriod");
const routineReadinessInput = document.querySelector("#routineReadiness");
const routineTimeInput = document.querySelector("#routineTime");
const manseProfile = document.querySelector("#manseProfile");
const mbtiProfile = document.querySelector("#mbtiProfile");
const planningStyle = document.querySelector("#planningStyle");
const aiPreviewButton = document.querySelector("#aiPreviewButton");
const aiPreviewStatus = document.querySelector("#aiPreviewStatus");
const aiPreviewTitle = document.querySelector("#aiPreviewTitle");
const aiPreviewList = document.querySelector("#aiPreviewList");
const aiTodaySchedule = document.querySelector("#aiTodaySchedule");
const aiVisibleWeekPlan = document.querySelector("#aiVisibleWeekPlan");
const aiGoalRoadmap = document.querySelector("#aiGoalRoadmap");
const aiCoachMessage = document.querySelector("#aiCoachMessage");
const previewPersonality = document.querySelector("#previewPersonality");
const previewStyle = document.querySelector("#previewStyle");
const previewAction = document.querySelector("#previewAction");
const previewDuration = document.querySelector("#previewDuration");
const previewCompletionRule = document.querySelector("#previewCompletionRule");
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
const openEnergyChargeButton = document.querySelector("#openEnergyCharge");
const warningChargeButton = document.querySelector("#warningChargeButton");
const energyChargeOverlay = document.querySelector("#energyChargeOverlay");
const energyChargeSheet = document.querySelector("#energyChargeSheet");
const closeEnergyChargeButton = document.querySelector("#closeEnergyCharge");
const energyChargeBalance = document.querySelector("#energyChargeBalance");
const energyPackButtons = document.querySelectorAll("[data-energy-pack]");
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
const revisionMaterials = document.querySelector("#revisionMaterials");
const revisionCoverage = document.querySelector("#revisionCoverage");
const revisionWeekdayMinutes = document.querySelector("#revisionWeekdayMinutes");
const revisionWeekendMinutes = document.querySelector("#revisionWeekendMinutes");
const revisionPreferredTime = document.querySelector("#revisionPreferredTime");
const revisionIncreaseFocus = document.querySelector("#revisionIncreaseFocus");
const revisionDecreaseFocus = document.querySelector("#revisionDecreaseFocus");
const revisionKeepRules = document.querySelector("#revisionKeepRules");
const revisionConstraints = document.querySelector("#revisionConstraints");
const revisionDetailInputs = document.querySelectorAll("[data-revision-detail]");
const revisionDayInputs = document.querySelectorAll("[data-revision-day]");
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
const calendarMonthTitle = document.querySelector("#calendarMonthTitle");
const calendarSummary = document.querySelector("#calendarSummary");
const monthlyCompletion = document.querySelector("#monthlyCompletion");
const previousCalendarMonth = document.querySelector("#previousCalendarMonth");
const currentCalendarMonth = document.querySelector("#currentCalendarMonth");
const nextCalendarMonth = document.querySelector("#nextCalendarMonth");
const calendarDayDetail = document.querySelector("#calendarDayDetail");
const calendarDayDetailTitle = document.querySelector("#calendarDayDetailTitle");
const calendarDayDetailMeta = document.querySelector("#calendarDayDetailMeta");
const calendarDayDetailList = document.querySelector("#calendarDayDetailList");
const calendarDayDetailClose = document.querySelector("#calendarDayDetailClose");
const weeklyPlanList = document.querySelector("#weeklyPlanList");
const dailyCoachImage = document.querySelector("#dailyCoachImage");
const dailyCoachKicker = document.querySelector("#dailyCoachKicker");
const dailyCoachTitle = document.querySelector("#dailyCoachTitle");
const dailyCoachMessage = document.querySelector("#dailyCoachMessage");
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

function readTrialAccess() {
  try {
    return JSON.parse(localStorage.getItem(TRIAL_ACCESS_KEY) || "null");
  } catch (error) {
    return null;
  }
}

const FUNNEL_ENDPOINT = "/api/funnel";
const sentFunnelEvents = new Set();

// 수집 실패가 사용자 흐름을 막지 않도록 fire-and-forget으로만 보낸다
function sendFunnelEvent(step) {
  if (sentFunnelEvents.has(step)) return;
  sentFunnelEvents.add(step);
  try {
    const body = JSON.stringify({ step });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(FUNNEL_ENDPOINT, new Blob([body], { type: "application/json" }));
    } else {
      fetch(FUNNEL_ENDPOINT, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body }).catch(() => {});
    }
  } catch (error) {
    /* 수집 실패는 무시 */
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
  const currentAccess = readTrialAccess();
  if (currentAccess?.plan === "pro" || Number(currentAccess?.expiresAt || 0) > Date.now()) return currentAccess;
  const startedAt = Date.now();
  saveTrialLead();
  const access = { startedAt, expiresAt: startedAt + TRIAL_DURATION_MS, plan: "trial" };
  try {
    localStorage.setItem(TRIAL_ACCESS_KEY, JSON.stringify(access));
  } catch (error) {
    console.warn("Unable to save trial access", error);
  }
  sendFunnelEvent("trial_start");
  return access;
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
  if (access?.plan === "pro") {
    if (trialStatusBanner) trialStatusBanner.hidden = true;
    initializePersonalityNudge();
    return;
  }
  if (!access?.expiresAt) {
    lockTrialExperience("not-started");
    return;
  }
  if (Date.now() >= Number(access.expiresAt)) {
    lockTrialExperience("expired");
    return;
  }
  updateTrialStatus(Number(access.expiresAt));
  initializeTrialReminderCard(access);
  initializePersonalityNudge();
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

const trialReminderCard = document.querySelector("#trialReminderCard");
const trialReminderSave = document.querySelector("#trialReminderSave");
const trialReminderDismiss = document.querySelector("#trialReminderDismiss");
const TRIAL_REMINDER_DISMISSED_KEY = "omwTrialReminderDismissed";

function readTrialLead() {
  try {
    return JSON.parse(localStorage.getItem(TRIAL_LEAD_KEY) || "null");
  } catch (error) {
    return null;
  }
}

function initializeTrialReminderCard(access) {
  if (!trialReminderCard) return;
  const dismissed = localStorage.getItem(TRIAL_REMINDER_DISMISSED_KEY) === "true";
  if (access?.plan !== "trial" || dismissed || readTrialLead()?.serviceConsent) return;
  trialReminderCard.hidden = false;
}

trialReminderSave?.addEventListener("click", () => {
  if (!trialPhoneInput?.reportValidity()) return;
  if (!trialServiceConsent?.reportValidity()) return;
  saveTrialLead();
  if (trialReminderCard) trialReminderCard.hidden = true;
  showToast("좋아요! 체험이 끝나기 전에 알려드릴게요.");
});

trialReminderDismiss?.addEventListener("click", () => {
  try {
    localStorage.setItem(TRIAL_REMINDER_DISMISSED_KEY, "true");
  } catch (error) {
    /* storage unavailable — ignore */
  }
  if (trialReminderCard) trialReminderCard.hidden = true;
});

// ===== 성향 프로필: 앱 안에서 언제든 입력·수정 =====
const PERSONALITY_PROFILE_KEY = "omwPersonalityProfile";
const PERSONALITY_NUDGE_DISMISSED_KEY = "omwPersonalityNudgeDismissed";
const personalitySheet = document.querySelector("#personalitySheet");
const closePersonalitySheetButton = document.querySelector("#closePersonalitySheet");
const savePersonalityButton = document.querySelector("#savePersonalityButton");
const profileBirthDateInput = document.querySelector("#profileBirthDate");
const profileBirthTimeInput = document.querySelector("#profileBirthTime");
const profileBirthPlaceInput = document.querySelector("#profileBirthPlace");
const profileMbtiInput = document.querySelector("#profileMbti");
const drawerPersonalityButton = document.querySelector("#drawerPersonality");
const personalityNudgeCard = document.querySelector("#personalityNudgeCard");
const personalityNudgeOpenButton = document.querySelector("#personalityNudgeOpen");
const personalityNudgeDismissButton = document.querySelector("#personalityNudgeDismiss");

function readPersonalityProfile() {
  try {
    return JSON.parse(localStorage.getItem(PERSONALITY_PROFILE_KEY) || "null");
  } catch (error) {
    return null;
  }
}

function hasPersonalityInfo() {
  const profile = readPersonalityProfile();
  if (profile && (profile.birthDate || profile.mbti)) return true;
  const plan = readExecutionPlan();
  return Boolean(plan.mbti || plan.manseSummary);
}

function openPersonalitySheet() {
  if (!personalitySheet) return;
  const profile = readPersonalityProfile() || {};
  const plan = readExecutionPlan();
  if (profileBirthDateInput) profileBirthDateInput.value = profile.birthDate || "";
  if (profileBirthTimeInput) profileBirthTimeInput.value = profile.birthTime || "";
  if (profileBirthPlaceInput) profileBirthPlaceInput.value = profile.birthPlace || "";
  if (profileMbtiInput) profileMbtiInput.value = profile.mbti || plan.mbti || "";
  setDrawerOpen(false);
  setSheetOpen(personalitySheet, accountSheetOverlay, true);
}

function savePersonalityProfileFromSheet() {
  const profile = {
    birthDate: profileBirthDateInput?.value || "",
    birthTime: profileBirthTimeInput?.value || "",
    birthPlace: profileBirthPlaceInput?.value.trim() || "",
    mbti: profileMbtiInput?.value || "",
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(PERSONALITY_PROFILE_KEY, JSON.stringify(profile));
    // 기존 계획은 유지하면서 이후 AI 조정·코칭에 쓰이는 성향 값만 갱신한다
    const plan = readExecutionPlan();
    if (plan.goal) {
      const manse = calculateSimpleManse(profile.birthDate || "1995-01-01", profile.birthTime || "12:00");
      plan.mbti = profile.mbti;
      plan.mbtiSummary = profile.mbti ? analyzeMbti(profile.mbti) : "성향 정보 없이 목표와 실행 스타일을 기준으로 계획합니다.";
      plan.manseSummary = profile.birthDate ? manse.summary : "";
      plan.style = decidePlanningStyle(manse, profile.mbti || "");
      localStorage.setItem("omwExecutionPlan", JSON.stringify(plan));
    }
  } catch (error) {
    console.warn("Unable to save personality profile", error);
  }
  if (personalityNudgeCard) personalityNudgeCard.hidden = true;
  setSheetOpen(personalitySheet, accountSheetOverlay, false);
  showToast("성향을 저장했어요 · 다음 계획 조정부터 반영돼요");
}

function initializePersonalityNudge() {
  if (!personalityNudgeCard) return;
  if (localStorage.getItem(PERSONALITY_NUDGE_DISMISSED_KEY) === "true") return;
  if (hasPersonalityInfo() || !readExecutionPlan().goal) return;
  personalityNudgeCard.hidden = false;
}

drawerPersonalityButton?.addEventListener("click", openPersonalitySheet);
closePersonalitySheetButton?.addEventListener("click", () => setSheetOpen(personalitySheet, accountSheetOverlay, false));
savePersonalityButton?.addEventListener("click", savePersonalityProfileFromSheet);
personalityNudgeOpenButton?.addEventListener("click", openPersonalitySheet);
personalityNudgeDismissButton?.addEventListener("click", () => {
  try {
    localStorage.setItem(PERSONALITY_NUDGE_DISMISSED_KEY, "true");
  } catch (error) {
    /* storage unavailable — ignore */
  }
  personalityNudgeCard.hidden = true;
});

// 홈 빌더의 성향 입력을 저장된 프로필로 미리 채운다 (다시 방문했을 때)
(() => {
  const profile = readPersonalityProfile();
  if (!profile) return;
  if (birthDateInput && !birthDateInput.value && profile.birthDate) birthDateInput.value = profile.birthDate;
  if (birthTimeInput && !birthTimeInput.value && profile.birthTime) birthTimeInput.value = profile.birthTime;
  if (birthPlaceInput && !birthPlaceInput.value && profile.birthPlace) birthPlaceInput.value = profile.birthPlace;
  if (mbtiInput && !mbtiInput.value && profile.mbti) mbtiInput.value = profile.mbti;
})();

// ===== 회원 · 인증 =====
const authUiState = { user: null, loaded: false };
const menuToggle = document.querySelector("#menuToggle");
const appMenuDrawer = document.querySelector("#appMenuDrawer");
const appMenuBackdrop = document.querySelector("#appMenuBackdrop");
const drawerGuest = document.querySelector("#drawerGuest");
const drawerMember = document.querySelector("#drawerMember");
const drawerAvatar = document.querySelector("#drawerAvatar");
const drawerName = document.querySelector("#drawerName");
const drawerPlanBadge = document.querySelector("#drawerPlanBadge");
const drawerLoginButton = document.querySelector("#drawerLoginButton");
const drawerMyPage = document.querySelector("#drawerMyPage");
const drawerUpgrade = document.querySelector("#drawerUpgrade");
const drawerAdminLink = document.querySelector("#drawerAdminLink");
const drawerLogout = document.querySelector("#drawerLogout");
const authSheet = document.querySelector("#authSheet");
const authSheetTitle = document.querySelector("#authSheetTitle");
const authSheetCopy = document.querySelector("#authSheetCopy");
const authProviderList = document.querySelector("#authProviderList");
const adminPasswordForm = document.querySelector("#adminPasswordForm");
const adminAccessPassword = document.querySelector("#adminAccessPassword");
const adminPasswordError = document.querySelector("#adminPasswordError");
const adminPasswordChangeForm = document.querySelector("#adminPasswordChangeForm");
const currentAdminPassword = document.querySelector("#currentAdminPassword");
const newAdminPassword = document.querySelector("#newAdminPassword");
const confirmAdminPassword = document.querySelector("#confirmAdminPassword");
const adminPasswordChangeMessage = document.querySelector("#adminPasswordChangeMessage");
const accountSheetOverlay = document.querySelector("#accountSheetOverlay");
const closeAuthSheetButton = document.querySelector("#closeAuthSheet");
const authProviderButtons = document.querySelectorAll("[data-auth-provider]");
const myPageSheet = document.querySelector("#myPageSheet");
const closeMyPageSheetButton = document.querySelector("#closeMyPageSheet");
const myPageAvatar = document.querySelector("#myPageAvatar");
const myPageName = document.querySelector("#myPageName");
const myPageEmail = document.querySelector("#myPageEmail");
const myPageProvider = document.querySelector("#myPageProvider");
const myPagePlanTitle = document.querySelector("#myPagePlanTitle");
const myPagePlanMeta = document.querySelector("#myPagePlanMeta");
const myPageSubscribeButton = document.querySelector("#myPageSubscribe");
const myPageCancelProButton = document.querySelector("#myPageCancelPro");
const myPageLogoutButton = document.querySelector("#myPageLogout");
const navLoginLink = document.querySelector("#navLoginLink");

const AUTH_PROVIDER_LABELS = { kakao: "카카오 계정", naver: "네이버 계정", google: "구글 계정", password: "운영자 계정" };

async function accountRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했어요.");
  return data;
}

function syncServerPlanToLocal() {
  const user = authUiState.user;
  if (!user) return;

  try {
    if (user.plan === "pro" || user.goalPlanGeneratedAt) localStorage.setItem(FREE_PLAN_GENERATED_KEY, "true");
    else localStorage.removeItem(FREE_PLAN_GENERATED_KEY);
  } catch (error) {
    console.warn("Unable to sync goal plan allowance", error);
  }

  if (!document.body.classList.contains("execution-page")) return;

  if (user.plan === "pro") {
    try {
      localStorage.setItem(
        TRIAL_ACCESS_KEY,
        JSON.stringify({ startedAt: user.proSince || Date.now(), expiresAt: Date.now() + 3650 * 24 * 60 * 60 * 1000, plan: "pro" }),
      );
    } catch (error) {
      console.warn("Unable to sync PRO plan", error);
    }
    return;
  }

  const local = readTrialAccess();
  if (user.trialExpiresAt && (!local || local.plan === "pro" || Number(user.trialExpiresAt) > Number(local.expiresAt || 0))) {
    try {
      localStorage.setItem(
        TRIAL_ACCESS_KEY,
        JSON.stringify({ startedAt: user.trialStartedAt || Date.now(), expiresAt: Number(user.trialExpiresAt), plan: "trial" }),
      );
    } catch (error) {
      console.warn("Unable to sync trial plan", error);
    }
  }
}

function accountInitial(user) {
  return String(user?.name || "🙂").trim().slice(0, 1) || "🙂";
}

function formatAccountDate(value) {
  if (!value) return "-";
  return new Date(Number(value)).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

function renderMyPageSheet() {
  const user = authUiState.user;
  if (!myPageSheet || !user) return;

  if (myPageAvatar) myPageAvatar.textContent = accountInitial(user);
  if (myPageName) myPageName.textContent = user.name;
  if (myPageEmail) myPageEmail.textContent = user.email || "이메일 미등록";
  if (myPageProvider) myPageProvider.textContent = AUTH_PROVIDER_LABELS[user.provider] || "소셜 계정";

  const isPro = user.plan === "pro";
  if (myPagePlanTitle) myPagePlanTitle.textContent = isPro ? "PRO 구독 중" : "1일 무료 체험";
  if (myPagePlanMeta) {
    if (isPro) {
      myPagePlanMeta.textContent = `${formatAccountDate(user.proSince)}부터 이용 중 · 월 2,900원`;
    } else {
      const remaining = Math.max(0, Number(user.trialExpiresAt || 0) - Date.now());
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      myPagePlanMeta.textContent = remaining > 0 ? `체험 종료까지 ${hours}시간 ${minutes}분` : "체험이 종료되었어요. PRO로 이어가 보세요.";
    }
  }
  if (myPageSubscribeButton) myPageSubscribeButton.hidden = isPro;
  if (myPageCancelProButton) myPageCancelProButton.hidden = !isPro;
}

function renderAccountUi() {
  const user = authUiState.user;

  if (drawerGuest) drawerGuest.hidden = Boolean(user);
  if (drawerMember) drawerMember.hidden = !user;
  if (user) {
    if (drawerAvatar) drawerAvatar.textContent = accountInitial(user);
    if (drawerName) drawerName.textContent = user.name;
    if (drawerPlanBadge) {
      drawerPlanBadge.textContent = user.plan === "pro" ? "PRO 이용 중" : "무료 체험 중";
      drawerPlanBadge.classList.toggle("pro", user.plan === "pro");
    }
  }
  if (drawerMyPage) drawerMyPage.hidden = !user;
  if (drawerLogout) drawerLogout.hidden = !user;
  if (drawerUpgrade) drawerUpgrade.hidden = !user || user.plan === "pro";
  if (drawerAdminLink) drawerAdminLink.hidden = user?.role !== "admin";

  if (navLoginLink) {
    if (user) {
      navLoginLink.textContent = `${user.name}님`;
      navLoginLink.href = "app.html?auth=my";
    } else {
      navLoginLink.textContent = "로그인";
      navLoginLink.href = "app.html?auth=login";
    }
  }

  renderMyPageSheet();
}

function setDrawerOpen(open) {
  if (!appMenuDrawer || !menuToggle) return;
  appMenuDrawer.hidden = !open;
  if (appMenuBackdrop) appMenuBackdrop.hidden = !open;
  menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
  menuToggle.classList.toggle("open", open);
}

function openAuthSheet() {
  setDrawerOpen(false);
  setSheetOpen(authSheet, accountSheetOverlay, true);
}

function openMyPageSheet() {
  setDrawerOpen(false);
  renderMyPageSheet();
  setSheetOpen(myPageSheet, accountSheetOverlay, true);
}

function authRedirectTarget() {
  const params = new URLSearchParams(location.search);
  if (params.get("redirect") === "admin") return "/admin.html";
  return location.pathname || "/app.html";
}

async function startSubscription() {
  if (!authUiState.user) {
    openAuthSheet();
    return;
  }
  try {
    const config = await accountRequest("/api/billing/config");
    if (config.configured) {
      if (typeof window.TossPayments !== "function") throw new Error("결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      const tossPayments = window.TossPayments(config.clientKey);
      const payment = tossPayments.payment({ customerKey: config.customerKey });
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: `${location.origin}/app.html?billing=success`,
        failUrl: `${location.origin}/app.html?billing=fail`,
        customerEmail: authUiState.user.email || undefined,
        customerName: authUiState.user.name || undefined,
      });
      return;
    }
    if (!config.demo) throw new Error("자동결제 계약과 결제 키 설정이 아직 필요합니다.");
    const confirmed = window.confirm("로컬 개발용 데모 결제로 PRO를 시작할까요? 실제 결제는 발생하지 않습니다.");
    if (!confirmed) return;
    const data = await accountRequest("/api/billing/subscribe", { method: "POST", body: "{}" });
    authUiState.user = data.user;
    syncServerPlanToLocal();
    showToast("개발용 PRO 구독이 시작되었어요.");
    window.setTimeout(() => location.reload(), 700);
  } catch (error) {
    showToast(error.message);
  }
}

function configureAdminLoginMode(enabled) {
  if (adminPasswordForm) adminPasswordForm.hidden = !enabled;
  if (authProviderList) authProviderList.hidden = enabled;
  if (enabled) {
    if (authSheetTitle) authSheetTitle.textContent = "관리자 페이지에 로그인하세요";
    if (authSheetCopy) authSheetCopy.textContent = "관리자 인증 후 회원과 구독 현황을 안전하게 확인할 수 있어요.";
  }
}

async function cancelProSubscription() {
  const confirmed = window.confirm("PRO 구독을 해지할까요? 이미 결제한 이용 기간이 끝날 때까지 PRO를 이용할 수 있어요.");
  if (!confirmed) return;
  try {
    const data = await accountRequest("/api/billing/cancel", { method: "POST", body: "{}" });
    authUiState.user = data.user;
    syncServerPlanToLocal();
    showToast(data.user.plan === "pro" ? "해지 예약이 완료됐어요. 현재 이용 기간까지 PRO가 유지됩니다." : "구독이 해지되었어요.");
    window.setTimeout(() => location.reload(), 900);
  } catch (error) {
    showToast(error.message);
  }
}

async function logoutAccount() {
  try {
    await accountRequest("/api/auth/logout", { method: "POST", body: "{}" });
  } catch {}
  if (authUiState.user?.plan === "pro") {
    try {
      localStorage.removeItem(TRIAL_ACCESS_KEY);
    } catch {}
  }
  location.href = location.pathname;
}

function handleAuthQueryParams() {
  const params = new URLSearchParams(location.search);
  const authParam = params.get("auth");
  const redirectToAdmin = params.get("redirect") === "admin";
  const adminDenied = params.get("admin") === "denied";

  if (authParam === "success") showToast("로그인되었어요 · 올리가 기억할게요!");
  if (authParam === "error") showToast("로그인에 실패했어요. 다시 시도해 주세요.");
  if (adminDenied) showToast("관리자 권한이 있는 계정만 접근할 수 있어요.");
  if (redirectToAdmin && authUiState.user?.role === "admin") {
    location.replace("/admin.html");
    return;
  }
  configureAdminLoginMode(redirectToAdmin && !authUiState.user);
  if ((authParam === "login" || redirectToAdmin) && !authUiState.user) openAuthSheet();
  if (authParam === "my" || (authParam === "login" && authUiState.user)) {
    if (authUiState.user) openMyPageSheet();
  }

  if (authParam) params.delete("auth");
  if (adminDenied) params.delete("admin");
  const query = params.toString();
  window.history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}`);
}

async function handleBillingQueryParams() {
  const params = new URLSearchParams(location.search);
  const billing = params.get("billing");
  if (!billing) return;
  try {
    if (billing === "success") {
      const data = await accountRequest("/api/billing/activate", {
        method: "POST",
        body: JSON.stringify({ authKey: params.get("authKey"), customerKey: params.get("customerKey") }),
      });
      authUiState.user = data.user;
      syncServerPlanToLocal();
      renderAccountUi();
      showToast(data.alreadyActive ? "이미 PRO 구독을 이용 중이에요." : "PRO 월정액이 시작되었어요!");
    } else {
      showToast(params.get("message") || "결제가 취소되었어요. 다시 시도할 수 있어요.");
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    ["billing", "authKey", "customerKey", "code", "message"].forEach((key) => params.delete(key));
    const query = params.toString();
    window.history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}`);
  }
}

async function initAccountExperience() {
  const initialParams = new URLSearchParams(location.search);
  const accountOnlyRoute =
    initialParams.get("redirect") === "admin" ||
    initialParams.get("admin") === "denied" ||
    ["login", "my"].includes(initialParams.get("auth"));
  try {
    const data = await accountRequest("/api/auth/me");
    authUiState.user = data.user || null;
  } catch {
    authUiState.user = null;
  }
  authUiState.loaded = true;

  syncServerPlanToLocal();
  renderAccountUi();
  initializeAdminGate();
  await handleBillingQueryParams();
  handleAuthQueryParams();
  if (!accountOnlyRoute) initializeTrialAccess();
}

menuToggle?.addEventListener("click", () => setDrawerOpen(appMenuDrawer?.hidden !== false));
appMenuBackdrop?.addEventListener("click", () => setDrawerOpen(false));
drawerLoginButton?.addEventListener("click", openAuthSheet);
drawerMyPage?.addEventListener("click", openMyPageSheet);
drawerUpgrade?.addEventListener("click", startSubscription);
drawerLogout?.addEventListener("click", logoutAccount);
closeAuthSheetButton?.addEventListener("click", () => setSheetOpen(authSheet, accountSheetOverlay, false));
closeMyPageSheetButton?.addEventListener("click", () => setSheetOpen(myPageSheet, accountSheetOverlay, false));
accountSheetOverlay?.addEventListener("click", () => {
  const openSheetElement = [authSheet, myPageSheet, personalitySheet].find((sheet) => sheet && sheet.hidden === false);
  if (openSheetElement) setSheetOpen(openSheetElement, accountSheetOverlay, false);
});
myPageSubscribeButton?.addEventListener("click", startSubscription);
myPageCancelProButton?.addEventListener("click", cancelProSubscription);
myPageLogoutButton?.addEventListener("click", logoutAccount);

authProviderButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const provider = button.dataset.authProvider;
    location.href = `/api/auth/start?provider=${provider}&redirect=${encodeURIComponent(authRedirectTarget())}`;
  });
});

initAccountExperience();

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
  if (energyChargeBalance) energyChargeBalance.textContent = `${remaining} / ${allocation}`;
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

function refundOllieEnergy(amount) {
  const state = readOllieEnergyState();
  const refund = Math.max(0, Number(amount) || 0);
  state.remaining = Math.min(Number(state.allocation) || 0, Number(state.remaining || 0) + refund);
  saveOllieEnergyState(state);
  renderOllieEnergy();
}

function chargeOllieEnergy(amount) {
  const state = readOllieEnergyState();
  const charge = Math.max(0, Number(amount) || 0);
  state.remaining = Number(state.remaining || 0) + charge;
  if (state.remaining > Number(state.allocation || 0)) state.allocation = state.remaining;
  saveOllieEnergyState(state);
  renderOllieEnergy();
  if (ollieEnergyMeter) {
    ollieEnergyMeter.classList.remove("is-charged");
    void ollieEnergyMeter.offsetWidth;
    ollieEnergyMeter.classList.add("is-charged");
    window.setTimeout(() => ollieEnergyMeter.classList.remove("is-charged"), 1200);
  }
  announce(`올리 에너지 ${charge}를 충전했습니다. ${state.remaining} 남았습니다.`);
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
const bondLevelName = document.querySelector("#bondLevelName");
const bondXpText = document.querySelector("#bondXpText");
const bondXpBar = document.querySelector("#bondXpBar");
const bondNextUnlock = document.querySelector("#bondNextUnlock");
const bondUnlockDescription = document.querySelector("#bondUnlockDescription");
const bondReaction = document.querySelector("#bondReaction");
const touchCompanionHint = document.querySelector("#touchCompanionHint");
const journeyBadge = document.querySelector("#journeyBadge");
const journeyMap = document.querySelector("#journeyMap");
const journeyPlaceTitle = document.querySelector("#journeyPlaceTitle");
const journeyPlaceStory = document.querySelector("#journeyPlaceStory");
const journeyNextText = document.querySelector("#journeyNextText");
const journeyNextBar = document.querySelector("#journeyNextBar");
const memoryList = document.querySelector("#memoryList");
const patternList = document.querySelector("#patternList");
const memoryForm = document.querySelector("#memoryForm");
const memoryCompletion = document.querySelector("#memoryCompletion");
const memoryConversation = document.querySelector("#memoryConversation");
const memoryMoodButtons = document.querySelectorAll("[data-memory-mood]");
const memoryMoodEcho = document.querySelector("#memoryMoodEcho");
const memoryCustomMood = document.querySelector("#memoryCustomMood");
const memoryTitle = document.querySelector("#memoryTitle");
const memoryNote = document.querySelector("#memoryNote");
const memoryObstacle = document.querySelector("#memoryObstacle");
const memoryNextStep = document.querySelector("#memoryNextStep");
const memorySaveHint = document.querySelector("#memorySaveHint");
const memorySaveButton = document.querySelector("#memorySaveButton");
const memoryCount = document.querySelector("#memoryCount");
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
const focusModeKicker = document.querySelector("#focusModeKicker");
const focusCriteria = document.querySelector("#focusCriteria");
const focusMinutesInput = document.querySelector("#focusMinutesInput");
const decreaseFocusTime = document.querySelector("#decreaseFocusTime");
const increaseFocusTime = document.querySelector("#increaseFocusTime");
const focusTimerStartButton = document.querySelector("#focusTimerStartButton");
const focusTimerPauseButton = document.querySelector("#focusTimerPauseButton");
const focusTimeupMessage = document.querySelector("#focusTimeupMessage");
const finishFocusButton = document.querySelector("#finishFocusButton");
const ollieStarShower = document.querySelector("#ollieStarShower");
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

const wizardStepLabels = ["목표 설정 중", "실행 리듬 설정 중", "성향 설정 중"];

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

  if (wizardLiveGoal) wizardLiveGoal.textContent = goal;
  if (wizardLiveTiming) wizardLiveTiming.textContent = `${selectedPeriod} · ${time}`;
}

function getInvalidDiagnosisField() {
  const fieldsByStep = [
    [designGoal],
    [goalPeriodInput, routineTimeInput, routineReadinessInput],
    [birthDateInput, birthTimeInput, birthPlaceInput, mbtiInput],
  ];
  return (fieldsByStep[diagnosisStepIndex] || []).find((field) => field && !field.checkValidity()) || null;
}

function canLeaveDiagnosisStep() {
  const invalidField = getInvalidDiagnosisField();
  if (!invalidField) return true;
  invalidField.focus();
  invalidField.reportValidity();
  return false;
}

function renderDiagnosisStep() {
  if (!diagnosisSteps.length) return;
  sendFunnelEvent(`step${diagnosisStepIndex + 1}_enter`);

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
  if (diagnosisNextButton) diagnosisNextButton.textContent = "다음 단계";
  if (aiPreviewButton) aiPreviewButton.hidden = diagnosisStepIndex !== diagnosisSteps.length - 1;
  updateWizardSummary();
}

function revealActiveDiagnosisStep() {
  if (!personalityForm || !diagnosisSteps.length) return;
  const activeStep = diagnosisSteps[diagnosisStepIndex];
  const firstField = activeStep?.querySelector("input:not([type='checkbox']), select, textarea");
  const headerHeight = document.querySelector(".home-page .site-header")?.getBoundingClientRect().height || 0;
  const top = Math.max(0, window.scrollY + personalityForm.getBoundingClientRect().top - headerHeight - 14);
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  window.requestAnimationFrame(() => {
    window.scrollTo({ top, behavior: reducedMotion ? "auto" : "smooth" });
    window.setTimeout(() => firstField?.focus({ preventScroll: true }), reducedMotion ? 0 : 260);
  });
}

let diagnosisAutoAdvanceTimer = 0;

function cancelDiagnosisAutoAdvance() {
  if (!diagnosisAutoAdvanceTimer) return;
  window.clearTimeout(diagnosisAutoAdvanceTimer);
  diagnosisAutoAdvanceTimer = 0;
}

function advanceDiagnosisStep({ auto = false } = {}) {
  cancelDiagnosisAutoAdvance();
  if (diagnosisStepIndex >= diagnosisSteps.length - 1) return;
  if (auto ? getInvalidDiagnosisField() : !canLeaveDiagnosisStep()) return;
  diagnosisStepIndex += 1;
  renderDiagnosisStep();
  revealActiveDiagnosisStep();
}

// 입력이 끝나면 잠시 뒤 자동으로 다음 단계로 넘어간다 (추가 입력 시 타이머 리셋)
function queueDiagnosisAutoAdvance(delay = 1100) {
  cancelDiagnosisAutoAdvance();
  if (diagnosisStepIndex >= diagnosisSteps.length - 1) return;
  diagnosisAutoAdvanceTimer = window.setTimeout(() => advanceDiagnosisStep({ auto: true }), delay);
}

diagnosisBackButton?.addEventListener("click", () => {
  cancelDiagnosisAutoAdvance();
  diagnosisStepIndex = Math.max(0, diagnosisStepIndex - 1);
  renderDiagnosisStep();
  revealActiveDiagnosisStep();
});

diagnosisNextButton?.addEventListener("click", () => advanceDiagnosisStep());

// 단계별 선택형 입력: 전부 직접 확인해야 자동 진행 (하나만 고르고 넘어가지 않도록)
const stepChoiceFieldIds = [[], ["goalPeriod", "routineTime", "routineReadiness"], []];
const touchedChoiceFields = new Set();

personalityForm?.addEventListener("change", (event) => {
  const step = event.target.closest?.(".diagnosis-step");
  if (!step || !step.classList.contains("active")) return;
  if (!event.target.matches("select, input[type='date'], input[type='time']")) return;
  touchedChoiceFields.add(event.target.id);
  const requiredIds = stepChoiceFieldIds[diagnosisStepIndex] || [];
  if (requiredIds.length && requiredIds.every((id) => touchedChoiceFields.has(id))) queueDiagnosisAutoAdvance();
});

personalityForm?.addEventListener("focusin", (event) => {
  // 다른 입력을 만지기 시작하면 예약된 자동 진행을 취소한다 (change가 다시 예약)
  if (event.target.matches("input, select, textarea")) cancelDiagnosisAutoAdvance();
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
    } else if (diagnosisStepIndex === 0) {
      // 빌더 안에서 목표 칩을 고르면 곧바로 다음 단계로
      queueDiagnosisAutoAdvance(600);
    }
  });
});

customGoalButton?.addEventListener("click", () => {
  if (!designGoal) return;
  cancelDiagnosisAutoAdvance();
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
  const personalityBits = [];
  if (payload.input.birth?.date) personalityBits.push(`${manseoryeok.dayMaster.trait} 성향`);
  if (mbti) personalityBits.push(`${mbti}의 유지 방식`);
  const personalitySummary = personalityBits.length
    ? `${personalityBits.join("과 ")}을 함께 보면, 처음부터 큰 계획을 밀어붙이기보다 오늘 실행할 단위를 선명하게 두는 편이 좋습니다.`
    : "성향 정보는 건너뛰었어요. 목표와 기간을 기준으로, 처음부터 큰 계획보다 오늘 실행할 단위를 선명하게 두는 계획으로 시작합니다.";

  const firstAction = lowFriction ? `${routineTime} 10분 루틴: ${template.firstAction}` : `${routineTime} 루틴: ${template.firstAction}`;
  const firstDuration = lowFriction ? 10 : 20;
  // 단계 구간을 기간에 비례해 계산 (7일 같은 짧은 목표에서도 구간이 겹치지 않게)
  const phaseStartEnd = Math.min(7, Math.max(2, Math.round(period * 0.2)));
  const phaseGrowEnd = Math.min(period - 1, Math.max(phaseStartEnd + 1, Math.round(period * 0.7)));
  const weekPlan = [
    routineAdvice,
    ...template.weekPlan,
    "놓친 날에는 분량을 보충하지 않고 5분 최소 행동으로 바로 다시 시작합니다.",
    "7일째에는 완료 횟수와 어려웠던 구간을 확인해 다음 주 분량을 조정합니다.",
  ].slice(0, 7);

  return {
    personalitySummary,
    planningStyle: `${recommendedPlanningStyle} 계획`,
    firstAction,
    weekTitle: template.weekTitle,
    weekPlan,
    coachMessage: `${currentState || "현재 상태"}를 기준으로 보면, 이번 주는 완성보다 흐름을 만드는 것이 우선입니다. ${routineAdvice}`,
    dashboard: {
      goal: goal.replace("하기", ""),
      progress,
      pace: template.pace,
    },
    todaySchedule: [
      { time: `${routineTime} · ${existingRoutine} 직후`, durationMinutes: firstDuration, task: firstAction, completionRule: "타이머를 켜고 정한 분량까지만 끝내면 완료" },
      { time: "실행 직후", durationMinutes: 5, task: "오늘 실행 여부와 어려웠던 점 한 줄 기록", completionRule: "완료 체크와 한 줄 기록을 남기면 완료" },
      { time: "하루 마무리", durationMinutes: 5, task: "내일 시작할 첫 행동을 눈에 보이게 준비", completionRule: "도구나 자료를 미리 꺼내두면 완료" },
    ],
    fullSchedule: [
      { phase: "시작", days: `1–${phaseStartEnd}일`, focus: "실행 시간과 최소 행동을 고정합니다.", successMetric: `${phaseStartEnd}일 중 ${Math.max(1, Math.round(phaseStartEnd * 0.6))}일 이상 실행` },
      { phase: "성장", days: `${phaseStartEnd + 1}–${phaseGrowEnd}일`, focus: "주간 결과를 확인하며 분량과 난이도를 조금씩 높입니다.", successMetric: "주간 계획의 70% 이상 완료" },
      { phase: "완성", days: `${phaseGrowEnd + 1}–${period}일`, focus: "실전 점검과 약한 구간 보완에 집중합니다.", successMetric: "목표 지표 최종 점검 완료" },
    ],
    checkInRules: ["실행 직후 완료 여부 체크", "못한 날은 5분 최소 행동으로 재시작", "7일마다 다음 주 난이도 조정"],
    fallbackPlan: `계획대로 하기 어려운 날에는 ${template.firstAction}을 5분만 실행합니다.`,
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
      const error = new Error(result.error || "AI 계획을 만드는 중 문제가 생겼어요.");
      error.status = response.status;
      error.code = result.code || "";
      throw error;
    }

    return result.plan || result;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("AI 응답 시간이 길어졌어요. 잠시 후 다시 시도해 주세요.");
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function requestCompanionReply(message) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 30000);

  try {
    const bundle = getPlanBundle();
    const companionState = getCompanionState();
    const response = await fetch("/api/ai/companion-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        context: {
          goal: bundle.plan?.goal || "",
          energy: companionState.energy || "",
          todayFocus: bundle.plan?.firstAction || "",
        },
      }),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(result.error || "올리가 답을 만들지 못했어요.");
    const reply = String(result.reply || "").trim();
    if (!reply) throw new Error("올리가 답을 만들지 못했어요.");
    return { reply, headline: String(result.headline || "").trim() };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("올리의 답이 늦어지고 있어요. 잠시 후 다시 말 걸어주세요.");
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
  const todayItems = Array.isArray(preview.todaySchedule) ? preview.todaySchedule : [];
  if (previewDuration) previewDuration.textContent = todayItems[0]?.durationMinutes ? `${todayItems[0].durationMinutes}분` : "15분";
  if (previewCompletionRule) previewCompletionRule.textContent = todayItems[0]?.completionRule || "작게 시작하고 완료 표시까지 남겨요.";
  if (aiTodaySchedule) {
    const items = todayItems.map((item) => {
      const row = document.createElement("li");
      const time = document.createElement("time");
      const copy = document.createElement("div");
      const task = document.createElement("strong");
      const rule = document.createElement("small");
      time.textContent = item.time || "오늘";
      task.textContent = item.task || "작은 행동 시작하기";
      rule.textContent = `${Number(item.durationMinutes) || 5}분 · ${item.completionRule || "완료 체크 남기기"}`;
      copy.append(task, rule);
      row.append(time, copy);
      return row;
    });
    aiTodaySchedule.replaceChildren(...items);
  }
  if (aiVisibleWeekPlan) {
    const items = (preview.weekPlan || []).map((item, index) => {
      const row = document.createElement("li");
      row.dataset.day = String(index + 1);
      row.textContent = item;
      return row;
    });
    aiVisibleWeekPlan.replaceChildren(...items);
  }
  if (aiGoalRoadmap) {
    const items = (preview.fullSchedule || []).map((item, index) => {
      const row = document.createElement("div");
      const badge = document.createElement("b");
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      const detail = document.createElement("small");
      badge.textContent = item.days || `${index + 1}단계`;
      title.textContent = `${item.phase || `${index + 1}단계`} · ${item.focus || "실행 흐름 만들기"}`;
      detail.textContent = item.successMetric || "완료 여부를 확인해요.";
      copy.append(title, detail);
      row.append(badge, copy);
      return row;
    });
    aiGoalRoadmap.replaceChildren(...items);
  }
  if (dashboardGoalPreview) dashboardGoalPreview.textContent = preview.dashboard.goal;
  if (dashboardProgressValue) dashboardProgressValue.textContent = `${preview.dashboard.progress}%`;
  if (dashboardProgressBar) dashboardProgressBar.style.width = `${preview.dashboard.progress}%`;
  if (dashboardPaceText) dashboardPaceText.textContent = preview.dashboard.pace;
}

async function runPersonalityAnalysis({ showLoading = false } = {}) {
  if (!personalityForm) return;

  if (showLoading && readTrialAccess()?.plan !== "pro") {
    try {
      const serverSaysGenerated = authUiState.user?.plan !== "pro" && Boolean(authUiState.user?.goalPlanGeneratedAt);
      const guestDeviceSaysGenerated = !authUiState.user && localStorage.getItem(FREE_PLAN_GENERATED_KEY) === "true";
      if (serverSaysGenerated || guestDeviceSaysGenerated) {
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
  const currentState = "";
  const routineReadiness = routineReadinessInput?.value || DEFAULT_ROUTINE_READINESS;
  const routineTime = routineTimeInput?.value || "아침";
  const currentRoutine = "";
  const birthDate = birthDateInput?.value || "";
  const birthTime = birthTimeInput?.value || "";
  const birthPlace = birthPlaceInput?.value.trim() || "";
  const mbti = mbtiInput?.value || "";
  const hasBirthInfo = Boolean(birthDate);
  const safeBirthDate = birthDate || "1995-01-01";
  const safeBirthTime = birthTime || "12:00";

  const rawManse = calculateSimpleManse(safeBirthDate, safeBirthTime);
  const manse = hasBirthInfo ? rawManse : { ...rawManse, summary: "" };
  const mbtiSummary = mbti ? analyzeMbti(mbti) : "성향 정보 없이 목표와 실행 스타일을 기준으로 계획합니다.";
  const style = decidePlanningStyle(rawManse, mbti);
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
  let usedFallback = false;
  try {
    preview = showLoading ? await requestAiPlan(payload) : buildLocalAiPreview(payload);
  } catch (error) {
    if (error.code === "GOAL_PLAN_LIMIT_REACHED") {
      if (aiPreviewStatus) aiPreviewStatus.textContent = "무료 목표 계획 1개를 이미 만들었어요";
      if (aiPreviewButton) {
        aiPreviewButton.disabled = false;
        aiPreviewButton.textContent = "AI 맞춤 계획 만들고 1일 체험 준비";
      }
      planPreviewPanel?.classList.add("is-ready");
      showToast(error.message);
      return;
    }
    console.error("Unable to generate AI goal plan", error);
    preview = buildLocalAiPreview(payload);
    usedFallback = true;
  }
  renderAiPreview(preview);
  if (showLoading) planPreviewPanel?.classList.add("is-ready");

  if (aiPreviewStatus) aiPreviewStatus.textContent = usedFallback ? "올리가 입력 내용을 바탕으로 준비한 계획" : "올리가 AI로 만든 맞춤 계획";
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

  if (showLoading) {
    saveTrialLead();
    startTrialAccess();
    if (birthDate || birthPlace || mbti) {
      try {
        localStorage.setItem(PERSONALITY_PROFILE_KEY, JSON.stringify({ birthDate, birthTime, birthPlace, mbti, updatedAt: new Date().toISOString() }));
      } catch (error) {
        /* storage unavailable — ignore */
      }
    }
  }
  if (showLoading && usedFallback) showToast("연결이 잠시 느려 입력 내용을 바탕으로 맞춤 계획을 완성했어요.");
  if (showLoading) {
    window.setTimeout(() => {
      planPreviewPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
      planPreviewPanel?.focus({ preventScroll: true });
    }, 80);
  }
  if (showLoading && readTrialAccess()?.plan !== "pro") {
    try {
      localStorage.setItem(FREE_PLAN_GENERATED_KEY, "true");
      if (authUiState.user) authUiState.user.goalPlanGeneratedAt = Date.now();
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
    revealActiveDiagnosisStep();
    return;
  }
  runPersonalityAnalysis({ showLoading: true });
});

[birthDateInput, birthTimeInput, birthPlaceInput, mbtiInput, goalPeriodInput, routineReadinessInput, routineTimeInput, designGoal].forEach(
  (field) => {
    field?.addEventListener("change", runPersonalityAnalysis);
    field?.addEventListener("input", updateWizardSummary);
  },
);

runPersonalityAnalysis();

const adminDashboard = document.querySelector("#adminDashboard");
const memberTableBody = document.querySelector("#memberTableBody");
const memberCount = document.querySelector("#memberCount");
const refreshMembers = document.querySelector("#refreshMembers");
const riskFilter = document.querySelector("#riskFilter");
const goalFilter = document.querySelector("#goalFilter");
const planFilter = document.querySelector("#planFilter");
const adminUserSearch = document.querySelector("#adminUserSearch");
const resetAdminFilters = document.querySelector("#resetAdminFilters");
const adminVisibleCount = document.querySelector("#adminVisibleCount");
const adminRows = document.querySelectorAll(".admin-table tbody tr[data-risk]");
const adminEmptyRow = document.querySelector("#users .admin-empty-row");

function escapeAccountText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function formatAdminDate(value) {
  return value ? new Date(Number(value)).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) : "-";
}

async function loadAdminMembers() {
  if (!memberTableBody) return;
  memberTableBody.innerHTML = '<tr class="admin-empty-row"><td colspan="7">회원 정보를 불러오는 중입니다.</td></tr>';
  try {
    const { users } = await accountRequest("/api/admin/users");
    if (memberCount) memberCount.textContent = `${users.length}명`;
    if (!users.length) {
      memberTableBody.innerHTML = '<tr class="admin-empty-row"><td colspan="7">아직 가입한 회원이 없습니다.</td></tr>';
      return;
    }
    memberTableBody.innerHTML = users
      .map((user) => {
        const trialEnded = user.plan !== "pro" && Number(user.trialExpiresAt || 0) <= Date.now();
        const planLabel = user.plan === "pro" ? "PRO" : trialEnded ? "체험 종료" : "체험 중";
        return `<tr data-member-id="${escapeAccountText(user.id)}">
          <td><strong>${escapeAccountText(user.name)}</strong><small>${escapeAccountText(user.email || user.id)}</small></td>
          <td>${escapeAccountText(AUTH_PROVIDER_LABELS[user.provider] || user.provider)}</td>
          <td><span class="plan-pill ${user.plan === "pro" ? "pro" : "trial"}">${planLabel}</span></td>
          <td>${formatAdminDate(user.createdAt)}</td><td>${formatAdminDate(user.lastLoginAt)}</td>
          <td>${user.role === "admin" ? "관리자" : "회원"}</td>
          <td><button type="button" data-member-action="plan" data-next-value="${user.plan === "pro" ? "trial" : "pro"}">${user.plan === "pro" ? "PRO 해제" : "PRO 전환"}</button>
          <button type="button" data-member-action="role" data-next-value="${user.role === "admin" ? "member" : "admin"}">${user.role === "admin" ? "관리자 해제" : "관리자 지정"}</button></td>
        </tr>`;
      })
      .join("");
  } catch (error) {
    memberTableBody.innerHTML = `<tr class="admin-empty-row"><td colspan="7">${escapeAccountText(error.message)}</td></tr>`;
  }
}

async function initializeAdminGate() {
  if (!adminDashboard) return;
  if (authUiState.user?.role !== "admin") {
    location.href = authUiState.user ? "/app.html?admin=denied" : "/app.html?auth=login&redirect=admin";
    return;
  }
  adminDashboard.classList.remove("locked");
  await loadAdminMembers();
}

refreshMembers?.addEventListener("click", loadAdminMembers);
memberTableBody?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-member-action]");
  const row = button?.closest("tr[data-member-id]");
  if (!button || !row) return;
  const action = button.dataset.memberAction;
  const label = action === "role" ? "권한" : "플랜";
  if (!window.confirm(`이 회원의 ${label}을 변경할까요?`)) return;
  button.disabled = true;
  try {
    await accountRequest("/api/admin/users/update", {
      method: "POST",
      body: JSON.stringify({ id: row.dataset.memberId, [action]: button.dataset.nextValue }),
    });
    await loadAdminMembers();
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
});

adminPasswordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (adminPasswordError) adminPasswordError.textContent = "";
  const submitButton = adminPasswordForm.querySelector("button[type='submit']");
  if (submitButton) submitButton.disabled = true;
  try {
    await accountRequest("/api/admin/login", { method: "POST", body: JSON.stringify({ password: adminAccessPassword?.value || "" }) });
    location.href = "/admin.html";
  } catch (error) {
    if (adminPasswordError) adminPasswordError.textContent = error.message;
    if (submitButton) submitButton.disabled = false;
  }
});

adminPasswordChangeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = adminPasswordChangeForm.querySelector("button[type='submit']");
  const nextPassword = newAdminPassword?.value || "";
  if (adminPasswordChangeMessage) adminPasswordChangeMessage.textContent = "";
  if (nextPassword !== (confirmAdminPassword?.value || "")) {
    if (adminPasswordChangeMessage) adminPasswordChangeMessage.textContent = "새 비밀번호 확인이 일치하지 않습니다.";
    return;
  }
  if (submitButton) submitButton.disabled = true;
  try {
    await accountRequest("/api/admin/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: currentAdminPassword?.value || "", newPassword: nextPassword }),
    });
    adminPasswordChangeForm.reset();
    if (adminPasswordChangeMessage) adminPasswordChangeMessage.textContent = "비밀번호를 변경했습니다. 이제 새 비밀번호로 로그인해 주세요.";
  } catch (error) {
    if (adminPasswordChangeMessage) adminPasswordChangeMessage.textContent = error.message;
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

function applyAdminTableFilters() {
  if (!adminRows.length) return;

  const risk = riskFilter?.value || "all";
  const goal = goalFilter?.value || "all";
  const plan = planFilter?.value || "all";
  const query = adminUserSearch?.value.trim().toLowerCase() || "";
  let visibleCount = 0;

  adminRows.forEach((row) => {
    const matchesRisk = risk === "all" || row.dataset.risk === risk;
    const matchesGoal = goal === "all" || row.dataset.goal === goal;
    const matchesPlan = plan === "all" || row.dataset.plan === plan;
    const matchesQuery = !query || String(row.dataset.user || "").toLowerCase().includes(query);
    const visible = matchesRisk && matchesGoal && matchesPlan && matchesQuery;
    row.hidden = !visible;
    if (visible) visibleCount += 1;
  });

  if (adminEmptyRow) {
    adminEmptyRow.hidden = visibleCount !== 0;
  }
  if (adminVisibleCount) adminVisibleCount.textContent = `${visibleCount}명`;
}

[riskFilter, goalFilter, planFilter].forEach((filter) => {
  filter?.addEventListener("change", applyAdminTableFilters);
});
adminUserSearch?.addEventListener("input", applyAdminTableFilters);
resetAdminFilters?.addEventListener("click", () => {
  if (riskFilter) riskFilter.value = "all";
  if (goalFilter) goalFilter.value = "all";
  if (planFilter) planFilter.value = "all";
  if (adminUserSearch) adminUserSearch.value = "";
  applyAdminTableFilters();
});

document.querySelectorAll(".admin-sidebar nav a").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".admin-sidebar nav a").forEach((item) => item.classList.toggle("active", item === link));
  });
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
    revisionDetails: state.revisionDetails && typeof state.revisionDetails === "object" ? state.revisionDetails : {},
    weeklySchedule: Array.isArray(state.weeklySchedule) ? state.weeklySchedule.slice(0, 7) : [],
    pendingPlanText: typeof state.pendingPlanText === "string" ? state.pendingPlanText : "",
    pendingRevisionRequest: typeof state.pendingRevisionRequest === "string" ? state.pendingRevisionRequest : "",
    pendingRevisionDetails: state.pendingRevisionDetails && typeof state.pendingRevisionDetails === "object" ? state.pendingRevisionDetails : {},
    pendingRevisionSummary: state.pendingRevisionSummary && typeof state.pendingRevisionSummary === "object" ? state.pendingRevisionSummary : {},
    pendingWeeklySchedule: Array.isArray(state.pendingWeeklySchedule) ? state.pendingWeeklySchedule.slice(0, 7) : [],
    status: state.status || "AI 제안",
    selectedDay: Math.max(1, Number(state.selectedDay) || 1),
    checkedByDay,
    difficultyByTask:
      state.difficultyByTask && typeof state.difficultyByTask === "object" && !Array.isArray(state.difficultyByTask)
        ? state.difficultyByTask
        : {},
    recoveryActions: Array.isArray(state.recoveryActions) ? state.recoveryActions.slice(-30) : [],
    completedLog: Array.isArray(state.completedLog) ? state.completedLog.slice(-80) : [],
    dailyMemories: Array.isArray(state.dailyMemories) ? state.dailyMemories.slice(-365) : [],
    lastCompletion: state.lastCompletion || null,
    planStartDate: state.planStartDate || "",
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

function getLocalDateKey(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? getTodayKey() : date.toLocaleDateString("en-CA");
}

function getDefaultPlanText(plan) {
  const preview = plan.aiPreview || {};
  const weekPlan = Array.isArray(preview.weekPlan) ? preview.weekPlan : [];
  const lines = [
    `기존 루틴(${plan.currentRoutine || "일상 루틴"})을 마친 뒤 목표 행동 시작하기`,
    plan.firstAction || preview.firstAction || "단어 40개 + LC 1세트",
    ...weekPlan,
    "하루 끝에는 완료 여부를 체크하고, 놓친 항목은 다음 날 작은 단위로 다시 배치합니다.",
  ];
  return lines.map((line) => `- ${line}`).join("\n");
}

function cleanScheduleTaskText(value) {
  let text = String(value || "").replace(/^[-*•\d.\s]+/, "").trim();
  if (!text || /^(수정 요청 반영|AI 재작성 기준)\s*:/.test(text)) return "";

  text = text
    .replace(/^(작게|가볍게|우선)\s*:\s*/g, "")
    .replace(/^\S+에\s+(.+)와 목표를 연결하기$/, "기존 루틴($1) 후 목표 행동 시작하기")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(수정 요청 반영|AI 재작성 기준)\s*:/.test(text)) return "";
  if (/요청사항을 우선 적용|부담이 큰 일정은|더 작은 단위로 나눕니다/.test(text)) return "";
  return text;
}

function parsePlanText(planText, fallbackAction) {
  const parsed = planText
    .split(/\r?\n/)
    .map(cleanScheduleTaskText)
    .filter(Boolean);

  const unique = [...new Set(parsed)];
  if (unique.length >= 3) return unique;
  return [
    fallbackAction || "단어 40개 + LC 1세트",
    "오답 정리 20분",
    "오늘 진행 상황 체크인",
  ];
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

function buildSchedule(plan, planText, revisionRequest = "", weeklySchedule = []) {
  const period = Math.max(7, Math.min(Number(plan.period) || 30, 100));
  const baseTasks = parsePlanText(planText, plan.firstAction);
  const times = getRoutineTimes(plan, revisionRequest);
  const hints = getScheduleHints(revisionRequest);
  const weeklyFocus = ["루틴 고정", "기초 반복", "중간 점검", "약점 보완", "실전 적용", "가벼운 복습", "주간 리포트"];
  const structuredWeek = Array.isArray(weeklySchedule) ? weeklySchedule.filter((item) => item && typeof item === "object") : [];
  const structuredByDay = new Map(structuredWeek.map((item) => [String(item.day || ""), item]));
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const planStart = getPlanStartDate(plan, {});

  return Array.from({ length: period }, (_, index) => {
    const day = index + 1;
    if (structuredByDay.size) {
      const actualDate = new Date(planStart.getFullYear(), planStart.getMonth(), planStart.getDate() + index);
      const dayName = dayNames[actualDate.getDay()];
      const template = structuredByDay.get(dayName);
      const isRestDay = !template || template.isRestDay;
      const tasks = isRestDay
        ? []
        : (Array.isArray(template.tasks) ? template.tasks : []).slice(0, 5).map((task) => ({
            time: String(task.time || "오늘"),
            durationMinutes: Math.max(5, Math.min(360, Number(task.durationMinutes) || 15)),
            text: String(task.task || "목표 행동 실행하기"),
            completionRule: String(task.completionRule || "정한 분량을 끝내면 완료"),
          }));
      return {
        day,
        title: isRestDay ? `Day ${day} · 계획된 휴식` : `Day ${day} · ${dayName}요일 맞춤 계획`,
        isRestDay,
        tasks,
      };
    }
    const focus = weeklyFocus[index % weeklyFocus.length];
    const isWeekend = day % 7 === 6 || day % 7 === 0;
    const tasks =
      hints.lightWeekend && isWeekend
        ? [
            { time: times[0], text: "이번 주 핵심 내용 한 번 복습하기", durationMinutes: 10 },
            { time: times[2], text: "다음 실행일에 이어갈 항목 1개 정하기", durationMinutes: 5 },
          ]
        : times.map((time, taskIndex) => ({
            time,
            durationMinutes: hints.shorterTasks ? 10 : undefined,
            text:
              taskIndex === 2 && day % 7 === 0
                ? "이번 주 완료율 확인하고 다음 주 난이도 조정"
                : hints.shorterTasks
                  ? cleanScheduleTaskText(baseTasks[(index + taskIndex) % baseTasks.length]) || "오늘의 핵심 행동 시작하기"
                  : cleanScheduleTaskText(baseTasks[(index + taskIndex) % baseTasks.length]) || "오늘의 핵심 행동 시작하기",
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
    return sum + checked.slice(0, day.tasks.length).filter(Boolean).length;
  }, 0);
  return totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
}

function getDayCompletion(dayPlan, checkedByDay) {
  const checked = checkedByDay[String(dayPlan.day)] || [];
  const completed = checked.slice(0, dayPlan.tasks.length).filter(Boolean).length;
  const total = dayPlan.tasks.length;
  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 100,
  };
}

function getCompletedDayCount(schedule, checkedByDay) {
  return schedule.filter((dayPlan) => dayPlan.tasks.length > 0 && getDayCompletion(dayPlan, checkedByDay).percent === 100).length;
}

function remapCompletedChecks(previousSchedule, nextSchedule, checkedByDay) {
  const completedTaskTexts = new Set();
  previousSchedule.forEach((dayPlan) => {
    const checked = checkedByDay[String(dayPlan.day)] || [];
    dayPlan.tasks.forEach((task, index) => {
      if (checked[index]) completedTaskTexts.add(`${dayPlan.day}|${String(task.text || "").trim()}`);
    });
  });

  const remapped = {};
  nextSchedule.forEach((dayPlan) => {
    const checks = dayPlan.tasks.map((task) => completedTaskTexts.has(`${dayPlan.day}|${String(task.text || "").trim()}`));
    if (checks.some(Boolean)) remapped[String(dayPlan.day)] = checks;
  });
  return remapped;
}

function getPlanBundle({ reset = false, customText, revisionRequest, revisionDetails, weeklySchedule } = {}) {
  const plan = readExecutionPlan();
  const previous = getExecutionState();
  const planText = customText ?? previous.planText ?? getDefaultPlanText(plan);
  const requestText = revisionRequest ?? previous.revisionRequest ?? "";
  const detailConfig = revisionDetails ?? previous.revisionDetails ?? {};
  const weekConfig = weeklySchedule ?? previous.weeklySchedule ?? [];
  const schedule = buildSchedule(plan, planText, requestText, weekConfig);
  const previousSchedule = reset
    ? buildSchedule(plan, previous.planText || getDefaultPlanText(plan), previous.revisionRequest || "", previous.weeklySchedule || [])
    : schedule;
  const checkedForSchedule = reset
    ? remapCompletedChecks(previousSchedule, schedule, previous.checkedByDay || {})
    : previous.checkedByDay || {};
  const scheduleKey = hashText(`${plan.goal || ""}|${plan.period || ""}|${planText}|${requestText}|${JSON.stringify(detailConfig)}|${JSON.stringify(weekConfig)}`);
  const canReuse = !reset && previous.scheduleKey === scheduleKey;
  const state = canReuse
    ? previous
    : {
        version: appStateVersion,
        scheduleKey,
        planText,
        revisionRequest: requestText,
        revisionDetails: detailConfig,
        weeklySchedule: weekConfig,
        pendingPlanText: previous.pendingPlanText || "",
        pendingRevisionRequest: previous.pendingRevisionRequest || "",
        pendingRevisionDetails: previous.pendingRevisionDetails || {},
        pendingRevisionSummary: previous.pendingRevisionSummary || {},
        pendingWeeklySchedule: previous.pendingWeeklySchedule || [],
        status: previous.status || "AI 제안",
        selectedDay: previous.selectedDay || 1,
        checkedByDay: checkedForSchedule,
        difficultyByTask: previous.difficultyByTask || {},
        recoveryActions: previous.recoveryActions || [],
        completedLog: previous.completedLog || [],
        dailyMemories: previous.dailyMemories || [],
        lastCompletion: previous.lastCompletion || null,
        planStartDate: previous.planStartDate || getLocalDateKey(plan.createdAt),
        lastSeenDate: previous.lastSeenDate || getTodayKey(),
        rolloverNotice: previous.rolloverNotice || null,
        updatedAt: new Date().toISOString(),
      };

  state.version = appStateVersion;
  state.planText = planText;
  state.revisionRequest = requestText;
  state.revisionDetails = detailConfig;
  state.weeklySchedule = weekConfig;
  state.scheduleKey = scheduleKey;
  state.selectedDay = Math.max(1, Math.min(Number(state.selectedDay) || 1, schedule.length));
  state.planStartDate = state.planStartDate || getLocalDateKey(plan.createdAt);

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
const focusSessionKey = "omwFocusSession";
const legacyOllieStorageKeys = [companionStateKey, companionEventKey, "omwExecutionPlan", "omwExecutionState"];
let activeFocusTaskIndex = 0;
let calendarViewDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calendarDetailOpen = false;
let focusTimerInterval = null;
let focusSession = {
  taskKey: "",
  status: "idle",
  durationSeconds: 15 * 60,
  remainingSeconds: 15 * 60,
  endAt: null,
};

function replaceLegacyCompanionName(value) {
  if (typeof value === "string") {
    return value
      .replace(/(^|[^가-힣])모리(?=$|[\s.,!?…"'()[\]{}]|가|는|를|와|의|에게|랑|도|만|야|로|라고|였|예)/g, "$1올리")
      .replace(/\bMori\b/gi, "Ollie");
  }
  if (Array.isArray(value)) return value.map(replaceLegacyCompanionName);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceLegacyCompanionName(item)]));
  }
  return value;
}

function migrateLegacyCompanionNames() {
  legacyOllieStorageKeys.forEach((key) => {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      const migrated = replaceLegacyCompanionName(parsed);
      if (key === companionStateKey && migrated && typeof migrated === "object") migrated.name = "올리";
      const serialized = JSON.stringify(migrated);
      if (serialized !== stored) localStorage.setItem(key, serialized);
    } catch (error) {
      console.warn(`Unable to migrate legacy companion name in ${key}`, error);
    }
  });
}

migrateLegacyCompanionNames();

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
    const state = {
      ...getDefaultCompanionState(),
      ...(JSON.parse(localStorage.getItem(companionStateKey)) || {}),
      name: "올리",
    };
    return replaceLegacyCompanionName(state);
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

async function requestAiPlanRevision(payload) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch("/api/ai/plan-revision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "AI 변경안을 만드는 중 문제가 생겼어요.");
    return result.revision || result;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("AI 변경안 작성이 길어지고 있어요. 잠시 후 다시 시도해 주세요.");
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

const companionBondLevels = [
  { level: 1, name: "새싹 친구", next: "포근한 미소와 반가운 인사", detail: "한 단계 가까워지면 올리가 더 다정한 표정과 새 인사로 맞아줘요." },
  { level: 2, name: "포근한 단짝", next: "별빛 언덕의 반짝 대사", detail: "올리가 실행을 기억하고 별빛 언덕에서만 들려주는 응원을 시작해요." },
  { level: 3, name: "반짝 단짝", next: "올리의 별꽃 정원", detail: "관계가 더 자라면 둘만의 별꽃 정원과 특별한 대화가 열려요." },
  { level: 4, name: "별꽃 메이트", next: "별꽃 정원의 계절 장식", detail: "이제 함께 쌓은 기록에 따라 정원의 꽃과 올리의 반응이 달라져요." },
];

function getCompanionBondInfo(state) {
  const level = Math.max(1, Number(state.level) || 1);
  return companionBondLevels.find((item) => item.level === Math.min(level, companionBondLevels.length)) || companionBondLevels[0];
}

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
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
    events.push({ type, detail, dayKey: getTodayKey(), createdAt: new Date().toISOString() });
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

function showOllieStarShower(taskText = "오늘의 일정") {
  if (!ollieStarShower) return;
  ollieStarShower.replaceChildren();
  ollieStarShower.setAttribute("aria-label", `${taskText} 완료. 올리의 별빛이 쏟아집니다.`);
  const colors = ["#fff3a8", "#ffffff", "#cceee5", "#ded3f5", "#f7cad6"];
  for (let index = 0; index < 34; index += 1) {
    const star = document.createElement("span");
    star.textContent = index % 4 === 0 ? "✦" : index % 3 === 0 ? "✧" : "•";
    star.style.setProperty("--star-x", `${8 + Math.random() * 84}vw`);
    star.style.setProperty("--star-delay", `${Math.random() * 0.45}s`);
    star.style.setProperty("--star-duration", `${0.9 + Math.random() * 0.8}s`);
    star.style.setProperty("--star-size", `${10 + Math.random() * 22}px`);
    star.style.setProperty("--star-color", colors[index % colors.length]);
    ollieStarShower.append(star);
  }
  ollieStarShower.classList.remove("show");
  void ollieStarShower.offsetWidth;
  ollieStarShower.classList.add("show");
  announce(`${taskText} 완료! 올리의 별빛이 쏟아집니다.`);
  window.setTimeout(() => ollieStarShower.classList.remove("show"), 2200);
}

function pulseBondCompanion(rewardText = "♥") {
  if (executionCompanion) {
    executionCompanion.classList.remove("is-petted");
    window.requestAnimationFrame(() => {
      executionCompanion.classList.add("is-petted");
      window.setTimeout(() => executionCompanion.classList.remove("is-petted"), 900);
    });
  }
  if (bondReaction) {
    bondReaction.textContent = rewardText;
    bondReaction.classList.remove("show");
    void bondReaction.offsetWidth;
    bondReaction.classList.add("show");
    window.setTimeout(() => bondReaction.classList.remove("show"), 1200);
  }
}

function showOllieReaction(message, headline) {
  if (message && companionMessage) companionMessage.textContent = message;
  if (headline && companionMoodLine) companionMoodLine.textContent = headline;
  closeCompanionChat();
  const speech = document.querySelector("#companionHome .companion-speech");
  window.setTimeout(() => {
    speech?.scrollIntoView({ behavior: "smooth", block: "center" });
    pulseCompanion();
    if (!speech) return;
    speech.classList.remove("is-reacting");
    void speech.offsetWidth;
    speech.classList.add("is-reacting");
    window.setTimeout(() => speech.classList.remove("is-reacting"), 1600);
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

let revisionDetailDraftLoaded = false;

function normalizeRevisionMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.max(10, Math.min(720, Math.round(minutes / 10) * 10));
}

function collectRevisionDetails() {
  return {
    materials: revisionMaterials?.value.trim() || "",
    targetCoverage: revisionCoverage?.value.trim() || "",
    schedule: {
      weekdayMinutes: normalizeRevisionMinutes(revisionWeekdayMinutes?.value),
      weekendMinutes: normalizeRevisionMinutes(revisionWeekendMinutes?.value),
      preferredTime: revisionPreferredTime?.value || "",
      availableDays: [...revisionDayInputs].filter((input) => input.checked).map((input) => input.value),
    },
    focusAdjustment: {
      increase: revisionIncreaseFocus?.value.trim() || "",
      decrease: revisionDecreaseFocus?.value.trim() || "",
      keepRules: revisionKeepRules?.value.trim() || "",
    },
    constraints: revisionConstraints?.value.trim() || "",
  };
}

function hasRevisionDetails(details = collectRevisionDetails()) {
  return Boolean(
    details.materials ||
      details.targetCoverage ||
      details.schedule?.weekdayMinutes ||
      details.schedule?.weekendMinutes ||
      details.schedule?.preferredTime ||
      details.schedule?.availableDays?.length ||
      details.focusAdjustment?.increase ||
      details.focusAdjustment?.decrease ||
      details.focusAdjustment?.keepRules ||
      details.constraints,
  );
}

function populateRevisionDetails(details = {}) {
  const schedule = details.schedule || {};
  const focus = details.focusAdjustment || {};
  if (revisionMaterials) revisionMaterials.value = details.materials || "";
  if (revisionCoverage) revisionCoverage.value = details.targetCoverage || "";
  if (revisionWeekdayMinutes) revisionWeekdayMinutes.value = schedule.weekdayMinutes || "";
  if (revisionWeekendMinutes) revisionWeekendMinutes.value = schedule.weekendMinutes || "";
  if (revisionPreferredTime) revisionPreferredTime.value = schedule.preferredTime || "";
  if (revisionIncreaseFocus) revisionIncreaseFocus.value = focus.increase || "";
  if (revisionDecreaseFocus) revisionDecreaseFocus.value = focus.decrease || "";
  if (revisionKeepRules) revisionKeepRules.value = focus.keepRules || "";
  if (revisionConstraints) revisionConstraints.value = details.constraints || "";
  const selectedDays = new Set(Array.isArray(schedule.availableDays) ? schedule.availableDays : []);
  revisionDayInputs.forEach((input) => {
    input.checked = selectedDays.has(input.value);
  });
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
  if (sheet === authSheet) document.body.classList.toggle("account-auth-open", open);
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

function openEnergyCharge() {
  renderOllieEnergy();
  setSheetOpen(energyChargeSheet, energyChargeOverlay, true);
  trackCompanionEvent("energy_charge_opened");
}

function closeEnergyCharge() {
  setSheetOpen(energyChargeSheet, energyChargeOverlay, false);
}

function getSuggestedFocusMinutes(task) {
  const explicitDuration = Number(task?.durationMinutes);
  if (Number.isFinite(explicitDuration) && explicitDuration > 0) return Math.max(1, Math.min(180, explicitDuration));
  const match = String(task?.text || "").match(/(\d+)\s*분/);
  return Math.max(1, Math.min(180, Number(match?.[1]) || 15));
}

function formatFocusTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.ceil(totalSeconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function saveFocusSession() {
  try {
    localStorage.setItem(focusSessionKey, JSON.stringify(focusSession));
  } catch (error) {
    console.warn("Unable to save focus session", error);
  }
}

function clearFocusTimerInterval() {
  if (focusTimerInterval) window.clearInterval(focusTimerInterval);
  focusTimerInterval = null;
}

function renderFocusTimer() {
  if (focusSession.status === "running" && focusSession.endAt) {
    focusSession.remainingSeconds = Math.max(0, Math.ceil((focusSession.endAt - Date.now()) / 1000));
  }
  if (focusTimer) focusTimer.textContent = formatFocusTime(focusSession.remainingSeconds);
  if (focusMinutesInput && document.activeElement !== focusMinutesInput) {
    focusMinutesInput.value = String(Math.max(1, Math.ceil(focusSession.remainingSeconds / 60)));
  }
  if (focusTimerStartButton) {
    focusTimerStartButton.disabled = focusSession.status === "running";
    focusTimerStartButton.textContent = focusSession.status === "paused" ? "계속하기" : focusSession.status === "finished" ? "다시 시작" : focusSession.status === "running" ? "집중하는 중" : "집중 시작";
  }
  if (focusTimerPauseButton) focusTimerPauseButton.disabled = focusSession.status !== "running";
  if (focusModeKicker) {
    focusModeKicker.textContent = focusSession.status === "running" ? "올리와 함께 집중하는 중" : focusSession.status === "paused" ? "잠시 멈췄어요" : focusSession.status === "finished" ? "집중 시간 완료" : "한 가지에 집중할 시간";
  }
  focusMode?.classList.toggle("is-running", focusSession.status === "running");
  focusMode?.classList.toggle("is-paused", focusSession.status === "paused");
  focusMode?.classList.toggle("is-finished", focusSession.status === "finished");
  if (focusTimeupMessage) focusTimeupMessage.hidden = focusSession.status !== "finished";
}

function notifyFocusFinished() {
  clearFocusTimerInterval();
  focusSession.status = "finished";
  focusSession.remainingSeconds = 0;
  focusSession.endAt = null;
  saveFocusSession();
  renderFocusTimer();
  showToast("집중 시간이 끝났어요 · 올리가 기다리고 있어요. 완료 여부를 알려주세요");
  announce("집중 시간이 끝났습니다. 이 일정을 완료했는지 선택해 주세요.");
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("올리와의 집중 시간 완료", { body: "약속한 시간이 끝났어요. 앱에서 일정을 완료해 주세요." });
  }
  trackCompanionEvent("focus_timer_finished", { taskKey: focusSession.taskKey });
}

function tickFocusTimer() {
  if (focusSession.status !== "running" || !focusSession.endAt) return;
  focusSession.remainingSeconds = Math.max(0, Math.ceil((focusSession.endAt - Date.now()) / 1000));
  if (focusSession.remainingSeconds <= 0) {
    notifyFocusFinished();
    return;
  }
  renderFocusTimer();
}

function startFocusTimer() {
  if (focusSession.status === "finished" || focusSession.remainingSeconds <= 0) {
    focusSession.remainingSeconds = focusSession.durationSeconds;
  }
  focusSession.status = "running";
  focusSession.endAt = Date.now() + focusSession.remainingSeconds * 1000;
  saveFocusSession();
  clearFocusTimerInterval();
  focusTimerInterval = window.setInterval(tickFocusTimer, 250);
  renderFocusTimer();
  if ("Notification" in window && Notification.permission === "default") {
    try {
      const permissionRequest = Notification.requestPermission();
      permissionRequest?.catch?.(() => {});
    } catch (error) {
      console.warn("Unable to request focus notification permission", error);
    }
  }
  trackCompanionEvent("focus_timer_started", { taskKey: focusSession.taskKey, seconds: focusSession.remainingSeconds });
}

function pauseFocusTimer() {
  if (focusSession.status !== "running") return;
  focusSession.remainingSeconds = Math.max(1, Math.ceil((focusSession.endAt - Date.now()) / 1000));
  focusSession.status = "paused";
  focusSession.endAt = null;
  clearFocusTimerInterval();
  saveFocusSession();
  renderFocusTimer();
  trackCompanionEvent("focus_timer_paused", { taskKey: focusSession.taskKey, seconds: focusSession.remainingSeconds });
}

function setFocusMinutes(minutes) {
  const safeMinutes = Math.max(1, Math.min(180, Number(minutes) || 1));
  focusSession.durationSeconds = safeMinutes * 60;
  focusSession.remainingSeconds = safeMinutes * 60;
  if (focusSession.status === "running") focusSession.endAt = Date.now() + focusSession.remainingSeconds * 1000;
  if (focusSession.status === "finished") focusSession.status = "idle";
  saveFocusSession();
  renderFocusTimer();
}

function adjustFocusMinutes(delta) {
  const currentMinutes = Math.max(1, Math.ceil(focusSession.remainingSeconds / 60));
  setFocusMinutes(currentMinutes + delta);
}

function openFocusMode() {
  const bundle = getPlanBundle();
  const dayPlan = bundle.schedule[bundle.state.selectedDay - 1] || bundle.schedule[0];
  const checked = bundle.state.checkedByDay[String(dayPlan.day)] || [];
  const nextIndex = dayPlan.tasks.findIndex((_, index) => !checked[index]);
  const taskIndex = nextIndex === -1 ? 0 : nextIndex;
  const task = dayPlan.tasks[taskIndex];
  if (!task) {
    showToast("오늘은 계획된 휴식일이에요 · 다음 학습일에 이어가요");
    return;
  }
  const taskKey = getTaskKey(dayPlan.day, taskIndex);
  const suggestedMinutes = getSuggestedFocusMinutes(task);

  activeFocusTaskIndex = taskIndex;
  if (focusModeTitle) focusModeTitle.textContent = task?.text || "지금 시작할 일정";
  if (focusCriteria) focusCriteria.textContent = `${task?.time || "오늘"} 일정 · 시간은 언제든 조정할 수 있어요.`;

  try {
    const stored = safeJsonParse(localStorage.getItem(focusSessionKey), null);
    if (stored?.taskKey === taskKey) focusSession = { ...focusSession, ...stored };
  } catch (error) {
    console.warn("Unable to restore focus session", error);
  }

  if (focusSession.taskKey !== taskKey) {
    clearFocusTimerInterval();
    focusSession = { taskKey, status: "idle", durationSeconds: suggestedMinutes * 60, remainingSeconds: suggestedMinutes * 60, endAt: null };
    saveFocusSession();
  }
  if (focusSession.status === "running") {
    const remaining = Math.ceil((Number(focusSession.endAt) - Date.now()) / 1000);
    if (remaining <= 0) notifyFocusFinished();
    else {
      focusSession.remainingSeconds = remaining;
      clearFocusTimerInterval();
      focusTimerInterval = window.setInterval(tickFocusTimer, 250);
    }
  }
  renderFocusTimer();
  setSheetOpen(focusMode, focusModeOverlay, true);
  trackCompanionEvent("focus_opened", { day: dayPlan.day, taskIndex });
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
  clearFocusTimerInterval();
  try {
    localStorage.removeItem(focusSessionKey);
  } catch (error) {
    console.warn("Unable to clear focus session", error);
  }
  focusSession = { taskKey: "", status: "idle", durationSeconds: 15 * 60, remainingSeconds: 15 * 60, endAt: null };
  closeFocusMode();
  pulseCompanion();
  if (wasUnchecked) showOllieStarShower(dayPlan.tasks[activeFocusTaskIndex]?.text);
  showToast(wasUnchecked ? "일정 하나를 완료했어요 · 올리의 별빛과 10 XP를 받았어요" : "이미 완료된 일정이에요");
  trackCompanionEvent("focus_completed", { day: dayPlan.day, taskIndex: activeFocusTaskIndex, rewarded: wasUnchecked });
  renderExecutionPage(bundle);
}

function renderFocusTask(dayPlan, selectedCompletion) {
  if (!focusTaskTitle || !dayPlan) return;

  if (!dayPlan.tasks.length) {
    focusTaskTitle.textContent = "오늘은 계획된 휴식일이에요";
    if (focusTaskMeta) focusTaskMeta.textContent = "입력한 가능 요일을 기준으로 학습을 비워두었어요";
    if (minimumGoalText) minimumGoalText.textContent = "충분히 쉬고 다음 학습일 준비";
    if (focusProgressText) focusProgressText.textContent = "휴식일";
    if (startFocusButton) {
      startFocusButton.disabled = true;
      startFocusButton.textContent = "계획된 휴식일";
    }
    return;
  }

  const bundle = getPlanBundle();
  const checked = bundle.state.checkedByDay[String(dayPlan.day)] || [];
  const nextIndex = dayPlan.tasks.findIndex((_, index) => !checked[index]);
  const taskIndex = nextIndex === -1 ? 0 : nextIndex;
  const task = dayPlan.tasks[taskIndex];

  const suggestedMinutes = getSuggestedFocusMinutes(task);
  if (focusTaskTitle) focusTaskTitle.textContent = task?.text || "오늘 기록 돌아보기";
  if (focusTaskMeta) focusTaskMeta.textContent = selectedCompletion.percent === 100 ? "오늘 AI 스케줄을 모두 완료했어요" : `${task?.time || "오늘"} · 지금 시작하면 좋은 다음 일정`;
  if (minimumGoalText) minimumGoalText.textContent = selectedCompletion.percent === 100 ? "오늘 일정 모두 완료" : `집중 시간 ${suggestedMinutes}분`;
  if (focusProgressText) focusProgressText.textContent = `${selectedCompletion.completed}/${selectedCompletion.total} 완료`;
  if (startFocusButton) {
    startFocusButton.disabled = false;
    startFocusButton.dataset.taskIndex = String(taskIndex);
    startFocusButton.textContent = selectedCompletion.percent === 100 ? "오늘 일정 다시 보기" : "이 일정 시작하기";
  }
}

function getTaskPeriod(time) {
  const hour = Number(String(time || "").match(/\d{1,2}/)?.[0] || 12);
  if (hour < 12) return { label: "아침", icon: "☀", theme: "morning" };
  if (hour < 17) return { label: "오후", icon: "◉", theme: "afternoon" };
  if (hour < 21) return { label: "저녁 루틴", icon: "☾", theme: "evening" };
  return { label: "마무리", icon: "✦", theme: "night" };
}

function renderChecklist(dayPlan, state) {
  if (!executionChecklist) return;

  executionChecklist.innerHTML = "";
  const checked = state.checkedByDay[String(dayPlan.day)] || [];

  if (!dayPlan.tasks.length) {
    const rest = document.createElement("div");
    rest.className = "plan-rest-day";
    rest.innerHTML = "<strong>오늘은 계획된 휴식일이에요</strong><span>선택한 학습 가능 요일에 맞춰 일정이 비워져 있습니다.</span>";
    executionChecklist.append(rest);
    return;
  }

  dayPlan.tasks.forEach((task, index) => {
    const period = getTaskPeriod(task.time);
    const label = document.createElement("label");
    const input = document.createElement("input");
    const content = document.createElement("span");
    const time = document.createElement("strong");
    const text = document.createElement("span");
    const head = document.createElement("span");
    const periodBadge = document.createElement("span");
    const timelineNode = document.createElement("i");

    label.className = `task-row task-${period.theme}`;
    input.className = "execution-check";
    input.type = "checkbox";
    input.dataset.taskIndex = String(index);
    input.checked = Boolean(checked[index]);
    label.classList.toggle("is-complete", input.checked);
    content.className = "task-content";
    head.className = "task-row-head";
    periodBadge.className = "task-period";
    timelineNode.className = "task-timeline-node";

    time.textContent = task.time;
    periodBadge.textContent = `${period.icon} ${period.label}`;
    text.textContent = task.text;

    const minimum = document.createElement("small");
    minimum.className = "minimum-action";
    minimum.textContent = task.completionRule
      ? `예상 ${getSuggestedFocusMinutes(task)}분 · 완료: ${task.completionRule}`
      : `예상 ${getSuggestedFocusMinutes(task)}분`;

    head.append(periodBadge);
    content.append(head, text, minimum);
    label.append(time, input, timelineNode, content);
    executionChecklist.append(label);
  });
}

function getPlanStartDate(plan, state) {
  const source = state?.planStartDate || plan?.createdAt || getTodayKey();
  const parsed = new Date(source);
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return new Date(safeDate.getFullYear(), safeDate.getMonth(), safeDate.getDate());
}

function getCalendarDayDifference(date, startDate) {
  const dateUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const startUtc = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  return Math.round((dateUtc - startUtc) / 86400000);
}

function isSameCalendarDate(first, second) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

function renderCalendar(schedule, state, plan) {
  if (!scheduleCalendar) return;

  scheduleCalendar.replaceChildren();
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  const planStartDate = getPlanStartDate(plan, state);
  const today = new Date();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const monthPlanDays = [];

  if (calendarMonthTitle) calendarMonthTitle.textContent = `${year}년 ${month + 1}월`;

  for (let index = 0; index < firstDayOffset; index += 1) {
    const empty = document.createElement("span");
    empty.className = "calendar-empty";
    empty.setAttribute("aria-hidden", "true");
    scheduleCalendar.append(empty);
  }

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const actualDate = new Date(year, month, dayNumber);
    const planDayNumber = getCalendarDayDifference(actualDate, planStartDate) + 1;
    const dayPlan = planDayNumber >= 1 && planDayNumber <= schedule.length ? schedule[planDayNumber - 1] : null;
    const completion = dayPlan ? getDayCompletion(dayPlan, state.checkedByDay) : { percent: 0 };
    const button = document.createElement("button");
    const day = document.createElement("strong");
    const percent = document.createElement("span");
    const planLabel = document.createElement("small");
    const ollie = document.createElement("img");

    button.type = "button";
    button.className = "calendar-day";
    button.disabled = !dayPlan;
    if (dayPlan) button.dataset.day = String(dayPlan.day);
    button.dataset.date = actualDate.toLocaleDateString("en-CA");
    button.style.setProperty("--day-progress", `${completion.percent}%`);
    button.classList.toggle("selected", Boolean(dayPlan && dayPlan.day === state.selectedDay));
    button.classList.toggle("today", isSameCalendarDate(actualDate, today));
    button.classList.toggle("saturday", actualDate.getDay() === 6);
    button.classList.toggle("sunday", actualDate.getDay() === 0);
    button.classList.toggle("done", Boolean(dayPlan && completion.percent === 100));
    button.classList.toggle("partial", Boolean(dayPlan && completion.percent > 0 && completion.percent < 100));
    button.classList.toggle("outside-plan", !dayPlan);

    day.textContent = String(dayNumber);
    planLabel.textContent = isSameCalendarDate(actualDate, today) ? "오늘" : dayPlan ? `D${dayPlan.day}` : "";
    percent.textContent = dayPlan ? `${completion.percent}%` : planDayNumber < 1 ? "올리 기다림" : "올리 쉬는 날";
    ollie.className = "calendar-ollie";
    ollie.src = completion.percent === 100 ? "assets/ollie-celebrate.png" : "assets/ollie-thinking.png";
    ollie.alt = "";
    ollie.hidden = !dayPlan || (completion.percent !== 100 && dayPlan.day !== state.selectedDay);
    button.setAttribute(
      "aria-label",
      dayPlan
        ? `${year}년 ${month + 1}월 ${dayNumber}일, 계획 ${dayPlan.day}일차, ${completion.percent}% 완료`
        : `${year}년 ${month + 1}월 ${dayNumber}일, 연결된 계획 없음`,
    );
    button.append(day, planLabel, percent, ollie);
    scheduleCalendar.append(button);
    if (dayPlan) monthPlanDays.push(dayPlan);
  }

  const usedCells = firstDayOffset + daysInMonth;
  const trailingCells = (7 - (usedCells % 7)) % 7;
  for (let index = 0; index < trailingCells; index += 1) {
    const empty = document.createElement("span");
    empty.className = "calendar-empty";
    empty.setAttribute("aria-hidden", "true");
    scheduleCalendar.append(empty);
  }

  const monthProgress = monthPlanDays.length ? getScheduleCompletion(monthPlanDays, state.checkedByDay) : 0;
  const completedDays = monthPlanDays.filter((dayPlan) => dayPlan.tasks.length > 0 && getDayCompletion(dayPlan, state.checkedByDay).percent === 100).length;
  if (monthlyCompletion) monthlyCompletion.textContent = `${monthProgress}%`;
  if (calendarSummary) {
    calendarSummary.textContent = monthPlanDays.length
      ? `목표 일정 ${monthPlanDays.length}일 · 완료한 날 ${completedDays}일`
      : "이 달에는 연결된 목표 일정이 없어요";
  }

  renderCalendarDayDetail(schedule, state, plan);
}

function renderCalendarDayDetail(schedule, state, plan) {
  if (!calendarDayDetail) return;

  const dayPlan = schedule[state.selectedDay - 1];
  if (!calendarDetailOpen || !dayPlan) {
    calendarDayDetail.hidden = true;
    return;
  }

  const planStartDate = getPlanStartDate(plan, state);
  const actualDate = new Date(planStartDate.getFullYear(), planStartDate.getMonth(), planStartDate.getDate() + dayPlan.day - 1);
  const isToday = isSameCalendarDate(actualDate, new Date());
  const completion = getDayCompletion(dayPlan, state.checkedByDay);
  const checked = state.checkedByDay[String(dayPlan.day)] || [];
  const dateLabel = actualDate.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });

  calendarDayDetail.hidden = false;
  if (calendarDayDetailTitle) calendarDayDetailTitle.textContent = `${dateLabel} 스케줄`;
  if (calendarDayDetailMeta) {
    calendarDayDetailMeta.textContent = dayPlan.tasks.length
      ? `${isToday ? "오늘" : `D${dayPlan.day}`} · 일정 ${dayPlan.tasks.length}개 · ${completion.percent}% 완료`
      : `${isToday ? "오늘" : `D${dayPlan.day}`} · 계획된 휴식일`;
  }

  if (calendarDayDetailList) {
    calendarDayDetailList.replaceChildren();
    dayPlan.tasks.forEach((task, index) => {
      const item = document.createElement("li");
      const status = document.createElement("i");
      const time = document.createElement("strong");
      const text = document.createElement("span");

      item.classList.toggle("is-complete", Boolean(checked[index]));
      status.textContent = checked[index] ? "✓" : "";
      time.textContent = task.time;
      text.textContent = task.text;
      item.append(status, time, text);
      calendarDayDetailList.append(item);
    });
  }
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
    detail.textContent = dayPlan.tasks.length ? dayPlan.tasks.map((task) => task.text).slice(0, 2).join(" · ") : "계획된 휴식일";
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
    { threshold: 100, title: "올리의 별꽃 정원", badge: "완주", level: 5 },
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
    { title: "별빛 언덕", shortTitle: "별빛 언덕", threshold: 75, icon: "✦", theme: "hill", story: "쌓아 온 시간을 내려다보며 마지막 걸음을 준비하는 곳이에요." },
    { title: "올리의 별꽃 정원", shortTitle: "별꽃 정원", threshold: 100, icon: "❀", theme: "garden", story: "올리와 함께 쌓은 작은 성공이 별꽃처럼 피어나 오래 기억되는 둘만의 정원이에요." },
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
    if (index === currentIndex) item.style.setProperty("--ollie-position", `${8 + segmentProgress * 0.58}%`);
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

const memoryMoodMeta = {
  happy: { label: "기쁨", icon: "😊", echo: "웃음이 머문 하루였네요. 그 순간을 아래에 남겨볼까요?" },
  excited: { label: "설렘", icon: "🌸", echo: "두근거림이 있던 하루군요. 무엇이 마음을 설레게 했나요?" },
  proud: { label: "뿌듯함", icon: "✨", echo: "스스로 해낸 마음이에요. 오래 기억할 가치가 있어요." },
  grateful: { label: "고마움", icon: "🍀", echo: "고마운 마음이 든 순간, 누구 덕분이었는지 남겨두면 더 오래 남아요." },
  calm: { label: "평온함", icon: "🌿", echo: "잔잔한 하루도 소중한 기록이 돼요." },
  tired: { label: "지침", icon: "🌙", echo: "애쓴 만큼 지친 거예요. 오늘은 짧게 적어도 충분해요." },
  regret: { label: "아쉬움", icon: "🍂", echo: "아쉬움이 남는 하루였군요. 내일 다시 이어가면 돼요." },
  heavy: { label: "답답함", icon: "☁️", echo: "답답한 마음은 글로 풀어내면 조금 가벼워져요." },
  anxious: { label: "불안함", icon: "🌫️", echo: "불안했던 마음, 걱정을 한 줄로 적어보면 조금 또렷해져요." },
  sad: { label: "슬픔", icon: "🌧️", echo: "슬펐던 마음도 올리가 함께 기억할게요. 천천히 적어보세요." },
  light: { label: "가벼움", icon: "😊", echo: "가벼운 마음으로 보낸 하루네요." },
  steady: { label: "보통", icon: "🌿", echo: "잔잔한 하루도 소중한 기록이 돼요." },
  custom: { label: "나만의 마음", icon: "✏️", echo: "직접 적은 마음이 가장 정확해요. 올리가 그대로 기억할게요." },
};

const lowEnergyMoods = new Set(["tired", "heavy", "anxious", "sad"]);

function isLowMemoryMood(mood) {
  return lowEnergyMoods.has(normalizeMemoryMood(mood));
}

function normalizeMemoryMood(mood) {
  return { light: "happy", steady: "calm" }[mood] || mood || "calm";
}

function updateMemoryMoodEcho(mood, customText) {
  if (!memoryMoodEcho) return;
  if (customText) {
    memoryMoodEcho.textContent = `「${customText}」 — 그 마음 그대로 올리가 소중히 기억할게요.`;
    return;
  }
  const meta = memoryMoodMeta[normalizeMemoryMood(mood)] || memoryMoodMeta.calm;
  memoryMoodEcho.textContent = meta.echo;
}

function getObjectParticle(word) {
  const code = String(word || "").charCodeAt(String(word || "").length - 1);
  if (code < 0xac00 || code > 0xd7a3) return "을";
  return (code - 0xac00) % 28 ? "을" : "를";
}

function getMemoryMoodDisplay(memory) {
  if (memory.mood === "custom" && memory.customMood) return { label: memory.customMood, icon: "✏️" };
  return memoryMoodMeta[memory.mood] || memoryMoodMeta.steady;
}

function applyMoodSelectionToForm(memory) {
  const isCustom = memory?.mood === "custom" && memory?.customMood;
  const selectedMood = isCustom ? "" : normalizeMemoryMood(memory?.mood);
  memoryMoodButtons.forEach((button) => button.classList.toggle("selected", button.dataset.memoryMood === selectedMood));
  if (memoryCustomMood) memoryCustomMood.value = isCustom ? memory.customMood : "";
  updateMemoryMoodEcho(selectedMood, isCustom ? memory.customMood : "");
}

const memoryObstacleMeta = {
  none: "특별한 방해 없음",
  time: "시간 부족",
  energy: "에너지 부족",
  difficulty: "과제가 너무 큼",
  focus: "집중이 흐트러짐",
};

function getLatestCompanionDialogue() {
  const todayKey = getTodayKey();
  const events = readCompanionEvents();
  return [...events]
    .reverse()
    .find((event) => event.type === "companion_dialogue" && (event.dayKey || String(event.createdAt || "").slice(0, 10)) === todayKey);
}

function buildMemorySuggestion({ mood, obstacle, completion, nextStep }) {
  if (nextStep) return `내일 첫 행동을 "${nextStep}"로 시작하도록 계획에 반영해줘.`;
  if (obstacle === "time") return "내일 계획은 가능한 시간을 먼저 정하고, 핵심 행동 한 가지만 그 시간에 배치해줘.";
  if (mood === "anxious") return "내일 첫 행동은 시작 시간을 정확히 정하고, 시작 전에 준비할 것 한 가지만 적어 걱정을 줄여줘.";
  if (obstacle === "energy" || isLowMemoryMood(mood)) return "내일 첫 행동은 5분짜리 최소 성공 기준으로 줄이고, 나머지는 선택 행동으로 바꿔줘.";
  if (obstacle === "difficulty") return "내일 과제는 지금 크기의 절반 이하로 나누고, 완료 기준을 한 문장으로 선명하게 적어줘.";
  if (obstacle === "focus") return "내일 계획은 한 번에 한 과제만 보이게 하고, 시작 알림과 10분 타이머를 연결해줘.";
  if (completion >= 80) return "오늘 잘 된 시간과 실행 크기를 내일도 유지하고, 난이도는 올리지 말아줘.";
  return "내일은 오늘보다 더 작은 첫 행동 하나만 먼저 보이도록 계획을 조정해줘.";
}

function formatMemoryDate(value) {
  const date = new Date(value || Date.now());
  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}

function renderMemoryCards({ selectedCompletion }) {
  if (!memoryList) return;
  const state = getExecutionState();
  const memories = [...(state.dailyMemories || [])].sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  const todayKey = getTodayKey();
  const todayMemory = memories.find((item) => item.diaryDate === todayKey || String(item.id || "").startsWith(todayKey));
  const latestDialogue = getLatestCompanionDialogue();
  const conversation = latestDialogue?.detail?.reply || companionMessage?.textContent || "아직 오늘 나눈 대화가 없어요.";

  if (memoryCompletion) memoryCompletion.textContent = `${selectedCompletion.percent}% 완료`;
  if (memoryConversation) memoryConversation.textContent = conversation;
  if (memoryCount) memoryCount.textContent = `${memories.length}장`;

  const isEditingMemory = memoryForm?.contains(document.activeElement);
  if (!isEditingMemory) {
    applyMoodSelectionToForm(todayMemory);
    if (memoryTitle) memoryTitle.value = todayMemory?.title || "";
    if (memoryNote) memoryNote.value = todayMemory?.note || "";
    if (memoryObstacle) memoryObstacle.value = todayMemory?.obstacle || "none";
    if (memoryNextStep) memoryNextStep.value = todayMemory?.nextStep || "";
    const saveLabel = memorySaveButton?.querySelector("span");
    if (saveLabel) saveLabel.textContent = todayMemory ? "오늘의 다이어리 업데이트하기" : "오늘의 다이어리 저장하기";
  }

  memoryList.replaceChildren();
  if (!memories.length) {
    const empty = document.createElement("article");
    empty.className = "memory-empty-state";
    const image = document.createElement("img");
    image.src = "assets/ollie-comfort.png";
    image.alt = "";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "첫 번째 다이어리를 써볼까요?";
    const text = document.createElement("p");
    text.textContent = "오늘의 감정과 기억하고 싶은 순간을 남기면 올리가 내일 계획까지 이어드려요.";
    copy.append(title, text);
    empty.append(image, copy);
    memoryList.append(empty);
  } else {
    memories.slice(0, 30).forEach((memory) => {
      const mood = getMemoryMoodDisplay(memory);
      const item = document.createElement("article");
      item.className = `daily-memory-item diary-entry mood-${normalizeMemoryMood(memory.mood)}`;
      item.dataset.mood = normalizeMemoryMood(memory.mood);

      const head = document.createElement("header");
      head.className = "daily-memory-head";
      const date = document.createElement("div");
      date.className = "daily-memory-date";
      const small = document.createElement("small");
      small.textContent = `DAY ${memory.day || 1}`;
      const dateStrong = document.createElement("strong");
      dateStrong.textContent = formatMemoryDate(memory.diaryDate || memory.createdAt);
      date.append(small, dateStrong);
      const moodBadge = document.createElement("span");
      moodBadge.className = "memory-mood-badge";
      moodBadge.textContent = `${mood.icon} ${mood.label}`;
      head.append(date, moodBadge);

      const diaryTitle = document.createElement("h4");
      diaryTitle.className = "diary-entry-title";
      diaryTitle.textContent = memory.title || `${mood.label}${getObjectParticle(mood.label)} 기억한 하루`;

      const metrics = document.createElement("div");
      metrics.className = "memory-metrics";
      const completion = document.createElement("span");
      completion.textContent = `실행 ${memory.completion || 0}%`;
      const obstacle = document.createElement("span");
      obstacle.textContent = memoryObstacleMeta[memory.obstacle] || memoryObstacleMeta.none;
      metrics.append(completion, obstacle);

      const note = document.createElement("p");
      note.className = "memory-note";
      note.textContent = memory.note || "글로 남기지는 않았지만, 오늘의 감정과 실행을 한 장의 기억으로 저장했어요.";

      const nextStep = document.createElement("div");
      nextStep.className = "diary-next-step";
      const nextStepLabel = document.createElement("span");
      nextStepLabel.textContent = "내일의 첫 장면";
      const nextStepText = document.createElement("strong");
      nextStepText.textContent = memory.nextStep || "내일의 나에게 맡겨둘게요.";
      nextStep.append(nextStepLabel, nextStepText);

      const dialogue = document.createElement("div");
      dialogue.className = "memory-dialogue";
      const dialogueLabel = document.createElement("span");
      dialogueLabel.textContent = "올리와의 대화";
      const dialogueText = document.createElement("p");
      dialogueText.textContent = memory.conversation || "오늘 올리가 건넨 응원을 함께 기억하고 있어요.";
      dialogue.append(dialogueLabel, dialogueText);

      const action = document.createElement("footer");
      action.className = "daily-memory-footer";
      const suggestion = document.createElement("div");
      const suggestionLabel = document.createElement("small");
      suggestionLabel.textContent = "내일을 위한 올리의 제안";
      const suggestionText = document.createElement("strong");
      suggestionText.textContent = memory.suggestion;
      suggestion.append(suggestionLabel, suggestionText);
      const applyButton = document.createElement("button");
      applyButton.type = "button";
      applyButton.className = "apply-memory-insight";
      applyButton.dataset.memoryApply = memory.id;
      applyButton.textContent = "내일 계획에 반영";
      action.append(suggestion, applyButton);

      const diaryActions = document.createElement("div");
      diaryActions.className = "diary-entry-actions";
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.dataset.memoryEdit = memory.id;
      editButton.textContent = "다시 쓰기";
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.dataset.memoryDelete = memory.id;
      deleteButton.textContent = "기록 지우기";
      diaryActions.append(editButton, deleteButton);

      item.append(head, diaryTitle, metrics, note, nextStep, dialogue, action, diaryActions);
      memoryList.append(item);
    });
  }

  renderPatternCards(state);
  renderDifficultyPrompt(state);
}

function renderPatternCards(state) {
  if (!patternList) return;
  const memories = state.dailyMemories || [];
  const completedLog = state.completedLog || [];
  const eveningCount = completedLog.filter((item) => Number(String(item.time).slice(0, 2)) >= 18).length;
  const averageCompletion = memories.length ? Math.round(memories.reduce((sum, item) => sum + Number(item.completion || 0), 0) / memories.length) : 0;
  const tiredRecords = memories.filter((item) => isLowMemoryMood(item.mood));
  const obstacleCounts = memories.reduce((counts, item) => {
    if (item.obstacle && item.obstacle !== "none") counts[item.obstacle] = (counts[item.obstacle] || 0) + 1;
    return counts;
  }, {});
  const commonObstacle = Object.entries(obstacleCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const dialogueCount = memories.filter((item) => item.hasDialogue).length;

  const patterns = [
    { icon: "↗", title: "나의 실행 페이스", detail: memories.length ? `${memories.length}일 평균 실행률은 ${averageCompletion}%예요. 기록이 더 쌓이면 요일별 차이도 알려드릴게요.` : "첫 다이어리를 저장하면 실행 페이스 분석이 시작돼요." },
    { icon: "◌", title: "기분과 실행", detail: tiredRecords.length ? `지쳤다고 기록한 날이 ${tiredRecords.length}일 있어요. 그날의 실행률을 비교해 최소 행동 크기를 조정할 수 있어요.` : "기분을 기록하면 컨디션에 맞는 계획 강도를 찾을 수 있어요." },
    { icon: "◇", title: "자주 막히는 지점", detail: commonObstacle ? `${memoryObstacleMeta[commonObstacle]}이 가장 자주 나타났어요. 다음 계획에서 이 지점을 먼저 줄여볼 수 있어요.` : eveningCount >= 2 ? "저녁 실행 기록이 많아요. 저녁 중심 루틴이 잘 맞을 가능성이 있어요." : "방해 요인을 기록하면 올리가 반복되는 막힘을 찾아드려요." },
    { icon: "✦", title: "올리와의 대화 효과", detail: dialogueCount ? `올리와 대화한 기록이 ${dialogueCount}일 있어요. 대화한 날의 실행률 변화를 함께 살펴볼 수 있어요.` : "올리와 나눈 대화도 다이어리에 담아 어떤 응원이 도움이 됐는지 찾아드려요." },
  ];

  patternList.replaceChildren();
  patterns.forEach((pattern) => {
    const item = document.createElement("article");
    const icon = document.createElement("span");
    icon.textContent = pattern.icon;
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = pattern.title;
    const detail = document.createElement("p");
    detail.textContent = pattern.detail;
    copy.append(title, detail);
    item.append(icon, copy);
    patternList.append(item);
  });
}

memoryMoodButtons.forEach((button) => {
  button.addEventListener("click", () => {
    memoryMoodButtons.forEach((item) => item.classList.toggle("selected", item === button));
    if (memoryCustomMood) memoryCustomMood.value = "";
    updateMemoryMoodEcho(button.dataset.memoryMood);
  });
});

memoryCustomMood?.addEventListener("input", () => {
  const text = memoryCustomMood.value.trim();
  if (text) {
    memoryMoodButtons.forEach((item) => item.classList.remove("selected"));
    updateMemoryMoodEcho("", text);
  } else {
    memoryMoodButtons.forEach((item) => item.classList.toggle("selected", item.dataset.memoryMood === "calm"));
    updateMemoryMoodEcho("calm");
  }
});

memoryForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const bundle = getPlanBundle();
  const selectedDay = bundle.schedule[bundle.state.selectedDay - 1] || bundle.schedule[0];
  const completion = getDayCompletion(selectedDay, bundle.state.checkedByDay);
  const customMoodText = memoryCustomMood?.value.trim() || "";
  const mood = customMoodText ? "custom" : document.querySelector("[data-memory-mood].selected")?.dataset.memoryMood || "calm";
  const title = memoryTitle?.value.trim() || "오늘의 한 장";
  const obstacle = memoryObstacle?.value || "none";
  const note = memoryNote?.value.trim() || "";
  const nextStep = memoryNextStep?.value.trim() || "";
  const latestDialogue = getLatestCompanionDialogue();
  const conversation = latestDialogue?.detail?.reply || companionMessage?.textContent || "오늘 올리와 함께 계획을 확인했어요.";
  const editingId = memoryForm.dataset.editingMemoryId || "";
  const todayKey = getTodayKey();
  const existingToday = (bundle.state.dailyMemories || []).find((item) => item.diaryDate === todayKey || String(item.id || "").startsWith(todayKey));
  const id = editingId || existingToday?.id || todayKey;
  const existing = (bundle.state.dailyMemories || []).find((item) => item.id === id);
  const recordedCompletion = editingId && existing ? Number(existing.completion || 0) : completion.percent;
  const memory = {
    id,
    diaryDate: existing?.diaryDate || (editingId ? String(existing?.id || "").slice(0, 10) : todayKey),
    day: existing?.day || bundle.state.selectedDay,
    title,
    mood,
    customMood: customMoodText,
    completion: recordedCompletion,
    obstacle,
    note,
    nextStep,
    conversation: editingId && existing ? existing.conversation : conversation,
    hasDialogue: editingId && existing ? existing.hasDialogue : Boolean(latestDialogue),
    suggestion: buildMemorySuggestion({ mood, obstacle, completion: recordedCompletion, nextStep }),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  bundle.state.dailyMemories = [...(bundle.state.dailyMemories || []).filter((item) => item.id !== id), memory].slice(-365);
  savePlanBundleState(bundle.state);
  delete memoryForm.dataset.editingMemoryId;
  trackCompanionEvent("daily_memory_saved", { day: memory.day, mood, completion: memory.completion, obstacle });
  if (memorySaveHint) memorySaveHint.textContent = "다이어리에 저장했어요. 오늘의 마음과 순간을 올리가 오래 기억할게요.";
  showToast("오늘의 다이어리를 저장했어요 · 차곡차곡 쌓인 기록에서 확인해 보세요");
  memorySaveButton?.blur();
  renderExecutionPage(getPlanBundle());
});

memoryList?.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-memory-edit]");
  const deleteButton = event.target.closest("[data-memory-delete]");
  if (editButton) {
    const state = getExecutionState();
    const memory = (state.dailyMemories || []).find((item) => item.id === editButton.dataset.memoryEdit);
    if (!memory) return;
    memoryForm.dataset.editingMemoryId = memory.id;
    if (memoryTitle) memoryTitle.value = memory.title || "";
    if (memoryNote) memoryNote.value = memory.note || "";
    if (memoryObstacle) memoryObstacle.value = memory.obstacle || "none";
    if (memoryNextStep) memoryNextStep.value = memory.nextStep || "";
    applyMoodSelectionToForm(memory);
    const saveLabel = memorySaveButton?.querySelector("span");
    if (saveLabel) saveLabel.textContent = "수정한 다이어리 저장하기";
    memoryForm.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => memoryTitle?.focus({ preventScroll: true }), 320);
    showToast("기록을 다시 펼쳤어요 · 고친 뒤 저장하면 같은 날짜에 업데이트돼요");
    return;
  }
  if (deleteButton) {
    const state = getExecutionState();
    const memory = (state.dailyMemories || []).find((item) => item.id === deleteButton.dataset.memoryDelete);
    if (!memory || !window.confirm(`“${memory.title || formatMemoryDate(memory.createdAt)}” 기록을 지울까요?`)) return;
    state.dailyMemories = (state.dailyMemories || []).filter((item) => item.id !== memory.id);
    savePlanBundleState(state);
    if (memoryForm.dataset.editingMemoryId === memory.id) delete memoryForm.dataset.editingMemoryId;
    showToast("다이어리 기록을 지웠어요");
    renderExecutionPage(getPlanBundle());
    return;
  }
  const button = event.target.closest("[data-memory-apply]");
  if (!button) return;
  const state = getExecutionState();
  const memory = (state.dailyMemories || []).find((item) => item.id === button.dataset.memoryApply);
  if (!memory?.suggestion) return;
  appendRevisionRequest(memory.suggestion, "추억 카드에서 찾은 단서를 계획 수정 요청에 담았어요.");
  trackCompanionEvent("memory_insight_applied", { memoryId: memory.id });
  showToast("추억 카드의 제안을 옮겼어요 · AI 변경안 만들기를 눌러 확인해 주세요");
  document.querySelector("#tab-plan")?.click();
  window.setTimeout(() => {
    const editor = document.querySelector("#journeyPlanEditor");
    editor?.scrollIntoView({ behavior: "smooth", block: "start" });
    editor?.classList.add("memory-revision-arrival");
    planRevisionRequest?.focus({ preventScroll: true });
    window.setTimeout(() => editor?.classList.remove("memory-revision-arrival"), 1800);
  }, 140);
});

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
  const bondInfo = getCompanionBondInfo(companionState);
  const touchedToday = companionState.lastTouchedDate === getTodayKey();
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
  if (companionMood) companionMood.textContent = touchedToday ? "포근함" : copy.mood;
  if (companionDays) companionDays.textContent = `${Math.max(1, completedDays || 1)}일`;
  if (companionNextGrowth) companionNextGrowth.textContent = bondInfo.name;
  if (bondLevelName) bondLevelName.textContent = bondInfo.name;
  if (bondXpText) bondXpText.textContent = `${companionState.xp || 0} / ${xpNeed} XP`;
  if (bondXpBar) bondXpBar.style.width = `${Math.max(4, Math.min(100, xpPercent))}%`;
  if (bondNextUnlock) bondNextUnlock.textContent = bondInfo.next;
  if (bondUnlockDescription) bondUnlockDescription.textContent = bondInfo.detail;
  if (touchCompanionButton) touchCompanionButton.textContent = touchedToday ? "한 번 더 쓰다듬기" : "오늘 쓰다듬기 · XP +5";
  if (touchCompanionHint) {
    touchCompanionHint.textContent = touchedToday
      ? "오늘의 관계 XP를 받았어요. 다시 쓰다듬으면 올리의 귀여운 반응을 볼 수 있어요."
      : "하루 첫 쓰다듬기는 관계 XP +5 · 단계마다 새 표정과 대화, 장소가 열려요.";
  }
  if (executionCompanionText) {
    executionCompanionText.textContent = touchedToday ? "오늘의 쓰다듬기를 기억하고 있어요. 올리의 표정이 포근해지고 다음 관계 변화에 가까워졌어요." : copy.message;
  }
  if (executionCompanionTitle) executionCompanionTitle.textContent = `${bondInfo.name} 올리`;
  if (executionCompanionPath) executionCompanionPath.textContent = "작은 방 → 산책길 → 숲 → 별빛 언덕 → 올리의 별꽃 정원";

  renderJourneyMap(overallProgress);
  renderMemoryCards({ selectedCompletion, completedDays, overallProgress });
}

function renderPlanPreview(planText, pendingPlanText = "", pendingRevisionSummary = {}) {
  if (!planPreviewList) return;

  const tasks = parsePlanText(planText, "오늘 첫 행동 정하기").slice(0, 6);
  const pendingTasks = pendingPlanText ? parsePlanText(pendingPlanText, "오늘 첫 행동 정하기").slice(0, 10) : [];
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

    const summaryItems = [
      ["목표 연결", pendingRevisionSummary.goalAlignment],
      ["교재·범위", pendingRevisionSummary.materialPlan],
      ["시간 배분", pendingRevisionSummary.timePlan],
      ["주간 리듬", pendingRevisionSummary.weeklyRule],
    ].filter(([, value]) => String(value || "").trim());
    if (summaryItems.length) {
      const list = document.createElement("ul");
      list.className = "proposal-detail-grid";
      summaryItems.forEach(([itemLabel, value]) => {
        const item = document.createElement("li");
        const small = document.createElement("small");
        const copy = document.createElement("b");
        small.textContent = itemLabel;
        copy.textContent = value;
        item.append(small, copy);
        list.append(item);
      });
      summary.append(list);
    }
    planPreviewList.append(summary);
  }

  const displayedTasks = pendingTasks.length ? pendingTasks : tasks;
  displayedTasks.forEach((task, index) => {
    const item = document.createElement("article");
    const day = document.createElement("span");
    const title = document.createElement("strong");
    const detail = document.createElement("p");

    day.textContent = pendingTasks.length ? `새 ${index + 1}` : `D${index + 1}`;
    title.textContent = task.replace(/^수정 요청 반영:\s*/, "요청 반영");
    detail.textContent = pendingTasks.length
      ? "적용 예정 항목입니다. 아래 적용하기를 누르기 전까지 현재 계획은 바뀌지 않아요."
      : index === 0
        ? "AI가 가장 먼저 반영할 실행 기준입니다."
        : "완료 기준과 최소 성공 기준을 함께 잡습니다.";
    item.append(day, title, detail);
    planPreviewList.append(item);
  });
}

function updateRevisionButtonState() {
  if (!regeneratePlanButton || !planRevisionRequest) return;

  const hasRequest = planRevisionRequest.value.trim().length > 0 || hasRevisionDetails();
  regeneratePlanButton.disabled = !hasRequest;
  if (planEditorMessage && !hasRequest) {
    planEditorMessage.textContent = "바꾸고 싶은 내용을 한 가지 이상 적으면 적용 전 변경안을 만들 수 있어요.";
  }
}

function renderDailyCoach(state, selectedCompletion, dayPlan) {
  if (!dailyCoachTitle || !dailyCoachMessage) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toLocaleDateString("en-CA");
  const memories = Array.isArray(state.dailyMemories) ? state.dailyMemories : [];
  const yesterdayMemory = [...memories]
    .reverse()
    .find((memory) => memory.diaryDate === yesterdayKey || String(memory.id || "").startsWith(yesterdayKey));

  const dailyMessages = [
    { title: "오늘의 첫 체크가 이번 주의 방향을 만들어요.", message: "가장 먼저 보이는 일정 하나를 끝내고, 나머지는 그다음에 생각해도 충분해요.", image: "assets/ollie-action.png" },
    { title: "시작한 순간부터 오늘 계획은 이미 움직이고 있어요.", message: "완벽한 시간보다 정해둔 시간에 첫 일정을 여는 것이 더 중요해요.", image: "assets/ollie-thinking.png" },
    { title: "중간에 속도가 달라도, 체크한 기록은 사라지지 않아요.", message: "지금 가능한 일정부터 완료하고 어려웠던 항목은 올리에게 알려주세요.", image: "assets/ollie-comfort.png" },
    { title: "오늘의 한 번이 목표까지 가는 리듬을 만들어요.", message: "타이머를 켜고 첫 일정에만 집중하면 다음 행동이 훨씬 선명해져요.", image: "assets/ollie-action.png" },
    { title: "이번 주에 쌓은 실행을 오늘 한 칸 더 이어가요.", message: "남은 일정 수보다 지금 체크할 수 있는 한 가지를 먼저 골라보세요.", image: "assets/ollie-celebrate.png" },
    { title: "오늘은 유지하는 것만으로도 충분히 좋은 실행이에요.", message: "가장 중요한 일정 하나를 지키고, 다음 주에 이어갈 기록을 남겨보세요.", image: "assets/ollie-comfort.png" },
    { title: "오늘의 기록이 다음 주 계획을 더 정확하게 만들어요.", message: "완료 여부와 기분을 남기면 올리가 다음 스케줄의 시간과 난이도를 맞출게요.", image: "assets/ollie-thinking.png" },
  ];

  let copy = dailyMessages[new Date().getDay()];
  let kicker = "OLLIE COACH · 오늘의 응원";

  if (yesterdayMemory) {
    kicker = "OLLIE COACH · 어제 기록을 읽었어요";
    const nextStep = String(yesterdayMemory.nextStep || "").trim();
    const obstacle = yesterdayMemory.obstacle || "none";

    if (nextStep) {
      copy = {
        title: `어제 정한 “${nextStep}”부터 시작해 볼까요?`,
        message: `어제의 실행률은 ${Number(yesterdayMemory.completion || 0)}%였어요. 오늘은 스케줄의 첫 행동으로 연결해 흐름을 이어가요.`,
        image: "assets/ollie-action.png",
      };
    } else if (obstacle === "time") {
      copy = { title: "어제 시간이 부족했으니, 오늘은 중요한 일정부터 지켜요.", message: "첫 일정에 타이머를 맞추고 끝낸 뒤 남은 시간에 따라 다음 일정을 선택해도 괜찮아요.", image: "assets/ollie-thinking.png" };
    } else if (obstacle === "energy" || isLowMemoryMood(yesterdayMemory.mood)) {
      copy = { title: "어제 마음이 무거웠던 만큼, 오늘은 첫 일정 하나에 집중해요.", message: "컨디션을 확인하면서 한 가지를 완료하고, 힘이 남으면 다음 일정으로 넘어가요.", image: "assets/ollie-comfort.png" };
    } else if (obstacle === "difficulty") {
      copy = { title: "어제 어려웠던 일은 오늘 완료 기준부터 확인해요.", message: "한 번에 전부 하려 하지 말고, 스케줄에 적힌 시간과 분량까지만 끝내보세요.", image: "assets/ollie-thinking.png" };
    } else if (Number(yesterdayMemory.completion || 0) >= 80) {
      copy = { title: "어제 만든 좋은 흐름을 오늘도 같은 순서로 이어가요.", message: "잘 맞았던 실행 시간과 순서를 유지하면 오늘의 체크도 자연스럽게 쌓일 거예요.", image: "assets/ollie-celebrate.png" };
    } else {
      copy = { title: "어제 남긴 기록 덕분에 오늘의 시작점이 선명해졌어요.", message: "가장 먼저 보이는 일정 하나를 체크하고, 끝난 뒤 난이도를 알려주세요.", image: "assets/ollie-action.png" };
    }
  }

  if (!dayPlan?.tasks?.length) {
    kicker = "OLLIE COACH · 계획된 휴식일";
    copy = { title: "오늘은 쉬어도 계획대로 가고 있어요.", message: "선택한 학습 가능 요일에 맞춰 비워둔 날이에요. 다음 학습일에 사용할 교재만 확인해 두세요.", image: "assets/ollie-comfort.png" };
  } else if (selectedCompletion.percent === 100) {
    kicker = "OLLIE COACH · 오늘 일정 완료";
    copy = { title: "오늘 스케줄을 모두 해냈어요. 이 흐름을 올리가 기억할게요!", message: "오늘의 기분과 잘된 점을 추억 카드에 남기면 내일 계획을 더 정확하게 맞출 수 있어요.", image: "assets/ollie-celebrate.png" };
  }

  if (dailyCoachKicker) dailyCoachKicker.textContent = kicker;
  dailyCoachTitle.textContent = copy.title;
  dailyCoachMessage.textContent = copy.message;
  if (dailyCoachImage) dailyCoachImage.src = copy.image;
}

function renderExecutionPage(bundle) {
  if (!executionGoal) return;

  const { plan, planText, schedule, state } = bundle;
  const period = schedule.length;
  const selectedDay = schedule[state.selectedDay - 1] || schedule[0];
  const selectedCompletion = getDayCompletion(selectedDay, state.checkedByDay);
  const overallProgress = getScheduleCompletion(schedule, state.checkedByDay);
  const completedDays = getCompletedDayCount(schedule, state.checkedByDay);
  const remainingTasks = selectedCompletion.total - selectedCompletion.completed;

  if (planEditor && planEditor.value !== planText) planEditor.value = planText;
  renderPlanPreview(planText, state.pendingPlanText || "", state.pendingRevisionSummary || {});
  const visibleRevisionRequest = state.pendingRevisionRequest || state.revisionRequest || "";
  if (planRevisionRequest && document.activeElement !== planRevisionRequest && planRevisionRequest.value !== visibleRevisionRequest) {
    planRevisionRequest.value = visibleRevisionRequest;
  }
  if (!revisionDetailDraftLoaded) {
    populateRevisionDetails(Object.keys(state.pendingRevisionDetails || {}).length ? state.pendingRevisionDetails : state.revisionDetails);
    revisionDetailDraftLoaded = true;
  }
  updateRevisionButtonState();
  if (planStatusBadge) planStatusBadge.textContent = state.pendingPlanText ? "변경안 대기" : state.status || "AI 제안";
  if (acceptPlanButton) acceptPlanButton.disabled = !state.pendingPlanText;
  if (keepPlanButton) keepPlanButton.disabled = !state.pendingPlanText;
  if (reviseAgainButton) reviseAgainButton.disabled = false;
  if (todayDateLabel) todayDateLabel.textContent = "Today";
  executionGoal.textContent = "오늘의 한 걸음";
  const isRestDay = selectedDay.tasks.length === 0;
  if (executionStyle) {
    const todayLabel = new Date().toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
      weekday: "long",
    });
    executionStyle.textContent = isRestDay ? `${todayLabel} · 계획된 휴식일` : `${todayLabel} · ${selectedCompletion.completed}/${selectedCompletion.total} 완료`;
  }
  if (executionPeriod) executionPeriod.textContent = plan.goal || `${period}일 목표`;
  if (executionDay) executionDay.textContent = `Day ${selectedDay.day} / ${period}`;
  if (executionStreak) executionStreak.textContent = `${completedDays}일 완료`;
  if (executionProgress) executionProgress.textContent = `${overallProgress}%`;
  if (executionProgressBar) {
    executionProgressBar.style.width = `${overallProgress}%`;
    executionProgressBar.parentElement?.style.setProperty("--journey-dot", `${overallProgress}%`);
  }
  if (selectedScheduleTitle) selectedScheduleTitle.textContent = isRestDay ? `${selectedDay.day}일차 · 계획된 휴식` : `${selectedDay.day}일차 AI 스케줄`;
  if (selectedScheduleMeta) selectedScheduleMeta.textContent = isRestDay ? "선택한 가능 요일에 맞춰 학습을 비워두었어요" : `${selectedCompletion.percent}% 완료 · ${remainingTasks}개 남음`;
  if (completeTodayButton) {
    completeTodayButton.disabled = isRestDay;
    completeTodayButton.textContent = isRestDay ? "오늘은 계획된 휴식일" : "오늘 계획 한 번에 완료";
  }

  if (executionMessage) {
    executionMessage.textContent =
      isRestDay
        ? "쉬는 날도 계획의 일부예요. 다음 학습일에 이어서 시작합니다."
        : selectedCompletion.percent === 100
        ? `${selectedDay.day}일차 계획을 모두 완료했어요. 올리와 다음 장소에 가까워졌습니다.`
        : `${selectedDay.day}일차 계획 ${remainingTasks}개가 남았어요. 체크할 때마다 완성률이 바로 반영됩니다.`;
  }

  renderChecklist(selectedDay, state);
  renderCalendar(schedule, state, plan);
  renderWeeklyPlan(schedule);
  renderRoutineInsight(plan);
  renderFocusTask(selectedDay, selectedCompletion);
  renderDailyCoach(state, selectedCompletion, selectedDay);
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

  try {
    const storedFocus = safeJsonParse(localStorage.getItem(focusSessionKey), null);
    if (storedFocus?.taskKey) {
      focusSession = { ...focusSession, ...storedFocus };
      if (focusSession.status === "running") {
        if (Number(focusSession.endAt) <= Date.now()) window.setTimeout(notifyFocusFinished, 0);
        else focusTimerInterval = window.setInterval(tickFocusTimer, 250);
      }
    }
  } catch (error) {
    console.warn("Unable to restore background focus timer", error);
  }
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
    showOllieStarShower(dayPlan.tasks[taskIndex]?.text);
    showToast("일정 하나를 완료했어요 · 올리의 별빛과 10 XP를 받았어요");
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
    showOllieStarShower("오늘의 AI 스케줄");
    showToast(`오늘 계획 완료 · 올리가 ${newlyCompleted * 10 + 8} XP를 얻었어요`);
    trackCompanionEvent("all_day_completed", { day: dayPlan.day, newlyCompleted });
  }
  renderExecutionPage(bundle);
});

scheduleCalendar?.addEventListener("click", (event) => {
  const button = event.target.closest(".calendar-day");
  if (!button || button.disabled || !button.dataset.day) return;

  const bundle = getPlanBundle();
  bundle.state.selectedDay = Number(button.dataset.day);
  calendarDetailOpen = true;
  savePlanBundleState(bundle.state);
  renderExecutionPage(bundle);
  calendarDayDetail?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

calendarDayDetailClose?.addEventListener("click", () => {
  calendarDetailOpen = false;
  if (calendarDayDetail) calendarDayDetail.hidden = true;
});

previousCalendarMonth?.addEventListener("click", () => {
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1);
  renderExecutionPage(getPlanBundle());
});

currentCalendarMonth?.addEventListener("click", () => {
  const today = new Date();
  calendarViewDate = new Date(today.getFullYear(), today.getMonth(), 1);
  const bundle = getPlanBundle();
  const todayPlanDay = getCalendarDayDifference(today, getPlanStartDate(bundle.plan, bundle.state)) + 1;
  if (todayPlanDay >= 1 && todayPlanDay <= bundle.schedule.length) {
    bundle.state.selectedDay = todayPlanDay;
    savePlanBundleState(bundle.state);
  }
  renderExecutionPage(bundle);
});

nextCalendarMonth?.addEventListener("click", () => {
  calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1);
  renderExecutionPage(getPlanBundle());
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
[...revisionDetailInputs, ...revisionDayInputs].forEach((input) => {
  input.addEventListener("input", updateRevisionButtonState);
  input.addEventListener("change", updateRevisionButtonState);
});

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

openEnergyChargeButton?.addEventListener("click", openEnergyCharge);
warningChargeButton?.addEventListener("click", openEnergyCharge);
closeEnergyChargeButton?.addEventListener("click", closeEnergyCharge);
energyChargeOverlay?.addEventListener("click", closeEnergyCharge);

energyPackButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const amount = Number(button.dataset.energyPack) || 0;
    if (!amount) return;
    chargeOllieEnergy(amount);
    trackCompanionEvent("energy_pack_purchased", { amount });
    window.setTimeout(() => {
      closeEnergyCharge();
      showToast(`올리 에너지 +${amount} 충전 완료 · 올리와의 대화와 계획 조정에 사용할 수 있어요`);
    }, 450);
  });
});

touchCompanionButton?.addEventListener("click", () => {
  const state = getCompanionState();
  const todayKey = getTodayKey();

  if (state.lastTouchedDate === todayKey) {
    pulseCompanion();
    pulseBondCompanion("♥ 포근");
    showToast("올리가 눈을 꼭 감고 좋아해요 · 오늘의 관계 XP는 이미 받았어요");
    if (companionMessage) companionMessage.textContent = "한 번 더 쓰다듬어 줬네요. 올리가 포근한 기분을 오래 기억할게요.";
    if (executionCompanionText) executionCompanionText.textContent = "올리가 눈을 꼭 감고 손길을 즐기고 있어요. XP와 관계없이 언제든 다시 쓰다듬을 수 있어요.";
    trackCompanionEvent("companion_touched_again", { touched: state.touched || 0 });
    return;
  }

  const previousLevel = state.level || 1;
  const nextState = {
    ...state,
    relationship: (state.relationship || 1) + 1,
    touched: (state.touched || 0) + 1,
    mood: "happy",
    lastTouchedDate: todayKey,
  };
  saveCompanionState(nextState);
  const rewardedState = addCompanionXp(5, "happy");
  pulseCompanion();
  pulseBondCompanion(rewardedState.level > previousLevel ? "♥ LEVEL UP" : "♥ +5 XP");
  showToast(
    rewardedState.level > previousLevel
      ? `올리와 한 단계 더 가까워졌어요 · ${getCompanionBondInfo(rewardedState).name}이 되었어요`
      : "올리의 마음이 포근해졌어요 · 관계 XP 5를 얻었어요",
  );
  if (companionMessage) companionMessage.textContent = "고마워요. 오늘의 손길을 기억하고 더 다정한 표정으로 곁에 있을게요.";
  trackCompanionEvent("companion_touched", { touched: nextState.touched });
  renderExecutionPage(getPlanBundle());
});

energyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const energy = button.dataset.energy;
    const state = getCompanionState();
    const copy = {
      good: { headline: "좋은 흐름이에요!", message: "좋아요. 지금 흐름이면 첫 번째 행동부터 바로 시작해도 괜찮겠어요." },
      normal: { headline: "무리하지 않아도 괜찮아요.", message: "보통인 날은 기준을 작게 잡으면 오래 갑니다." },
      tired: { headline: "지친 날은 줄이는 것도 실행이에요.", message: "지친 날은 하나만 남기고 나머지는 내일로 보내는 제안을 만들 수 있어요." },
    }[energy];

    saveCompanionState({ ...state, energy, mood: energy === "tired" ? "caring" : "ready" });
    energyButtons.forEach((item) => item.classList.toggle("active", item === button));
    if (companionChatResponse) companionChatResponse.textContent = copy.message;
    showOllieReaction(copy.message, copy.headline);
    addCompanionXp(2, "ready");
    trackCompanionEvent("chat_energy_selected", { energy });
  });
});

const encouragementLines = [
  "여기까지 온 것만으로도 충분히 잘하고 있어요. 오늘은 딱 5분만 저와 같이 시작해봐요!",
  "완벽하지 않아도 괜찮아요. 어제보다 한 걸음이면 우리는 앞으로 가고 있는 거예요.",
  "잘할 수 있어요. 제일 작은 것 하나만 끝내고 저한테 자랑해 주세요. 기다리고 있을게요!",
  "시작이 무거운 날일수록 기준을 작게 잡아요. 오늘의 한 걸음도 분명히 쌓이고 있어요.",
];

chatActionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.chatAction;

    if (action === "encourage") {
      const line = encouragementLines[Math.floor(Math.random() * encouragementLines.length)];
      if (companionChatResponse) companionChatResponse.textContent = line;
      addCompanionXp(2, "happy");
      showOllieReaction(line, "올리의 응원이에요!");
      trackCompanionEvent("quick_adjustment_selected", { action });
      return;
    }

    const preset = {
      shorten: {
        request: "오늘 할 일을 5~10분 단위의 더 짧은 행동으로 나눠줘.",
        headline: "더 작게, 더 가볍게 가요.",
        response: "좋아요, 오늘 할 일을 5~10분짜리 작은 조각으로 나누는 제안을 준비할게요. 부담부터 줄여봐요.",
      },
      "move-evening": {
        request: "오늘 실행 시간을 저녁으로 옮기고, 늦은 시간에도 부담 없는 순서로 다시 짜줘.",
        headline: "저녁형으로 바꿔볼게요.",
        response: "알겠어요, 오늘 일정은 저녁 시간대로 옮기는 제안을 만들게요. 늦게 시작해도 전혀 늦지 않아요.",
      },
      "one-task": {
        request: "오늘은 가장 중요한 한 가지 과제만 남기고 나머지는 내일 이후로 옮기는 제안을 해줘.",
        headline: "오늘은 딱 하나만 해요.",
        response: "오늘은 가장 중요한 하나만 남기는 제안을 준비할게요. 하나를 끝내는 게 열 개를 계획하는 것보다 힘이 세요.",
      },
    }[action];

    if (!preset) return;
    appendRevisionRequest(preset.request, preset.response);
    showOllieReaction(undefined, preset.headline);
    trackCompanionEvent("quick_adjustment_selected", { action });
  });
});

sendCompanionMessage?.addEventListener("click", async () => {
  const message = companionChatInput?.value.trim() || "";
  if (!message) {
    if (companionChatResponse) companionChatResponse.textContent = "하고 싶은 말을 한 줄만 적어도 충분해요.";
    return;
  }

  if (sendCompanionMessage.disabled) return;
  if (!consumeOllieEnergy(1, "올리와 대화")) return;

  appendRevisionRequest(`사용자 추가 요청: ${message}`, "올리가 답을 생각하고 있어요…");
  companionChatInput.value = "";
  showOllieReaction(undefined, "음, 잠깐만요…");
  addCompanionXp(3, "thinking");
  trackCompanionEvent("custom_revision_requested", { length: message.length });

  sendCompanionMessage.disabled = true;
  try {
    const { reply, headline } = await requestCompanionReply(message);
    if (companionChatResponse) companionChatResponse.textContent = reply;
    showOllieReaction(reply, headline || "올리의 대답이에요.");
    trackCompanionEvent("companion_dialogue", {
      user: message.slice(0, 160),
      reply: reply.slice(0, 240),
    });
  } catch (error) {
    refundOllieEnergy(1);
    const fallback = "지금은 답을 만들지 못했어요. 방금 이야기는 계획 수정 요청에 담아뒀고, 에너지는 돌려드렸어요. 잠시 후 다시 말 걸어주세요.";
    if (companionChatResponse) companionChatResponse.textContent = fallback;
    showOllieReaction(fallback, "잠시 생각을 고르고 있어요.");
  } finally {
    sendCompanionMessage.disabled = false;
  }
});

startFocusButton?.addEventListener("click", openFocusMode);
focusModeOverlay?.addEventListener("click", closeFocusMode);
closeFocusModeButton?.addEventListener("click", closeFocusMode);
finishFocusButton?.addEventListener("click", completeFocusTask);
focusTimerStartButton?.addEventListener("click", startFocusTimer);
focusTimerPauseButton?.addEventListener("click", pauseFocusTimer);
decreaseFocusTime?.addEventListener("click", () => adjustFocusMinutes(-5));
increaseFocusTime?.addEventListener("click", () => adjustFocusMinutes(5));
focusMinutesInput?.addEventListener("change", () => setFocusMinutes(focusMinutesInput.value));

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
    if (activeSheet === energyChargeSheet) closeEnergyCharge();
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
    revisionDetails: Object.keys(current.state.pendingRevisionDetails || {}).length ? current.state.pendingRevisionDetails : collectRevisionDetails(),
    weeklySchedule: current.state.pendingWeeklySchedule || [],
  });
  bundle.state.pendingPlanText = "";
  bundle.state.pendingRevisionRequest = "";
  bundle.state.pendingRevisionDetails = {};
  bundle.state.pendingRevisionSummary = {};
  bundle.state.pendingWeeklySchedule = [];
  bundle.state.status = "적용 완료";
  savePlanBundleState(bundle.state);
  if (planEditorMessage) planEditorMessage.textContent = "변경안을 적용했어요. 오늘 일정도 함께 업데이트했습니다.";
  showToast("변경안을 적용했어요 · 완료한 일정은 그대로 보호했어요");
  renderExecutionPage(bundle);
});

regeneratePlanButton?.addEventListener("click", async () => {
  const currentBundle = getPlanBundle();
  const baseText = planEditor?.value.trim() || currentBundle.state.planText || getDefaultPlanText(readExecutionPlan());
  const revisionRequest = planRevisionRequest?.value.trim() || "";
  const revisionDetails = collectRevisionDetails();
  if (!revisionRequest && !hasRevisionDetails(revisionDetails)) {
    updateRevisionButtonState();
    return;
  }
  if (!consumeOllieEnergy(3, "AI 계획 수정")) {
    openEnergyCharge();
    return;
  }

  const plan = currentBundle.plan || readExecutionPlan();
  const buttonMarkup = regeneratePlanButton.innerHTML;
  regeneratePlanButton.disabled = true;
  regeneratePlanButton.textContent = "올리가 AI 변경안을 만들고 있어요…";
  if (planEditorMessage) planEditorMessage.textContent = "추억과 실행 기록을 읽고 목표에 맞는 변경안을 설계하고 있어요.";
  trackCompanionEvent("ai_plan_revision_requested", {
    energy: 3,
    requestLength: revisionRequest.length,
    hasMaterials: Boolean(revisionDetails.materials),
    hasSchedule: Boolean(revisionDetails.schedule.weekdayMinutes || revisionDetails.schedule.weekendMinutes || revisionDetails.schedule.availableDays.length),
  });

  try {
    const revision = await requestAiPlanRevision({
      goal: plan.goal || "나의 목표",
      periodDays: Number(plan.period) || currentBundle.schedule.length || 30,
      currentState: plan.currentState || "현재 계획을 실행 중",
      planningStyle: plan.style || "실행 중심형",
      routine: {
        readiness: plan.routineReadiness || DEFAULT_ROUTINE_READINESS,
        preferredTime: plan.routineTime || "아침",
        existingRoutine: plan.currentRoutine || "기존 루틴",
      },
      currentPlanText: baseText,
      revisionRequest,
      revisionDetails,
      completedTasks: (currentBundle.state.completedLog || []).map((item) => item.text),
    });

    const revisedTasks = Array.isArray(revision.revisedTasks) ? revision.revisedTasks.map((task) => String(task).trim()).filter(Boolean) : [];
    if (revisedTasks.length < 3) throw new Error("AI 변경안의 실행 항목이 충분하지 않아요. 다시 시도해 주세요.");
    if (!Array.isArray(revision.weeklySchedule) || revision.weeklySchedule.length !== 7) {
      throw new Error("요일별 변경안을 모두 확인하지 못했어요. 다시 시도해 주세요.");
    }

    const customText = revisedTasks.map((task) => `- ${task}`).join("\n");
    const bundle = getPlanBundle();
    bundle.state.pendingPlanText = customText;
    bundle.state.pendingRevisionRequest = revisionRequest;
    bundle.state.pendingRevisionDetails = revisionDetails;
    bundle.state.pendingRevisionSummary = revision.revisionSummary || {};
    bundle.state.pendingWeeklySchedule = Array.isArray(revision.weeklySchedule) ? revision.weeklySchedule.slice(0, 7) : [];
    bundle.state.status = "AI 변경안 대기";
    savePlanBundleState(bundle.state);
    if (planEditorMessage) {
      const changes = Array.isArray(revision.changes) ? revision.changes.slice(0, 2).join(" · ") : "요청한 조건을 반영했어요.";
      const assumptions = Array.isArray(revision.revisionSummary?.assumptions) && revision.revisionSummary.assumptions.length
        ? ` 가정: ${revision.revisionSummary.assumptions.slice(0, 2).join(" · ")}`
        : "";
      planEditorMessage.textContent = `${revision.ollieMessage || "올리가 AI 변경안을 만들었어요."} ${changes}${assumptions} 아직 적용 전이며, 아래에서 확인 후 승인할 수 있어요.`;
    }
    showToast("AI 변경안이 준비됐어요 · 확인 후 적용하기를 눌러 주세요");
    trackCompanionEvent("ai_plan_revision_ready", { energy: 3, taskCount: revisedTasks.length });
    renderExecutionPage(bundle);
  } catch (error) {
    refundOllieEnergy(3);
    if (planEditorMessage) planEditorMessage.textContent = `${error.message || "AI 변경안을 만들지 못했어요."} 사용한 올리 에너지는 돌려드렸어요.`;
    showToast("AI 변경안을 만들지 못했어요 · 올리 에너지 3을 돌려드렸어요");
    trackCompanionEvent("ai_plan_revision_failed", { message: String(error.message || error).slice(0, 160) });
  } finally {
    regeneratePlanButton.innerHTML = buttonMarkup;
    updateRevisionButtonState();
  }
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
  bundle.state.pendingRevisionDetails = {};
  bundle.state.pendingRevisionSummary = {};
  bundle.state.pendingWeeklySchedule = [];
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
