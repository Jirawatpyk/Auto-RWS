const { broadcastToClients } = require("./server");

function pushImapStatus(isConnected) {
  broadcastToClients({
    type: "imapStatus",
    connected: isConnected,
    timestamp: Date.now()
  });
}

function pushHeartbeat() {
  broadcastToClients({
    type: "imapHeartbeat",
    timestamp: Date.now()
  });
}

module.exports = {
  pushImapStatus,
  pushHeartbeat
};
