const fs = require('fs');
const path = require('path');

// ✅ บันทึก cookies หลัง login
async function saveCookies(page, filename = 'cookies.json') {
  const cookies = await page.cookies();
  fs.writeFileSync(path.join(__dirname, filename), JSON.stringify(cookies, null, 2));
}

// ✅ โหลด cookies กลับเข้า context ก่อนใช้งาน
async function loadCookies(page, filename = 'cookies.json') {
  const cookiesPath = path.join(__dirname, filename);
  if (!fs.existsSync(cookiesPath)) {
    throw new Error('❌ ไม่พบไฟล์ cookies.json — กรุณา login ก่อนแล้ว save cookies');
  }
  const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
  await page.setCookie(...cookies);
}

module.exports = {
  saveCookies,
  loadCookies
};
