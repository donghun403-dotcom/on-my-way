(() => {
  "use strict";

  const STORAGE_KEY = "onmyway:prototype:core-loop-v2";
  const VALID_SCREENS = new Set([
    "goal",
    "roadmap",
    "adjust",
    "changes",
    "locked",
    "today",
    "focus",
    "reflection",
    "growth",
    "recovery",
    "plan",
    "record",
  ]);

  const DEFAULT_TASK = Object.freeze({
    id: "prototype-action-001",
    type: "ACTION",
    title: "사용자 한 명의 불편을 한 문장으로 적기",
    durationMinutes: 15,
    completionRule: "문제 문장 하나를 저장하면 완료",
  });

  const DEFAULT_STATE = Object.freeze({
    version: 1,
    screen: "goal",
    goal: "3개월 안에 작은 온라인 서비스를 출시하고 싶어요.",
    period: "3개월",
    context: "아이디어는 있지만 개발 경험은 없어요.",
    pendingChanges: [],
    appliedChanges: [],
    roadmapRevision: 0,
    roadmapLocked: false,
    scheduleMode: "월·수·금",
    aiCalls: { generation: 0, revision: 0 },
    task: DEFAULT_TASK,
    taskCompleted: false,
    diary: [],
    growthCount: 0,
    selectedMood: "",
    recoveryChoice: "",
  });

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!parsed || parsed.version !== DEFAULT_STATE.version) return clone(DEFAULT_STATE);
      return {
        ...clone(DEFAULT_STATE),
        ...parsed,
        aiCalls: { ...DEFAULT_STATE.aiCalls, ...(parsed.aiCalls || {}) },
        task: { ...DEFAULT_TASK, ...(parsed.task || {}) },
        pendingChanges: Array.isArray(parsed.pendingChanges) ? parsed.pendingChanges : [],
        appliedChanges: Array.isArray(parsed.appliedChanges) ? parsed.appliedChanges : [],
        diary: Array.isArray(parsed.diary) ? parsed.diary : [],
      };
    } catch {
      return clone(DEFAULT_STATE);
    }
  }

  const params = new URLSearchParams(location.search);
  if (params.get("reset") === "1") localStorage.removeItem(STORAGE_KEY);
  let state = readState();
  let failNextRevision = false;
  let lastDialogOpener = null;

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value;
  }

  function showToast(message) {
    const toast = $("#prototypeToast");
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => {
      toast.hidden = true;
    }, 2200);
  }

  function showScreen(screen, options = {}) {
    if (!VALID_SCREENS.has(screen)) return;
    $$(".prototype-screen").forEach((section) => {
      const active = section.dataset.screen === screen;
      section.hidden = !active;
      section.classList.toggle("is-active", active);
    });
    state.screen = screen;
    document.body.dataset.prototypeScreen = screen;

    const tabs = $("#prototypeTabs");
    const showTabs =
      state.roadmapLocked &&
      !["goal", "roadmap", "adjust", "changes", "locked", "focus", "reflection", "recovery"].includes(screen);
    tabs.hidden = !showTabs;
    $$("[data-tab]").forEach((button) => {
      if (button.dataset.tab === screen) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });

    if (options.persist !== false) persist();
    if (options.scroll !== false) window.scrollTo({ top: 0, behavior: "auto" });
  }

  function renderPendingChanges() {
    const list = $("#pendingChangeList");
    const count = $("#pendingCount");
    list.replaceChildren();
    count.textContent = `${state.pendingChanges.length}개`;

    if (!state.pendingChanges.length) {
      const item = document.createElement("li");
      item.className = "empty-pending";
      item.textContent = "아직 모아둔 내용이 없어요.";
      list.append(item);
    } else {
      state.pendingChanges.forEach((change, index) => {
        const item = document.createElement("li");
        const text = document.createElement("span");
        const remove = document.createElement("button");
        text.textContent = change;
        remove.type = "button";
        remove.dataset.removeChange = String(index);
        remove.setAttribute("aria-label", `${change} 삭제`);
        remove.textContent = "×";
        item.append(text, remove);
        list.append(item);
      });
    }

    $("#applyChanges").disabled = state.pendingChanges.length === 0;
    $$("[data-change]").forEach((button) => {
      button.setAttribute("aria-pressed", String(state.pendingChanges.includes(button.dataset.change)));
    });
  }

  function firstWeekItems() {
    const duration = state.task.durationMinutes;
    const rows = [
      { day: "월", id: state.task.id, type: "ACTION", title: state.task.title, meta: `${duration}분` },
      { day: "화", id: "prototype-tip-001", type: "TIP", title: "불편을 발견할 때 행동과 감정을 함께 적어보기", meta: "팁" },
      { day: "수", id: "prototype-action-002", type: "ACTION", title: "문제 후보 세 개를 한 줄씩 비교하기", meta: `${duration}분` },
      { day: "목", id: "prototype-review-001", type: "REVIEW", title: "가장 자주 나타난 불편인지 점검하기", meta: "점검" },
      { day: "금", id: "prototype-action-003", type: "ACTION", title: "핵심 문제 하나를 선택하고 이유 남기기", meta: `${duration}분` },
      { day: "토", id: "prototype-system-001", type: "SYSTEM_RULE", title: "밀린 일정 자동 이동 기준", meta: "앱 규칙" },
      { day: "일", id: "prototype-rest-001", type: "TIP", title: "쉬는 날에도 생각난 점만 가볍게 메모하기", meta: "선택" },
    ];
    if (state.scheduleMode === "화·목·토") {
      rows[0].day = "화";
      rows[2].day = "목";
      rows[4].day = "토";
    }
    return rows;
  }

  function renderWeek(targetSelector) {
    const target = $(targetSelector);
    target.replaceChildren();
    firstWeekItems()
      .filter((item) => item.type !== "SYSTEM_RULE")
      .forEach((item) => {
        const row = document.createElement("article");
        row.className = "week-row";
        row.dataset.taskId = item.id;
        row.dataset.itemType = item.type;
        const day = document.createElement("span");
        const content = document.createElement("div");
        const title = document.createElement("strong");
        const type = document.createElement("small");
        const meta = document.createElement("em");
        day.textContent = item.day;
        title.textContent = item.title;
        type.textContent = item.type;
        meta.textContent = item.meta;
        content.append(title, type);
        row.append(day, content, meta);
        target.append(row);
      });
  }

  function renderDiary() {
    const target = $("#diaryList");
    target.replaceChildren();
    if (!state.diary.length) {
      const empty = document.createElement("article");
      empty.className = "empty-diary";
      empty.innerHTML = "<time>아직</time><div><strong>첫 걸음을 완료하면 자동으로 기록돼요.</strong><p>감정과 메모는 선택이에요.</p></div><span>☁️</span>";
      target.append(empty);
      return;
    }
    state.diary
      .slice()
      .reverse()
      .forEach((entry) => {
        const article = document.createElement("article");
        const time = document.createElement("time");
        const content = document.createElement("div");
        const title = document.createElement("strong");
        const note = document.createElement("p");
        const icon = document.createElement("span");
        time.dateTime = entry.completedAt;
        time.textContent = "오늘";
        title.textContent = entry.title;
        note.textContent = entry.note || entry.mood || "완료 기록은 글 없이도 자동으로 남아요.";
        icon.textContent = "🌱";
        content.append(title, note);
        article.append(time, content, icon);
        target.append(article);
      });
  }

  function renderState() {
    $("#prototypeGoal").value = state.goal;
    $("#prototypeContext").value = state.context;
    const period = $(`input[name="period"][value="${CSS.escape(state.period)}"]`);
    if (period) period.checked = true;
    setText("#roadmapGoal", state.goal);
    setText("#todayActionTitle", state.task.title);
    setText("#focusTask", state.task.title);
    setText("#focusMinutes", state.task.durationMinutes);
    $("#editTaskTitle").value = state.task.title;
    $("#editTaskMinutes").value = state.task.durationMinutes;
    renderPendingChanges();
    renderWeek("#firstWeek");
    renderWeek("#planWeekList");
    renderDiary();
    showScreen(state.screen, { persist: false, scroll: false });
  }

  function addPendingChange(change) {
    const normalized = String(change || "").trim();
    if (!normalized || state.pendingChanges.includes(normalized)) return;
    state.pendingChanges.push(normalized);
    $("#revisionError").hidden = true;
    persist();
    renderPendingChanges();
  }

  function openDialog(dialog, opener) {
    lastDialogOpener = opener;
    dialog.showModal();
  }

  function restoreDialogFocus() {
    if (lastDialogOpener?.isConnected) lastDialogOpener.focus();
    lastDialogOpener = null;
  }

  $("#goalForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    if (event.submitter?.disabled) return;
    if (event.submitter) event.submitter.disabled = true;
    state.goal = $("#prototypeGoal").value.trim();
    state.period = $('input[name="period"]:checked').value;
    state.context = $("#prototypeContext").value.trim();
    state.aiCalls.generation += 1;
    state.roadmapRevision = 1;
    setText("#roadmapGoal", state.goal);
    showScreen("roadmap");
  });

  $$("[data-next]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.next));
  });

  $$("[data-detail]").forEach((button) => {
    button.addEventListener("click", () => showToast("Roadmap의 방향을 설명하는 상세예요. 아직 일정은 아니에요."));
  });

  $$("[data-change]").forEach((button) => {
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      const change = button.dataset.change;
      const existing = state.pendingChanges.indexOf(change);
      if (existing >= 0) state.pendingChanges.splice(existing, 1);
      else state.pendingChanges.push(change);
      persist();
      renderPendingChanges();
    });
  });

  $("#addChange").addEventListener("click", () => {
    addPendingChange($("#changeInput").value);
    $("#changeInput").value = "";
    $("#changeInput").focus();
  });

  $("#pendingChangeList").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-change]");
    if (!remove) return;
    state.pendingChanges.splice(Number(remove.dataset.removeChange), 1);
    persist();
    renderPendingChanges();
  });

  $("#applyChanges").addEventListener("click", (event) => {
    if (!state.pendingChanges.length || event.currentTarget.disabled) return;
    event.currentTarget.disabled = true;
    $("#revisionError").hidden = true;
    state.aiCalls.revision += 1;

    if (failNextRevision || state.pendingChanges.some((item) => item.includes("[실패 fixture]"))) {
      failNextRevision = false;
      persist();
      $("#revisionError").hidden = false;
      renderPendingChanges();
      return;
    }

    state.roadmapRevision += 1;
    state.appliedChanges = [...state.pendingChanges];
    state.pendingChanges = [];
    $("#appliedChangeList").replaceChildren(
      ...state.appliedChanges.map((change) => {
        const item = document.createElement("li");
        item.textContent = change;
        return item;
      }),
    );
    showScreen("changes");
  });

  $("#lockRoadmap").addEventListener("click", () => {
    state.roadmapLocked = true;
    renderWeek("#firstWeek");
    renderWeek("#planWeekList");
    showScreen("locked");
  });

  $("#changeDays").addEventListener("click", () => {
    state.scheduleMode = state.scheduleMode === "월·수·금" ? "화·목·토" : "월·수·금";
    renderWeek("#firstWeek");
    renderWeek("#planWeekList");
    persist();
    showToast(`${state.scheduleMode} 일정으로 바꿨어요. AI는 호출하지 않았어요.`);
  });

  $("#reduceTime").addEventListener("click", () => {
    state.task.durationMinutes = Math.max(5, state.task.durationMinutes - 5);
    renderState();
    showToast(`${state.task.durationMinutes}분으로 줄였어요. AI는 호출하지 않았어요.`);
  });

  $("#startPlan").addEventListener("click", () => showScreen("today"));
  $("#startAction").addEventListener("click", () => showScreen("focus"));

  $("#pauseFocus").addEventListener("click", (event) => {
    const pressed = event.currentTarget.getAttribute("aria-pressed") === "true";
    event.currentTarget.setAttribute("aria-pressed", String(!pressed));
    event.currentTarget.textContent = pressed ? "잠시 멈춤" : "다시 이어가기";
  });

  $("#shortenFocus").addEventListener("click", () => {
    state.task.durationMinutes = 5;
    setText("#focusMinutes", "5");
    persist();
  });

  $("#completeAction").addEventListener("click", () => {
    if (!state.taskCompleted) {
      state.taskCompleted = true;
      state.growthCount += 1;
      state.diary.push({
        id: `diary-${state.task.id}`,
        taskId: state.task.id,
        title: state.task.title,
        completedAt: new Date().toISOString(),
        mood: "",
        note: "",
      });
    }
    state.selectedMood = "";
    $("#diaryNote").value = "";
    $$(".mood-picker button").forEach((button) => button.setAttribute("aria-pressed", "false"));
    renderDiary();
    showScreen("reflection");
  });

  $$(".mood-picker button").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedMood = button.dataset.mood;
      $$(".mood-picker button").forEach((choice) => {
        choice.setAttribute("aria-pressed", String(choice === button));
      });
      persist();
    });
  });

  $("#seeGrowth").addEventListener("click", () => {
    const entry = state.diary.find((item) => item.taskId === state.task.id);
    if (entry) {
      entry.mood = state.selectedMood;
      entry.note = $("#diaryNote").value.trim();
    }
    renderDiary();
    showScreen("growth");
  });

  $$("[data-recovery]").forEach((button) => {
    button.addEventListener("click", () => {
      state.recoveryChoice = button.dataset.recovery;
      const status = $("#recoveryStatus");
      status.hidden = false;
      status.textContent =
        button.dataset.recovery === "rest"
          ? "쉬는 날도 길의 일부로 남겼어요. 내일 같은 자리에서 다시 만나요."
          : button.dataset.recovery === "talk"
            ? "지금 상태를 말해 준 것도 다시 시작한 기록이에요."
            : "작은 무지개가 떴어요. 다시 시작한 오늘도 성장으로 남겼어요.";
      persist();
    });
  });

  $$("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.tab));
  });

  const taskEditSheet = $("#taskEditSheet");
  $("#editTask").addEventListener("click", (event) => openDialog(taskEditSheet, event.currentTarget));
  taskEditSheet.addEventListener("close", restoreDialogFocus);
  taskEditSheet.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.submitter?.value === "cancel") {
      taskEditSheet.close("cancel");
      return;
    }
    const title = $("#editTaskTitle").value.trim();
    const minutes = Number($("#editTaskMinutes").value);
    if (!title || !Number.isFinite(minutes)) return;
    state.task.title = title;
    state.task.durationMinutes = Math.min(60, Math.max(5, minutes));
    setText("#todayActionTitle", state.task.title);
    setText("#focusTask", state.task.title);
    setText("#focusMinutes", state.task.durationMinutes);
    renderWeek("#firstWeek");
    renderWeek("#planWeekList");
    persist();
    taskEditSheet.close();
  });

  const planAdjustSheet = $("#planAdjustSheet");
  $("#adjustPlan").addEventListener("click", (event) => openDialog(planAdjustSheet, event.currentTarget));
  planAdjustSheet.addEventListener("close", restoreDialogFocus);
  planAdjustSheet.addEventListener("submit", (event) => {
    event.preventDefault();
    if (event.submitter?.value === "cancel") {
      planAdjustSheet.close("cancel");
      return;
    }
    state.scheduleMode = state.scheduleMode === "월·수·금" ? "화·목·토" : "월·수·금";
    renderWeek("#firstWeek");
    renderWeek("#planWeekList");
    persist();
    planAdjustSheet.close();
  });

  async function verifyBrandFont() {
    if (!document.fonts) {
      document.body.dataset.fontState = "unsupported";
      console.warn("Brand font verification is unavailable in this browser.");
      return;
    }
    try {
      await document.fonts.load('32px "여기어때 잘난체"', "올리가 함께 걸어요");
      const loaded = document.fonts.check('32px "여기어때 잘난체"', "올리가 함께 걸어요");
      document.body.dataset.fontState = loaded ? "loaded" : "failed";
      if (!loaded) console.warn("Brand font failed to load: 여기어때 잘난체");
    } catch {
      document.body.dataset.fontState = "failed";
      console.warn("Brand font failed to load: 여기어때 잘난체");
    }
  }

  function seedScreen(screen) {
    state = clone(DEFAULT_STATE);
    state.goal = "3개월 안에 작은 온라인 서비스를 출시하고 싶어요.";
    state.roadmapRevision = screen === "goal" ? 0 : 1;
    if (screen === "adjust") {
      state.pendingChanges = ["수요일은 할 수 없어요", "평일에는 하루 20분만 가능해요"];
    }
    if (["changes", "locked", "today", "focus", "reflection", "growth", "recovery", "plan", "record"].includes(screen)) {
      state.aiCalls.generation = 1;
      state.aiCalls.revision = 1;
      state.appliedChanges = ["수요일 제외", "첫 달 분량 축소", "금요일 짧은 복습"];
    }
    if (["locked", "today", "focus", "reflection", "growth", "recovery", "plan", "record"].includes(screen)) {
      state.roadmapLocked = true;
    }
    if (["reflection", "growth", "recovery", "record"].includes(screen)) {
      state.taskCompleted = true;
      state.growthCount = 1;
      state.diary = [
        {
          id: `diary-${state.task.id}`,
          taskId: state.task.id,
          title: state.task.title,
          completedAt: "2026-07-24T09:00:00.000Z",
          mood: "괜찮았어요",
          note: "문제를 작게 적으니 다음 행동이 선명해졌어요.",
        },
      ];
    }
    state.screen = screen;
  }

  const requestedScreen = params.get("state");
  if (requestedScreen && VALID_SCREENS.has(requestedScreen)) seedScreen(requestedScreen);
  renderState();
  verifyBrandFont();

  window.__coreLoopPrototype = Object.freeze({
    getState: () => clone(state),
    getAiCallCount: () => clone(state.aiCalls),
    showScreen: (screen) => showScreen(screen),
    failNextRevision: () => {
      failNextRevision = true;
    },
    reset: () => {
      localStorage.removeItem(STORAGE_KEY);
      state = clone(DEFAULT_STATE);
      $("#goalForm .primary-action").disabled = false;
      renderState();
    },
  });
})();
