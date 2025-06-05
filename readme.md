# Installation

```bash
git clone https://github.com/aaronchen/punchcards.git
cd punchcards
npm install
```

# Usage

Fill out `WITS_USERNAME` and `WITS_PASSWORD` in `.env` file.

```bash
node punch.js in     # For punch in
node punch.js out    # For punch out
```

After CAPTCHA is displayed, manually enter the text in the prompt.

# Shortcuts

You can create shortcuts on your Desktop by linking `punch-in.bat` and `punch-out.bat`.

# Development

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
