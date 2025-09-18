// ✅ server.js — now includes REST API for override and capacity dashboard

const express = require('express');
const dayjs = require('dayjs');
const fs = require('fs');

async function writeCapacityLog(entry) {
  const logFile = path.join(__dirname, '../public', 'capacityLog.json');
  const dir = path.dirname(logFile);
  try {
    await fs.promises.mkdir(dir, { recursive: true });

    let logs = [];
    if (fs.existsSync(logFile)) {
      try {
        logs = JSON.parse(await fs.promises.readFile(logFile, 'utf8'));
      } catch (e) {
        console.error("❌ Error parsing capacityLog.json:", e.message);
      }
    }
    logs.push({ ...entry, timestamp: new Date().toISOString() });
    await fs.promises.writeFile(logFile, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error("❌ writeCapacityLog failed:", err.message);
  }
}

const http = require("http");
const path = require('path');
const bodyParser = require('body-parser');
const WebSocket = require("ws");
const { getAllStatus } = require("./statusManager/taskStatusStore");
const { logSuccess, logInfo } = require("../Logs/logger");
const { pauseImap, resumeImap, isImapPaused } = require("../IMAP/imapClient");
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const {
  loadDailyOverride,
  saveDailyOverride,
  getCapacityMap,
 getOverrideMap,
 adjustCapacity,
  resetCapacityMap
} = require('../Task/CapacityTracker');

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../public")));

// GET override.json
app.get('/api/override', (req, res) => {
  const override = loadDailyOverride();
  res.json(override);
});

// POST override.json
app.post('/api/override', async (req, res) => {
  const override = req.body;
  if (!override || typeof override !== 'object') {
    return res.status(400).json({ error: 'Invalid override format' });
  }
  saveDailyOverride(override);
  logSuccess("📝 Override updated via Dashboard");

  for (const [date, amount] of Object.entries(override)) {
    await writeCapacityLog({ type: "override", date, amount, user: "system" });
    broadcastToClients({ type: "capacityUpdated", date });
  }

  res.json({ success: true });
});

// GET capacity.json (read-only)
app.get('/api/capacity', (req, res) => {
  const cap = getCapacityMap();
  res.json(cap);
});

// POST reset capacity
app.post('/api/capacity/reset', (req, res) => {
  resetCapacityMap();
  res.json({ success: true });
});

// POST /api/release
app.post('/api/release', (req, res) => {
  const plan = req.body; // [{ date, amount }]
  if (!Array.isArray(plan)) return res.status(400).json({ error: 'Invalid plan format' });
  releaseCapacity(plan);
  res.json({ success: true });
});

// POST /api/adjust
app.post('/api/adjust', (req, res) => {
  const { date, amount } = req.body;
  if (!date || typeof amount !== 'number') return res.status(400).json({ error: 'Invalid input' });
  adjustCapacity({ date, amount });
  res.json({ success: true });
});

// GET /api/capacity/:date
app.get('/api/capacity/:date', (req, res) => {
  const remaining = getRemainingCapacity(req.params.date);
  res.json({ remaining });
});

async function cleanupOldCapacityAndOverride(datesToDelete = null) {
  const today = dayjs().format("YYYY-MM-DD");
  const capacityPath = path.join(__dirname, '../public/capacity.json');
  const overridePath = path.join(__dirname, '../public/dailyOverride.json');

  let cap = getCapacityMap();
  let override = getOverrideMap();
  let deleted = [];

  const shouldDelete = (date) => {
    if (datesToDelete) return datesToDelete.includes(date);
    return date < today;
  };

  for (const date of Object.keys(cap)) {
    if (shouldDelete(date)) {
      delete cap[date];
      deleted.push(date);
    }
  }

  for (const date of Object.keys(override)) {
    if (shouldDelete(date)) {
      delete override[date];
      if (!deleted.includes(date)) deleted.push(date);
    }
  }

  try {
    await fs.promises.writeFile(capacityPath, JSON.stringify(cap, null, 2));
    await fs.promises.writeFile(overridePath, JSON.stringify(override, null, 2));
  } catch (err) {
    console.error("❌ Failed to write capacity/override:", err.message);
  }

  if (deleted.length > 0) {
    logInfo(`🧹 ลบ capacity/override วันที่: ${deleted.join(", ")}`);
    for (const d of deleted) {
      broadcastToClients({ type: "capacityUpdated", date: d });
    }
  }
}


const cron = require('node-cron');

const cleanupJob = cron.schedule('1 0 * * *', async () => {
  const start = Date.now();
  logInfo(`[CRON] ✅ Cleanup job started at ${new Date().toISOString()}`);
  try {
    await cleanupOldCapacityAndOverride();
  } catch (err) {
    logInfo(`[CRON] ❌ Cleanup failed: ${err.message}`);
  } finally {
    logInfo(`[CRON] ⏱ Took ${Date.now() - start} ms`);
  }
});

app.post("/api/cleanup", async (req, res) => {
  try {
    const dates = req.body?.dates;
    await cleanupOldCapacityAndOverride(dates); // ✅ ใช้ argument
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

function broadcastToClients(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (err) {
        console.warn("❌ Failed to send to WebSocket client:", err.message);
      }
    }
  });
}

function pushStatusUpdate() {
  const status = getAllStatus();
  broadcastToClients({ type: "updateStatus", ...status, imapPaused: isImapPaused() });
}

wss.on("connection", (ws) => {
  logSuccess("✅ WebSocket connected");

  const { pending, success, error } = getAllStatus();
  ws.send(JSON.stringify({
    type: "updateStatus",
    pending,
    success,
    error,
    imapPaused: isImapPaused()
  }));

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === "togglePause") {
        if (isImapPaused()) {
          resumeImap();
        } else {
          pauseImap();
        }
        const { pending, success, error } = getAllStatus();
        broadcastToClients({
          type: "updateStatus",
          pending,
          success,
          error,
          imapPaused: isImapPaused()
        });
      }
    } catch (err) {
      console.error("❌ Failed to handle message:", err.message);
    }
  });

  ws.isAlive = true;
  ws.on("pong", () => ws.isAlive = true);
});

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => clearInterval(interval));

app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  logInfo(`✅ WebMonitor listening on http://localhost:${PORT}`);
});

module.exports = {
  pushStatusUpdate,
  broadcastToClients,
  server,
  wss
};