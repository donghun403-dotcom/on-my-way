import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/Users/dongh/Desktop/On_My_Way_출시준비_체크리스트.xlsx";
const outputDir = "../../outputs/019f650b-0b7c-7be0-86a9-99c57a265aac";
const outputPath = `${outputDir}/On_My_Way_출시준비_체크리스트_진행점검.xlsx`;
const previewDir = "./previews-after";
const checkedAt = new Date("2026-07-15T00:00:00+09:00");
const latestProductionRun = "https://github.com/donghun403-dotcom/on-my-way/actions/runs/29404083728";
const mainCodeUrl = "https://github.com/donghun403-dotcom/on-my-way/tree/6245a778b06ac5b4aa0273cba4a120257923cc62";
const currentPrUrl = "https://github.com/donghun403-dotcom/on-my-way/pull/6";

const input = await FileBlob.load(sourcePath);
const workbook = await SpreadsheetFile.importXlsx(input);
const checklist = workbook.worksheets.getItem("전체 체크리스트");
const dashboard = workbook.worksheets.getItem("대시보드");
const checklistTable = checklist.tables.items[0];

const rows = checklist.getRange("A6:M87").values;
const rowById = new Map(rows.map((row, index) => [row[0], index + 6]));

function updateItem(id, changes) {
  const row = rowById.get(id);
  if (!row) throw new Error(`Checklist item not found: ${id}`);
  const columnByKey = { status: "F", owner: "G", targetDate: "H", evidence: "I", link: "J", updatedAt: "M" };
  for (const [key, value] of Object.entries(changes)) {
    const column = columnByKey[key];
    if (!column) continue;
    checklist.getRange(`${column}${row}`).values = [[value]];
  }
}

for (const id of ["C02", "C03", "C04", "C05"]) {
  updateItem(id, { link: latestProductionRun, updatedAt: checkedAt });
}

updateItem("W03", {
  status: "확인 필요",
  owner: "사용자 QA",
  evidence: "운영 health는 AI 준비=true · 실제 Google 계정의 AI 계획 생성은 수동 확인 필요",
  link: latestProductionRun,
  updatedAt: checkedAt,
});
updateItem("W05", {
  status: "진행 중",
  owner: "사용자 QA",
  evidence: "자동 교차계정 E2E는 통과 · 실제 계정 A/B 수동 검증 필요",
  link: latestProductionRun,
  updatedAt: checkedAt,
});
updateItem("W10", {
  status: "진행 중",
  owner: "운영자",
  evidence: "purge 코드·자동화 테스트 완료 · 운영 Cron의 실제 영구 삭제 기록 확인 필요",
  link: `${mainCodeUrl}/auth-service.mjs`,
  updatedAt: checkedAt,
});
for (const id of ["W11", "W12", "W13"]) {
  updateItem(id, {
    owner: "Codex",
    evidence: "현재는 미설정 Provider 버튼을 숨기지 않고 클릭 후 오류 안내 · UI 수정 필요",
    link: `${mainCodeUrl}/script.js`,
    updatedAt: checkedAt,
  });
}
updateItem("W14", {
  status: "진행 중",
  owner: "사용자 QA",
  evidence: "callback URL 정리 자동 테스트 통과 · 운영 브라우저 주소창 수동 확인 필요",
  link: latestProductionRun,
  updatedAt: checkedAt,
});
updateItem("W15", {
  status: "진행 중",
  owner: "사용자 QA",
  evidence: "비밀값 노출 방지 코드·테스트 존재 · 운영 DevTools Console/Network 수동 확인 필요",
  link: latestProductionRun,
  updatedAt: checkedAt,
});
updateItem("W20", {
  status: "확인 필요",
  owner: "운영자",
  evidence: "저장소·GitHub Actions에서는 외부 uptime monitor 설정을 확인할 수 없음",
  link: "https://onmyway.olivenrich.com/api/health",
  updatedAt: checkedAt,
});
updateItem("W21", {
  status: "확인 필요",
  owner: "운영자",
  evidence: "OAuth·AI·Worker·Cron 알림 규칙은 Cloudflare/모니터링 서비스에서 확인 필요",
  link: latestProductionRun,
  updatedAt: checkedAt,
});
updateItem("W22", {
  status: "완료",
  owner: "Codex",
  evidence: "배포·결제 문서에 main 전용 배포와 긴급 롤백 절차 기록",
  link: "https://github.com/donghun403-dotcom/on-my-way/blob/main/docs/deployment.md",
  updatedAt: checkedAt,
});
updateItem("W23", {
  status: "진행 중",
  owner: "Codex",
  evidence: "auth 문서는 구현됨 · Preview URI(PR #3 고정)와 최신 정책 기준 정리 필요",
  link: "https://github.com/donghun403-dotcom/on-my-way/blob/main/docs/auth-setup.md",
  updatedAt: checkedAt,
});
updateItem("W24", {
  status: "진행 중",
  owner: "사용자 QA",
  evidence: "Production 자동 route smoke 성공 · 실계정 로그인·실제 AI·모바일 수동 smoke 필요",
  link: latestProductionRun,
  updatedAt: checkedAt,
});
updateItem("W25", {
  owner: "사용자",
  evidence: "W03·W05·W10·W11~W15·W20~W24 완료 후 GO 승인",
  link: currentPrUrl,
  updatedAt: checkedAt,
});

