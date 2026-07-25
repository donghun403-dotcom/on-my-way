import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const input = await FileBlob.load("C:/Users/dongh/Desktop/On_My_Way_출시준비_체크리스트.xlsx");
const workbook = await SpreadsheetFile.importXlsx(input);

for (const request of [
  { kind: "table", range: "'전체 체크리스트'!A1:M87", include: "values,formulas", tableMaxRows: 100, tableMaxCols: 13, tableMaxCellChars: 500, maxChars: 80000 },
  { kind: "formula", sheetId: "전체 체크리스트", range: "A1:M87", options: { maxResults: 300 }, maxChars: 30000 },
  { kind: "formula", sheetId: "대시보드", range: "A1:J47", options: { maxResults: 200 }, maxChars: 25000 },
  { kind: "computedStyle", sheetId: "전체 체크리스트", range: "A1:M12", maxChars: 12000 },
  { kind: "table", range: "'일일 점검'!A1:Q12", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 17, tableMaxCellChars: 300, maxChars: 20000 },
]) {
  const result = await workbook.inspect(request);
  console.log(`REQUEST ${JSON.stringify(request)}`);
  console.log(result.ndjson);
}
