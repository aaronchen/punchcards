import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile } from 'fs/promises';
import { exec } from 'child_process';
import readline from 'readline';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.WITS_USERNAME || !process.env.WITS_PASSWORD) {
  console.error('❌ Missing WITS_USERNAME or WITS_PASSWORD in .env');
  process.exit(1);
}

const run = async () => {
  const action = process.argv[2];

  if (action !== 'in' && action !== 'out') {
    console.error('❌ Usage: node punch.js [in|out]');
    process.exit(1);
  }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://cbs.wits.com/login');

  const base64 = await page.$eval('img[src^="data:image"]', (img) =>
    img.src.replace(/^data:image\/png;base64,/, '')
  );

  const tmpPath = join(tmpdir(), 'captcha.png');
  await writeFile(tmpPath, base64, 'base64');
  exec(`start "" "${tmpPath}"`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Please enter the CAPTCHA result: ', async (answer) => {
    rl.close();

    await page.type('[placeholder="帳號"]', process.env.WITS_USERNAME);
    await page.type('[placeholder="密碼"]', process.env.WITS_PASSWORD);
    await page.type('[placeholder="驗證碼"]', answer);
    await page.click('button');

    await page.waitForSelector('.dashboard-container', { visible: true });
    await page.goto('https://cbs.wits.com/employee/checkIn');
    await page.waitForSelector('.checkin-btn-row', { visible: true });

    const nth = action === 'in' ? 1 : 2;
    const buttonSelector = `.checkin-btn-row button:nth-of-type(${nth})`;

    await page.waitForSelector(buttonSelector, { visible: true });

    await page.waitForFunction(
      (selector) => {
        const btn = document.querySelector(selector);

        if (!btn) {
          return false;
        }

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

    const button = await page.$(buttonSelector);
    const isDisabled = await page.evaluate((btn) => btn.disabled, button);

    if (!isDisabled) {
      await button.click();
      console.log(`✅ Punched ${action} successfully`);
    } else {
      console.log(`⛔ Already punched ${action}`);
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const timestamp = now.toISOString().slice(0, 16).replace('T', '-').replace(':', '-');

    const dir = `${year}/${month}`;
    await fs.mkdir(dir, { recursive: true });

    const filename = `${dir}/${timestamp}.png`;
    await page.screenshot({ path: filename });

    console.log(`Screenshot saved as ${filename}`);
    exec(`start ${filename}`);

    await browser.close();
  });
};

run();
