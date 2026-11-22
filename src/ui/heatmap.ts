



































import { language } from "../i18n";


export interface HotForceRecordRecord {

  date: string;

  value2: number;
}


export interface HotForceCell {

  date: string;
  value2: number;

  level: 0 | 1 | 2 | 3 | 4;
}


export interface HotForceColumn {

  month: string;

  cell2: HotForceCell[];
}


export interface HotForceImage {
  column: HotForceColumn[];

  mostLarge: number;

  totalCount: number;

  dayNumber: number;

  start5: string;
  end2: string;
}


const weekNumberLimit = 53;

const weekNumberBelowLimit = 8;

const defaultWeekCount = 26;

const recordRecordLimit = 400;





















export function readHotForceRecordRecord(raw: unknown): HotForceRecordRecord[] {
  if (typeof raw !== "string") return [];
  const table2 = new Map<string, number>();
  for (const paragraph2 of raw.split(/\s+/)) {
    if (!paragraph2 || table2.size >= recordRecordLimit) continue;
    const split = paragraph2.indexOf(":");
    if (split <= 0) continue;
    const date = paragraph2.slice(0, split);
    if (!dateNumber(date)) continue;
    const value2 = Number(paragraph2.slice(split + 1));
    if (!Number.isFinite(value2) || value2 < 0) continue;
    table2.set(date, Math.floor(value2));
  }
  return [...table2].map(([date, value2]) => ({ date, value2 }));
}


function isDatePeriod(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}







function dateNumber(date: string): Date | null {
  if (!isDatePeriod(date)) return null;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);

  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}


function dateString(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}


function move2(d: Date, day: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + day);
}


function starPeriodHowMany(d: Date): number {
  return (d.getDay() + 6) % 7;
}


function level(value2: number, mostLarge: number): 0 | 1 | 2 | 3 | 4 {
  if (value2 <= 0) return 0;
  if (mostLarge <= 0) return 1;
  if (value2 * 4 <= mostLarge) return 1;
  if (value2 * 2 <= mostLarge) return 2;
  if (value2 * 4 <= mostLarge * 3) return 3;
  return 4;
}








export function computeHeatmap(recordRecord: HotForceRecordRecord[], end2: string, weekNumber: number): HotForceImage {
  const emptyValue: HotForceImage = { column: [], mostLarge: 0, totalCount: 0, dayNumber: 0, start5: "", end2: "" };
  const table2 = new Map(recordRecord.map((r) => [r.date, r.value2]));

  let endDate = dateNumber(end2);
  if (!endDate) {
    for (const r of recordRecord) {
      const d = dateNumber(r.date);
      if (d && (!endDate || d > endDate)) endDate = d;
    }
  }
  if (!endDate) return emptyValue;

  const columnCount = Math.min(weekNumberLimit, Math.max(weekNumberBelowLimit, Math.floor(weekNumber) || defaultWeekCount));

  const endColumnStart = move2(endDate, -starPeriodHowMany(endDate));
  const firstColumnStart = move2(endColumnStart, -(columnCount - 1) * 7);

  const column: HotForceColumn[] = [];
  let mostLarge = 0;
  let totalCount = 0;
  let dayNumber = 0;
  let aboveItemLabel = "";
  for (let c = 0; c < columnCount; c++) {
    const localColumnStart = move2(firstColumnStart, c * 7);
    const cell2: HotForceCell[] = [];
    for (let r = 0; r < 7; r++) {
      const localDate = move2(localColumnStart, r);
      if (localDate > endDate) break;
      const key = dateString(localDate);
      const value2 = table2.get(key) ?? 0;
      if (value2 > mostLarge) mostLarge = value2;
      totalCount += value2;
      if (value2 > 0) dayNumber += 1;
      cell2.push({ date: key, value2, level: 0 });
    }


    const localLabel = monthLabel(localColumnStart, aboveItemLabel);
    column.push({ month: localLabel, cell2 });
    aboveItemLabel = localLabel || aboveItemLabel;
  }


  for (const oneColumn of column) {
    for (const value of oneColumn.cell2) value.level = level(value.value2, mostLarge);
  }

  return { column, mostLarge, totalCount, dayNumber, start5: dateString(firstColumnStart), end2: dateString(endDate) };
}












function monthLabel(localColumnStart: Date, aboveItem: string): string {
  const local = monthName(localColumnStart);
  return local === aboveItem ? "" : local;
}


let monthCellStyle: { language: string; device: Intl.DateTimeFormat } | null = null;

function monthName(d: Date): string {
  const language2 = language();
  if (!monthCellStyle || monthCellStyle.language !== language2) {
    monthCellStyle = { language: language2, device: new Intl.DateTimeFormat(language2, { month: "short" }) };
  }
  return monthCellStyle.device.format(d);
}
