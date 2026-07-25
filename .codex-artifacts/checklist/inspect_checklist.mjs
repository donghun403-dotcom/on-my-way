import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "C:/Users/dongh/Desktop/On_My_Way_출시준비_체크리스트.xlsx";
const previewDir = "./previews-before";

const input = await FileBlob.load(sourcePath);
const workbook = await SpreadsheetFile.importXlsx(input);
const overview = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 12000,
  tableMaxRows: 12,
  tableMaxCols: 12,
  tableMaxCellChars: 160,
});
console.log("OVERVIEW");
console.log(overview.ndjson);

const sheets = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 12000 });
console.log("SHEETS");
console.log(sheets.ndjson);

await fs.mkdir(previewDir, { recursive: true });
const sheetRecords = sheets.ndjson
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((record) => record.name);

for (let index = 0; index < sheetRecords.length; index += 1) {
  const sheetName = sheetRecords[index].name;
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1.5, format: "png" });
  await fs.writeFile(`${previewDir}/${String(index + 1).padStart(2, "0")}-${sheetName}.png`, new Uint8Array(await preview.arrayBuffer()));
}
