const accountState = document.querySelector("#accountState");
const form = document.querySelector("#deleteAccountForm");
const loginAction = document.querySelector("#loginAction");
const accountName = document.querySelector("#accountName");
const confirmation = document.querySelector("#deleteConfirmation");
const agreement = document.querySelector("#deleteAgreement");
const button = document.querySelector("#deleteAccountButton");
const status = document.querySelector("#deleteStatus");

async function loadAccount() {
  try {
    const response = await fetch("/api/auth/me", { credentials: "same-origin", headers: { Accept: "application/json" } });
    const data = await response.json();
    accountState.hidden = true;
    if (!data.user) {
      loginAction.hidden = false;
      return;
    }
    accountName.textContent = data.user.email || data.user.name || "현재";
    form.hidden = false;
  } catch {
    accountState.textContent = "로그인 상태를 확인하지 못했습니다. 잠시 후 새로고침해 주세요.";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.classList.remove("error");
  if (confirmation.value.trim() !== "계정 삭제" || !agreement.checked) {
    status.textContent = "확인 문구와 동의 항목을 확인해 주세요.";
    status.classList.add("error");
    return;
  }
  button.disabled = true;
  button.textContent = "삭제 요청 중…";
  try {
    const response = await fetch("/api/account/delete", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ confirmation: confirmation.value.trim() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "계정 삭제 요청을 처리하지 못했습니다.");
    localStorage.clear();
    sessionStorage.clear();
    const scheduledAt = Number(data.deletionScheduledAt || 0);
    const scheduledText = scheduledAt
      ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short" }).format(new Date(scheduledAt))
      : "요청 후 7일 이내";
    form.innerHTML = `<div class="notice"><strong>탈퇴 요청이 완료되었습니다.</strong><br>로그인 연결·세션·서버 동기화 데이터는 즉시 삭제됐고, 재가입 방지용 최소 표식은 ${scheduledText}에 삭제됩니다.</div><p>다른 기기에 남은 브라우저 저장 데이터는 해당 기기에서 사이트 데이터를 삭제해 주세요.</p><p><a href="/">On My Way 홈으로 돌아가기</a></p>`;
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
    button.disabled = false;
    button.textContent = "계정 영구 삭제 요청";
  }
});

loadAccount();
