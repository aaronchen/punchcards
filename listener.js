import fetch from 'node-fetch';
import { exec } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const startupTime = Math.floor(Date.now() / 1000);
let lastUpdateId = 0;

async function pollTelegram() {
  try {
    const res = await fetch(`${TELEGRAM_API}/getUpdates?offset=${lastUpdateId + 1}`);
    const data = await res.json();

    for (const update of data.result) {
      const msg = update.message?.text?.trim().toLowerCase();
      const chatId = update.message?.chat?.id?.toString();
      const msgDate = update.message?.date;

      if (!msgDate || msgDate < startupTime) {
        continue;
      }

      lastUpdateId = update.update_id;

      if (chatId === CHAT_ID) {
        if (msg === 'pi') {
          console.log('📥 Punching in...');
          exec('node punch.js in telegram');
          await sendTextToTelegram('📥 Received "pi" – punching in...');
        } else if (msg === 'po') {
          console.log('📥 Punching out...');
          exec('node punch.js out telegram');
          await sendTextToTelegram('📥 Received "po" – punching out...');
        }

        // Ignore everything that is not pi or po
      }
    }
  } catch (err) {
    console.error('Polling error:', err.message);
  }
}

async function sendTextToTelegram(text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: text,
    }),
  });
}

setInterval(pollTelegram, 5000);
