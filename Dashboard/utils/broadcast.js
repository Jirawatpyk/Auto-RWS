// Dashboard/utils/broadcast.js
let wss = null;

function initWebSocket(server) {
  wss = server;
  console.log("✅ WebSocket server initialized in broadcast.js");
}

function broadcastStatus() {
  if (!wss) {
    console.warn("⚠️ WebSocket server not initialized, cannot broadcast.");
    return;
  }
  const { getAllStatus } = require("../statusManager/taskStatusStore");
  const { pending, success, error } = getAllStatus();

  const payload = JSON.stringify({
    type: "updateStatus",
    pending,
    success,
    error
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

function sendLogToClients(log) {
  if (!wss) return;
  const payload = JSON.stringify({
    type: "logEntry",
    log
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

module.exports = {
  initWebSocket,
  broadcastStatus,
  sendLogToClients
};
