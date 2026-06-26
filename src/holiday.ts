export interface HolidayEntry {
  type: 'holiday' | 'workday';
  name: string;
}

const holiday_in_law: Record<string, HolidayEntry> = {
  "2025-01-01": {"type": "holiday", "name": "元旦"},
  
  "2025-01-26": {"type": "workday", "name": "春节调休班"},
  "2025-01-28": {"type": "holiday", "name": "春节"},
  "2025-01-29": {"type": "holiday", "name": "春节"},
  "2025-01-30": {"type": "holiday", "name": "春节"},
  "2025-01-31": {"type": "holiday", "name": "春节"},
  "2025-02-01": {"type": "holiday", "name": "春节"},
  "2025-02-02": {"type": "holiday", "name": "春节"},
  "2025-02-03": {"type": "holiday", "name": "春节"},
  "2025-02-04": {"type": "holiday", "name": "春节"},
  "2025-02-08": {"type": "workday", "name": "春节调休班"},
  
  "2025-04-04": {"type": "holiday", "name": "清明节"},
  "2025-04-05": {"type": "holiday", "name": "清明节"},
  "2025-04-06": {"type": "holiday", "name": "清明节"},
  
  "2025-04-27": {"type": "workday", "name": "劳动节调休班"},
  "2025-05-01": {"type": "holiday", "name": "劳动节"},
  "2025-05-02": {"type": "holiday", "name": "劳动节"},
  "2025-05-03": {"type": "holiday", "name": "劳动节"},
  "2025-05-04": {"type": "holiday", "name": "劳动节"},
  "2025-05-05": {"type": "holiday", "name": "劳动节"},
  
  "2025-05-31": {"type": "holiday", "name": "端午节"},
  "2025-06-01": {"type": "holiday", "name": "端午节"},
  "2025-06-02": {"type": "holiday", "name": "端午节"},
  
  "2025-09-28": {"type": "workday", "name": "国庆节调休班"},
  "2025-10-01": {"type": "holiday", "name": "国庆节"},
  "2025-10-02": {"type": "holiday", "name": "国庆节"},
  "2025-10-03": {"type": "holiday", "name": "国庆节"},
  "2025-10-04": {"type": "holiday", "name": "国庆节"},
  "2025-10-05": {"type": "holiday", "name": "国庆节"},
  "2025-10-06": {"type": "holiday", "name": "中秋节"},
  "2025-10-07": {"type": "holiday", "name": "国庆节"},
  "2025-10-08": {"type": "holiday", "name": "国庆节"},
  "2025-10-11": {"type": "workday", "name": "国庆节调休班"},

  "2026-01-01": {"type": "holiday", "name": "元旦"},
  "2026-01-02": {"type": "holiday", "name": "元旦"},
  "2026-01-03": {"type": "holiday", "name": "元旦"},
   "2026-01-04": {"type": "workday", "name": "元旦调休班"},
  
  "2026-02-14": {"type": "workday", "name": "春节调休班"},
  "2026-02-15": {"type": "holiday", "name": "春节"},
  "2026-02-16": {"type": "holiday", "name": "春节"},
  "2026-02-17": {"type": "holiday", "name": "春节"},
  "2026-02-18": {"type": "holiday", "name": "春节"},
  "2026-02-19": {"type": "holiday", "name": "春节"},
  "2026-02-20": {"type": "holiday", "name": "春节"},
  "2026-02-21": {"type": "holiday", "name": "春节"},
  "2026-02-22": {"type": "holiday", "name": "春节"},
  "2026-02-23": {"type": "holiday", "name": "春节"},
  "2026-02-28": {"type": "workday", "name": "春节调休班"},
  
  "2026-04-04": {"type": "holiday", "name": "清明节"},
  "2026-04-05": {"type": "holiday", "name": "清明节"},
  "2026-04-06": {"type": "holiday", "name": "清明节"},
  
  "2026-05-01": {"type": "holiday", "name": "劳动节"},
  "2026-05-02": {"type": "holiday", "name": "劳动节"},
  "2026-05-03": {"type": "holiday", "name": "劳动节"},
  "2026-05-04": {"type": "holiday", "name": "劳动节"},
  "2026-05-05": {"type": "holiday", "name": "劳动节"},
  "2026-05-09": {"type": "workday", "name": "劳动节调休班"},
  
  "2026-06-19": {"type": "holiday", "name": "端午节"},
  "2026-06-20": {"type": "holiday", "name": "端午节"},
  "2026-06-21": {"type": "holiday", "name": "端午节"},
  
  "2026-09-20": {"type": "workday", "name": "国庆节调休班"},
  "2026-09-25": {"type": "holiday", "name": "中秋节"},
  "2026-09-26": {"type": "holiday", "name": "中秋节"},
  "2026-09-27": {"type": "holiday", "name": "中秋节"},
  
  "2026-10-01": {"type": "holiday", "name": "国庆节"},
  "2026-10-02": {"type": "holiday", "name": "国庆节"},
  "2026-10-03": {"type": "holiday", "name": "国庆节"},
  "2026-10-04": {"type": "holiday", "name": "国庆节"},
  "2026-10-05": {"type": "holiday", "name": "国庆节"},
  "2026-10-06": {"type": "holiday", "name": "国庆节"},
  "2026-10-07": {"type": "holiday", "name": "国庆节"},
  "2026-10-10": {"type": "workday", "name": "国庆节调休班"}
};

// ── 辅助函数 ──

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 判断是否为法定节假日 */
export function isHoliday(date: Date): boolean {
  const key = formatDateKey(date);
  return holiday_in_law[key]?.type === 'holiday';
}

/** 判断是否为法定调休上班日（周末补班） */
export function isCompensatoryWorkday(date: Date): boolean {
  const key = formatDateKey(date);
  return holiday_in_law[key]?.type === 'workday';
}

/**
 * 判断是否为休息日（无需上班）
 * - 法定节假日 → 休息
 * - 周六/周日且非法定调休上班日 → 休息
 */
export function isRestDay(date: Date): boolean {
  if (isHoliday(date)) return true;
  const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return !isCompensatoryWorkday(date);
  }
  return false;
}