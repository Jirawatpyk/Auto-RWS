// ✅ CapacityTracker.js — now supports REST API updates from Dashboard (with capacity/override editor)

const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const isBusinessDay = require('./isBusinessDay');

dayjs.extend(isSameOrBefore);
dayjs.extend(customParseFormat);

const MAX_DAILY_CAPACITY = 12000;
let capacityMap = {};

function loadDailyOverride() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '../public/dailyOverride.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveDailyOverride(overrideMap) {
  fs.writeFileSync(path.join(__dirname, '../public/dailyOverride.json'), JSON.stringify(overrideMap, null, 2));
}

function loadCapacityMap() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '../public/capacity.json'), 'utf-8');
    capacityMap = JSON.parse(raw);
  } catch {
    capacityMap = {};
  }
}

function saveCapacityMap() {
  fs.writeFileSync(path.join(__dirname, '../public/capacity.json'), JSON.stringify(capacityMap, null, 2));
}

function getOverrideMap() {
  return loadDailyOverride();
}
function getCapacityMap() {
  loadCapacityMap();
  return capacityMap;
}

function getAvailableDates(requiredWords, deadlineStr, excludeToday = false) {
  loadCapacityMap();
  const overrideMap = loadDailyOverride();
  const today = dayjs().startOf('day');
  const deadline = dayjs(deadlineStr, [
    'YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY', 'DD.MM.YYYY', 'YYYY-MM-DD HH:mm',
    'DD.MM.YYYY h:mm A', 'DD/MM/YYYY h:mm A', 'DD-MM-YYYY h:mm A'
  ], true);

  let businessDates = [];
  let cursor = today;

  while (cursor.isSameOrBefore(deadline, 'day')) {
    const dayOfWeek = cursor.day(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && isBusinessDay(cursor)) {
      businessDates.push(cursor.format('YYYY-MM-DD'));
    }
    cursor = cursor.add(1, 'day');
  }

const now = dayjs();

// เพิ่ม flag กรองภายนอก
const todayStr = today.format('YYYY-MM-DD');
businessDates = businessDates.filter(d =>
  dayjs(d).isSameOrBefore(deadline, 'day') &&
  (!excludeToday || d !== todayStr)
);

businessDates.sort(); 

  const isUrgent = businessDates.length < 3;
  const allocationPlan = [];
  let remaining = requiredWords;

  if (isUrgent) {
    // 🚨 URGENT MODE: อัดให้มากที่สุดตามลำดับวัน
    for (const dateStr of businessDates) {
      const used = capacityMap[dateStr] || 0;
      const max = overrideMap[dateStr] || MAX_DAILY_CAPACITY;
      const spaceLeft = max - used;
      if (spaceLeft <= 0) continue;
      const toUse = Math.min(spaceLeft, remaining);
      if (toUse > 0) {
        allocationPlan.push({ date: dateStr, amount: toUse });
        remaining -= toUse;
        if (remaining <= 0) break;
      }
    }
  } else {
    // ✅ BALANCED MODE: แบ่งเท่า ๆ กันก่อน แล้วค่อยเติม
    const perDay = Math.ceil(requiredWords / businessDates.length);

    // 📦 รอบแรก: ใส่ perDay หรือเท่าที่ใส่ได้
    for (const dateStr of businessDates) {
      const used = capacityMap[dateStr] || 0;
      const max = overrideMap[dateStr] || MAX_DAILY_CAPACITY;
      const spaceLeft = max - used;
      if (spaceLeft <= 0) continue;
      const toUse = Math.min(spaceLeft, remaining, perDay);
      if (toUse > 0) {
        allocationPlan.push({ date: dateStr, amount: toUse });
        remaining -= toUse;
      }
    }

// 🔁 รอบสอง: เติมคำที่เหลือให้วันไหนว่าง (เรียงจากวันที่เหลือ space เยอะสุด → วันก่อนหน้า)
if (remaining > 0) {
  const sortedBySpace = businessDates
    .map(dateStr => {
      const used = capacityMap[dateStr] || 0;
      const plan = allocationPlan.find(p => p.date === dateStr);
      const alreadyUsed = plan ? plan.amount : 0;
      const max = overrideMap[dateStr] || MAX_DAILY_CAPACITY;
      const spaceLeft = max - used - alreadyUsed;
      return { date: dateStr, spaceLeft };
    })
    .filter(entry => entry.spaceLeft > 0)
    .sort((a, b) => {
      if (b.spaceLeft !== a.spaceLeft) return b.spaceLeft - a.spaceLeft;
      return a.date.localeCompare(b.date); // ถ้า space เท่ากัน → เลือกวันก่อน
    });

  for (const { date: dateStr, spaceLeft } of sortedBySpace) {
    const toAdd = Math.min(spaceLeft, remaining);
    if (toAdd <= 0) continue;

    const existing = allocationPlan.find(p => p.date === dateStr);
    if (existing) {
      existing.amount += toAdd;
    } else {
      allocationPlan.push({ date: dateStr, amount: toAdd });
    }

    remaining -= toAdd;
    if (remaining <= 0) break;
  }
}
  }
	allocationPlan.sort((a, b) => a.date.localeCompare(b.date));
	return allocationPlan;
}

function applyCapacity(plan) {
  for (const { date, amount } of plan) {
    if (!capacityMap[date]) capacityMap[date] = 0;
    capacityMap[date] += amount;
  }
  saveCapacityMap();
}

function getReport() {
  return Object.entries(capacityMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, amount]) => `${date}: ${amount} words`)
    .join('\n');
}

function canFitWithinDeadline(dates, deadlineStr) {
  const deadline = dayjs(deadlineStr, [
    'YYYY-MM-DD','DD/MM/YYYY','DD-MM-YYYY','DD.MM.YYYY', 'YYYY-MM-DD HH:mm',
    'DD.MM.YYYY h:mm A','DD/MM/YYYY h:mm A','DD-MM-YYYY h:mm A']
  , true);
  return dates.length > 0 && dayjs(dates[dates.length - 1]).isSameOrBefore(deadline, 'day');
}

function getRemainingCapacity(date) {
  loadCapacityMap();
  const overrideMap = loadDailyOverride();
  const max = overrideMap[date] || MAX_DAILY_CAPACITY;
  const used = capacityMap[date] || 0;
  return Math.max(0, max - used);
}

function adjustCapacity({ date, amount }) {
  if (!capacityMap[date]) capacityMap[date] = 0;
  capacityMap[date] = Math.max(0, capacityMap[date] + amount);
  saveCapacityMap();
}

function releaseCapacity(plan) {
  for (const { date, amount } of plan) {
    const used = capacityMap[date] || 0;
    const safeRelease = Math.min(amount, used);
    if (safeRelease > 0) {
      capacityMap[date] = used - safeRelease;
    }
  }
  saveCapacityMap();
}

function resetCapacityMap() {
  capacityMap = {};
  saveCapacityMap();
}

module.exports = {
  getAvailableDates,
  applyCapacity,
  releaseCapacity,
  adjustCapacity,
  getReport,
  getRemainingCapacity,
  canFitWithinDeadline,
  resetCapacityMap,
  loadDailyOverride,
  saveDailyOverride,
  loadCapacityMap,
  getCapacityMap,
  getOverrideMap
};
