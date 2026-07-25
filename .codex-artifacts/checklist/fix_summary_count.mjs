import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const workbookPath = "../../outputs/019f650b-0b7c-7be0-86a9-99c57a265aac/On_My_Way_출시준비_체크리스트_진행점검.xlsx";
const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const summary = workbook.worksheets.getItem("Codex 점검 결과");

summary.getRange("F27").formulas = [["='대시보드'!B21"]];

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(workbookPath);

const preview = await workbook.render({
  sheetName: "Codex 점검 결과",
  autoCrop: "all",
  scale: 1.25,
  format: "png",
});
await fs.writeFile(
  "./previews-after/04-Codex 점검 결과.png",
  new Uint8Array(await preview.arrayBuffer()),
);

const table = await workbook.inspect({
  kind: "table",
  range: "'Codex 점검 결과'!E23:F27",
  include: "values,formulas",
});
console.log(table.ndjson);

const dashboard = await workbook.inspect({
  kind: "table",
  range: "'대시보드'!A18:B21",
  include: "values,formulas",
});
console.log(dashboard.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
});
console.log(errors.ndjson);
