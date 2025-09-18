module.exports = {
  apps: [
    {
      name: "AutoRWS",
      script: "main.js",                // จุดเริ่มต้นระบบ
      cwd: "./",                        // โฟลเดอร์ที่รัน
      instances: 1,                     // จำนวน instance (1 สำหรับระบบ queue)
      exec_mode: "fork",               // ใช้แบบ fork (ไม่ใช่ cluster)
      autorestart: true,               // รีสตาร์ทอัตโนมัติถ้าพัง
      watch: false,                    // ไม่เปิด watch โฟลเดอร์
      max_memory_restart: "1G",      // ถ้าเกิน 500MB ให้ restart อัตโนมัติ
      env: {
        NODE_ENV: "production",
        TZ: "Asia/Bangkok"             // ตั้ง timezone สำหรับ log
      },
      output: "./Logs/pm2-out.log",     // log ปกติ (console.log)
      error: "./Logs/pm2-error.log",    // log ข้อผิดพลาด
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};
