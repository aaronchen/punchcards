import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { exec } from 'child_process';
import readline from 'readline';
import FormData from 'form-data';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

class TimecardPuncher {
  constructor() {
    this.validateEnvironment();
    this.browser = null;
    this.page = null;
  }

  validateEnvironment() {
    const required = ['WITS_USERNAME', 'WITS_PASSWORD'];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      console.error(`❌ Missing environment variables: ${missing.join(', ')}`);
      process.exit(1);
    }
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });
    this.page = await this.browser.newPage();
    this.page.setDefaultNavigationTimeout(120000);
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async getCaptchaImage() {
    await this.page.goto('https://cbs.wits.com/login');

    const base64 = await this.page.$eval('img[src^="data:image"]', (img) =>
      img.src.replace(/^data:image\/png;base64,/, '')
    );

    const tmpPath = join(tmpdir(), 'captcha.png');
    await fs.writeFile(tmpPath, base64, 'base64');

    return tmpPath;
  }

  async login(captchaAnswer) {
    await this.page.type('[placeholder="帳號"]', process.env.WITS_USERNAME);
    await this.page.type('[placeholder="密碼"]', process.env.WITS_PASSWORD);
    await this.page.type('[placeholder="驗證碼"]', captchaAnswer);
    await this.page.click('button');

    await this.page.waitForSelector('.dashboard-container', { visible: true });
  }

  async navigateToCheckIn() {
    await this.page.goto('https://cbs.wits.com/employee/checkIn');
    await this.page.waitForSelector('.checkin-btn-row', { visible: true });
  }

  async waitForButtonStability(buttonSelector) {
    await this.page.waitForFunction(
      (selector) => {
        const btn = document.querySelector(selector);

        if (!btn) return false;

        if (!window._lastBtnState || window._lastBtnState.selector !== selector) {
          window._lastBtnState = { selector, state: btn.disabled, time: Date.now() };
          return false;
        }

        const same = btn.disabled === window._lastBtnState.state;
        const timeElapsed = Date.now() - window._lastBtnState.time;

        if (!same) {
          window._lastBtnState = { selector, state: btn.disabled, time: Date.now() };
          return false;
        }

        return timeElapsed > 200;
      },
      {},
      buttonSelector
    );
  }

  async performPunch(action) {
    const nth = action === 'in' ? 1 : 2;
    const buttonSelector = `.checkin-btn-row button:nth-of-type(${nth})`;

    await this.page.waitForSelector(buttonSelector, { visible: true });
    await this.waitForButtonStability(buttonSelector);

    const button = await this.page.$(buttonSelector);
    const isDisabled = await this.page.evaluate((btn) => btn.disabled, button);

    if (!isDisabled) {
      await button.click();
      await this.page.click('.el-button--primary');
      await this.page.waitForSelector('.el-message-box', { hidden: true });
      console.log(`✅ Punched ${action} successfully`);
    } else {
      console.log(`⛔ Already punched ${action}`);
    }
  }

  async takeScreenshot(action, canShowScreenshot) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const timestamp = now.toISOString().slice(0, 16).replace('T', '-').replace(':', '-');

    const dir = `screenshots/${year}/${month}`;
    await fs.mkdir(dir, { recursive: true });

    const filename = `${dir}/${timestamp}-${action}.png`;
    await this.page.screenshot({ path: filename });

    console.log(`Screenshot saved as ${filename}`);

    if (canShowScreenshot) {
      try {
        exec(`start "" "${filename}"`);
      } catch (error) {
        console.warn('Could not open screenshot automatically:', error.message);
      }
    }

    return filename;
  }

  async sendScreenshotToTelegram(filepath) {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      console.warn(
        '⚠️ Skipping Telegram screenshot - missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID'
      );
      return;
    }

    try {
      const form = new FormData();
      form.append('chat_id', process.env.TELEGRAM_CHAT_ID);
      form.append('photo', createReadStream(filepath));
      form.append('caption', `📸 Punch screenshot - ${new Date().toLocaleString()}`);

      const res = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`,
        {
          method: 'POST',
          body: form,
          headers: form.getHeaders(),
        }
      );

      const json = await res.json();

      if (json.ok) {
        console.log('📱 Screenshot sent to Telegram successfully');
      } else {
        console.warn('⚠️ Failed to send screenshot to Telegram:', json.description);
      }
    } catch (error) {
      console.warn('⚠️ Error sending screenshot to Telegram:', error.message);
    }
  }

  async getCaptchaFromReadline(captchaPath) {
    try {
      exec(`start "" "${captchaPath}"`);
    } catch (error) {
      console.warn('Could not open captcha image automatically:', error.message);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question('Please enter the CAPTCHA result: ', (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  async getCaptchaFromTelegram(captchaPath) {
    const captchaSentDate = await this.sendCaptchaToTelegram(captchaPath);
    return await this.waitForCaptchaAnswer(captchaSentDate);
  }

  async sendCaptchaToTelegram(filepath) {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      throw new Error('❌ Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env');
    }

    const form = new FormData();
    form.append('chat_id', process.env.TELEGRAM_CHAT_ID);
    form.append('photo', createReadStream(filepath));

    const res = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`,
      {
        method: 'POST',
        body: form,
        headers: form.getHeaders(),
      }
    );

    const json = await res.json();

    if (json.ok && json.result && json.result.date) {
      return json.result.date;
    } else {
      throw new Error(`❌ Failed to send photo: ${JSON.stringify(json)}`);
    }
  }

  async waitForCaptchaAnswer(captchaSentDate) {
    console.log('⏳ Waiting for CAPTCHA answer...');

    while (true) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates`
        );
        const data = await res.json();

        for (const update of data.result) {
          const msg = update.message;

          if (
            msg &&
            msg.chat.id.toString() === process.env.TELEGRAM_CHAT_ID.toString() &&
            msg.date >= captchaSentDate
          ) {
            const text = msg.text?.trim();

            if (text && /^-?\d+$/.test(text)) {
              return text;
            }
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch (err) {
        console.error('Error checking for updates:', err.message);
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }
  }

  async run(action, channel = 'readline') {
    let captchaPath = null;

    try {
      await this.initialize();

      captchaPath = await this.getCaptchaImage();

      const captchaAnswer =
        channel === 'telegram'
          ? await this.getCaptchaFromTelegram(captchaPath)
          : await this.getCaptchaFromReadline(captchaPath);

      await this.login(captchaAnswer);
      await this.navigateToCheckIn();
      await this.performPunch(action);

      const screenshotPath = await this.takeScreenshot(action, channel === 'readline');

      if (channel === 'telegram') {
        await this.sendScreenshotToTelegram(screenshotPath);
      }
    } catch (error) {
      console.error('❌ Error during execution:', error.message);
      throw error;
    } finally {
      await this.cleanup();

      if (captchaPath) {
        try {
          await fs.unlink(captchaPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
}

// Main execution
async function main() {
  const action = process.argv[2];
  const channel = process.argv[3];

  if (!action || !['in', 'out'].includes(action)) {
    console.error('❌ Usage: node punch.js [in|out] [telegram?]');
    process.exit(1);
  }

  const puncher = new TimecardPuncher();

  try {
    await puncher.run(action, channel);
    console.log('🎉 Process completed successfully');
  } catch (error) {
    console.error('💥 Process failed:', error.message);
    process.exit(1);
  }
}

main();