const newItems = [
  ["W26", "무료 웹", "P0", "코드·배포", "PR #6을 최신 main 기준으로 재작성하고 충돌·대규모 회귀 제거", "미완료", "Codex", null, "현재 PR #6은 DRAFT·CONFLICTING이며 main의 가격/크레딧 구현을 대량 제거", currentPrUrl, null, null, checkedAt],
  ["W27", "무료 웹", "P0", "품질", "재작성한 정책 수정 PR의 전체 Preview 검사 통과", "미완료", "Codex", null, "현재 head ff33b5d에는 status check 없음", currentPrUrl, null, null, checkedAt],
  ["W28", "무료 웹", "P0", "출시", "병합 후 Production 성공 및 마이페이지·가격 정책 운영 확인", "미완료", "사용자 QA", null, "최신 운영 배포는 main 6245a77 기준 · PR #6 정책 수정은 미반영", latestProductionRun, null, null, checkedAt],
];
checklistTable.rows.add(null, newItems);

checklist.getRange("K6").formulas = [["=IFERROR(INDEX('대시보드'!$B$43:$B$47,MATCH(F6,'대시보드'!$A$43:$A$47,0)),0)"]];
checklist.getRange("K6:K90").fillDown();
checklist.getRange("L6").formulas = [["=IF(AND(C6=\"P0\",F6<>\"완료\",F6<>\"해당 없음\"),\"차단\",\"\")"]];
checklist.getRange("L6:L90").fillDown();
checklist.getRange("M88:M90").format.numberFormat = "yyyy-mm-dd";

dashboard.getRange("A3").values = [["기준일 2026-07-15 · Codex가 저장소·GitHub·운영 배포 증거를 대조했습니다."]];
dashboard.getRange("A11").values = [["main 운영 배포는 성공했지만 PR #6은 DRAFT·CONFLICTING이며 최신 main의 가격·AI 크레딧 구현을 대량 제거하므로 그대로 병합하면 안 됩니다. 무료 웹 베타는 PR 재작성, 실계정 AI·격리·보안 QA, Provider 숨김, Cron·운영 감시 확인 후 GO입니다."]];
dashboard.getRange("A32:A39").values = [["W26"], ["W03"], ["W05"], ["W10"], ["W11"], ["W20"], ["W21"], ["W24"]];

const summary = workbook.worksheets.getOrAdd("Codex 점검 결과");
summary.showGridLines = false;
summary.freezePanes.freezeRows(4);
summary.getRange("A1:H2").merge();
summary.getRange("A1").values = [["On My Way 출시 준비 · Codex 점검 결과"]];
summary.getRange("A3:H3").merge();
summary.getRange("A3").values = [["점검일 2026-07-15 · GitHub main/PR/Actions와 저장소 구현을 기준으로 확인"]];

