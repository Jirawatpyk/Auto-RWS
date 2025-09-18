const axios = require('axios');

async function notifyGoogleChat(message) {
  const webhookURL = process.env.GOOGLE_CHAT_WEBHOOK; // ✅ ย้ายมาไว้ในนี้แทน
  if (!webhookURL) {
    console.warn('[notifyGoogleChat] ❗ webhookURL is not defined');
    return;
  }

  try {
    await axios.post(webhookURL, { text: message });
  } catch (err) {
    console.error(`[notifyGoogleChat] Failed: ${err.message}`);
  }
}

module.exports = {
  notifyGoogleChat
};
