# Punchcards

Automated punch-in/out script using Puppeteer + Telegram integration for manual CAPTCHA input.

## Installation

```bash
git clone https://github.com/aaronchen/punchcards.git
cd punchcards
npm install
```

## Basic Usage

Fill out the `.env` file with your credentials:

```bash
WITS_USERNAME=your_account
WITS_PASSWORD=your_password
```

```bash
node punch.js in     # For punch in
node punch.js out    # For punch out
```

After CAPTCHA is displayed, manually enter the text in the prompt.

## Shortcuts

You can create Desktop shortcuts by linking:

- punch-in.bat → Punch In
- punch-out.bat → Punch Out

These scripts launch the appropriate Node.js command.

## Use Telegram

### Create a Telegram Bot

- Open Telegram and search for @BotFather
- Type /newbot
- Follow prompts to:
  - Name your bot
  - Get a bot token like: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
  - Set this token to `TELEGRAM_BOT_TOKEN` in `.env`

### Get Your Telegram Chat ID

- Start a conversation with your bot
  - Search the name of your bot, and just type `Hi` in the chatbot
- Visit this URL in your browser, replacing <TOKEN> with your bot token:

  ```bash
  https://api.telegram.org/bot<TOKEN>/getUpdates
  ```

- Look for the response with "chat": { "id": ... }
- That value is your chat Id
- Set this chat Id to `TELEGRAM_CHAT_ID` in `.env`

```bash
# You can also test if Telegram works with curl:
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendMessage" -d chat_id=<TELEGRAM_CHAT_ID> -d text="Hi"
```

### Updated `.env`

```bash
WITS_USERNAME=your_account
WITS_PASSWORD=your_password
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
```

### Start Telegram Listener

```bash
npm install -g pm2
pm2 start listener.js --name telegram-listener
pm2 save
```

- You can now send:
  - `pi` → Punch In
  - `po` → Punch Out
- CAPTCHA image will be sent via Telegram; reply with the number to complete punching in or out.

### Optional: Auto-start on Windows Boot

If you're using Windows, PM2 doesn’t handle startup automatically — you need to add a scheduled task:

#### Steps:

- Open Task Scheduler
- Create a new task:
  - Name: PM2 Autostart
  - Run only when user is logged on ✅
  - Trigger: At log on
  - Action:
    - Program/script: pm2 (Use `where pm2.cmd` to get the exact path for pm2)
    - Arguments: resurrect
    - Save and test by restarting or logging off and on.

## Development

```bash
git init
echo "node_modules/" > .gitignore

npm init -y
npm install puppeteer

npm install --save-dev eslint
npx eslint --init

npm install --save-dev prettier eslint-config-prettier eslint-plugin-prettier

npm run lint
npm run format
```