summary.getRange("A5:H5").merge();
summary.getRange("A5").values = [["현재 확인된 상태"]];
summary.getRange("A6:A9").values = [["운영 배포"], ["main 정책"], ["PR #6"], ["출시 판단"]];
summary.getRange("B6:H9").merge(true);
summary.getRange("B6:B9").values = [
  ["Production run 29404083728 성공 · main 6245a77 운영 반영"],
  ["Free/Pro 가격·AI 크레딧 정책 PR #5 병합 완료 · 운영 결제는 비활성"],
  ["DRAFT · CONFLICTING · 최신 head 검사 없음 · 그대로 병합 금지"],
  ["무료 웹 베타 HOLD · 스토어 HOLD · 유료 정식 출시 HOLD"],
];

summary.getRange("A11:H11").merge();
summary.getRange("A11").values = [["당신이 지금 할 일 · 권장 순서"]];
summary.getRange("A12:H20").values = [
  [1, "코드", "W26", "PR #6은 병합하지 말고 최신 main 기준으로 정책 변경만 재작성", null, null, null, null],
  [2, "품질", "W27", "재작성 PR의 Preview 전체 검사와 회귀 테스트 통과 확인", null, null, null, null],
  [3, "실계정 QA", "W03/W05", "Google 실계정으로 실제 AI 계획 생성과 계정 A/B 격리 수동 확인", null, null, null, null],
  [4, "인증 UI", "W11~W15", "미설정 Kakao·Naver·Apple 숨김 후 주소창·DevTools 비밀값 노출 확인", null, null, null, null],
  [5, "운영", "W10/W20/W21", "Cron 영구 삭제 로그, 홈페이지·health 감시, OAuth·AI·Worker 알림 확인", null, null, null, null],
  [6, "출시 QA", "W24/W25/W28", "모바일 포함 최종 smoke 후 무료 웹 베타 GO 승인", null, null, null, null],
  [7, "스토어", "S02/S03", "Apple Developer와 Google Play Console 가입·신원 확인부터 진행", null, null, null, null],
  [8, "유료", "P01~P03", "사업자·통신판매업, Toss 운영 MID, 정기결제·환불 문구 확정", null, null, null, null],
  [9, "유료", "P04~P12", "법률·결제·스토어 선행 조건 전까지 PAYMENTS_ENABLED=false 유지", null, null, null, null],
];
summary.getRange("D12:H20").merge(true);

summary.getRange("A22:H22").merge();
summary.getRange("A22").values = [["출시 판정"]];
summary.getRange("A23:C26").values = [
  ["게이트", "판정", "핵심 이유"],
  ["무료 웹 베타", "HOLD", "PR #6 충돌 + 실계정/보안/감시 확인 미완료"],
  ["스토어 베타", "HOLD", "개발자 계정·패키징·서명·실기기 QA 미완료"],
  ["유료 정식 출시", "HOLD", "사업·법률·Toss/스토어 결제 선행 조건 미완료"],
];

summary.getRange("E22:H22").merge();
summary.getRange("E22").values = [["자동 요약"]];
summary.getRange("E23:F27").values = [
  ["항목", "건수"],
  ["완료", null],
  ["진행 중", null],
  ["확인 필요", null],
  ["P0 출시 차단", null],
];
summary.getRange("F24").formulas = [["=COUNTIF('전체 체크리스트'!$F$6:$F$105,E24)"]];
summary.getRange("F24:F26").fillDown();
summary.getRange("F27").formulas = [["='대시보드'!B21"]];

summary.getRange("A29:H30").merge();
summary.getRange("A29").values = [[`근거: ${currentPrUrl} · ${latestProductionRun} · ${mainCodeUrl}`]];

const navy = "#24324B";
const lightBlue = "#DDECF8";
const paleGreen = "#E8F5F0";
const paleYellow = "#FFF4CE";
const paleRed = "#FFE7E2";
const border = { preset: "outside", style: "thin", color: "#DCE3EA" };

