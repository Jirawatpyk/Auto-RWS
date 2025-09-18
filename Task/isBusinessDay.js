// isBusinessDay.js — ใช้ตรวจสอบว่าเป็นวันทำการหรือไม่

const holidayList = [
  '2025-01-01',
  '2025-04-13',
  '2025-07-28',
  '2025-08-12',
  '2025-10-13',
  '2025-10-23',
  '2025-12-05',
  '2025-12-10',
  '2025-12-31'
  // 👉 เพิ่มวันหยุดนักขัตฤกษ์ที่นี่
];

module.exports = function isBusinessDay(dayjsDate) {
  const dayOfWeek = dayjsDate.day(); // Sunday = 0, Saturday = 6
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isHoliday = holidayList.includes(dayjsDate.format('YYYY-MM-DD'));
  return !isWeekend && !isHoliday;
};