summary.getRange("A1:H2").format = { fill: navy, font: { bold: true, color: "#FFFFFF", fontSize: 20 }, verticalAlignment: "center" };
summary.getRange("A3:H3").format = { fill: "#F7F8FA", font: { italic: true, color: "#6B7280", fontSize: 10 }, verticalAlignment: "center" };
for (const range of ["A5:H5", "A11:H11", "A22:H22", "E22:H22"]) {
  summary.getRange(range).format = { fill: navy, font: { bold: true, color: "#FFFFFF", fontSize: 11 }, verticalAlignment: "center" };
}
summary.getRange("A6:A9").format = { fill: lightBlue, font: { bold: true, color: navy }, verticalAlignment: "center", borders: border };
summary.getRange("B6:H9").format = { fill: "#FFFFFF", font: { color: "#374151" }, wrapText: true, verticalAlignment: "center", borders: border };
summary.getRange("B8:H8").format.fill = paleRed;
summary.getRange("B9:H9").format.fill = paleYellow;
summary.getRange("A12:C20").format = { fill: lightBlue, verticalAlignment: "center", borders: { preset: "inside", style: "thin", color: "#DCE3EA" } };
summary.getRange("A12:A20").format = { fill: navy, font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center" };
summary.getRange("B12:C20").format.font = { bold: true, color: navy };
summary.getRange("D12:H20").format = { fill: "#FFFFFF", wrapText: true, verticalAlignment: "center", borders: { preset: "inside", style: "thin", color: "#DCE3EA" } };
summary.getRange("A23:C23").format = { fill: navy, font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
summary.getRange("A24:C26").format = { fill: paleYellow, wrapText: true, verticalAlignment: "center", borders: { preset: "inside", style: "thin", color: "#DCE3EA" } };
summary.getRange("B24:B26").format = { fill: paleRed, font: { bold: true, color: "#B42318" }, horizontalAlignment: "center" };
summary.getRange("E23:F23").format = { fill: navy, font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
summary.getRange("E24:F27").format = { fill: paleGreen, borders: { preset: "inside", style: "thin", color: "#DCE3EA" } };
summary.getRange("F24:F27").format = { font: { bold: true, color: navy }, horizontalAlignment: "right", numberFormat: "#,##0" };
summary.getRange("A29:H30").format = { fill: "#F7F8FA", font: { color: "#6B7280", fontSize: 9 }, wrapText: true, verticalAlignment: "center", borders: border };

summary.getRange("A1:H30").format.font.typeface = "Malgun Gothic";
summary.getRange("A:A").format.columnWidth = 10;
summary.getRange("B:B").format.columnWidth = 17;
summary.getRange("C:C").format.columnWidth = 13;
summary.getRange("D:H").format.columnWidth = 16;
summary.getRange("1:2").format.rowHeight = 28;
summary.getRange("3:3").format.rowHeight = 22;
summary.getRange("5:5").format.rowHeight = 24;
summary.getRange("6:9").format.rowHeight = 34;
summary.getRange("11:11").format.rowHeight = 24;
summary.getRange("12:20").format.rowHeight = 38;
summary.getRange("22:22").format.rowHeight = 24;
summary.getRange("23:27").format.rowHeight = 28;
summary.getRange("29:30").format.rowHeight = 28;

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

for (const [index, sheetName] of ["대시보드", "전체 체크리스트", "일일 점검", "Codex 점검 결과"].entries()) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1.25, format: "png" });
  await fs.writeFile(`${previewDir}/${String(index + 1).padStart(2, "0")}-${sheetName}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const keyCheck = await workbook.inspect({
  kind: "table",
  range: "'Codex 점검 결과'!A1:H30",
  include: "values,formulas",
  tableMaxRows: 40,
  tableMaxCols: 8,
  maxChars: 30000,
});
console.log("KEY_CHECK");
console.log(keyCheck.ndjson);

const updatedRows = await workbook.inspect({
  kind: "table",
  range: "'전체 체크리스트'!A22:M45",
  include: "values,formulas",
  tableMaxRows: 30,
  tableMaxCols: 13,
  maxChars: 30000,
});
console.log("UPDATED_ROWS");
console.log(updatedRows.ndjson);

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log("FORMULA_ERRORS");
console.log(formulaErrors.ndjson);
console.log(`OUTPUT ${outputPath}`);
