import { MessageMention } from "zlbotdqt";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { getGlobalPrefix } from "../../service.js";
import { tempDir } from "../../../utils/io-json.js";
import { removeMention } from "../../../utils/format-util.js";
import { deleteFile } from "../../../utils/util.js";

const CONFIG = {
  paths: { saveDir: tempDir },
  messages: {
    noQuery: (name, prefix, command) => `${name} Vui lòng nhập từ khóa tìm kiếm. Ví dụ: ${prefix}${command} anime girl`,
    screenshotResult: (name, query) => `[${name}] Kết quả cho "${query}"`,
    apiError: (name) => `${name} Lỗi khi tìm kiếm ảnh :(((`,
    bannedKeyword: (name) => `${name} Từ khóa tìm kiếm này bị cấm!`
  },
  headers: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  },
  bannedKeywords: [
    "lồn","l0n","lon","l.on","l*n","loz","ngực","nguc","nguwc","vú","vu",
    "cặc","cac","cak","kak","cứt","cut","shit","sex","porn","xxx","18+",
    "dick","cock","penis","pussy","vagina","boob","breast","nude","naked",
    "hentai","nsfw","adult","strip","fuck","fucking","ml","đm","dm","vl"
  ]
};

async function captureGoogleScreenshot(query, savePath) {
  const browser = await puppeteer.launch({
    args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  });
  const page = await browser.newPage();
  await page.setUserAgent(CONFIG.headers.userAgent);
  await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, { waitUntil: 'networkidle2' });
  await page.setViewport({ width: 1366, height: 768 });
  await page.screenshot({ path: savePath, fullPage: true });
  await browser.close();
}

export async function searchImageGoogle(api, message, command) {
  const content = removeMention(message);
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;
  const prefix = getGlobalPrefix();
  const query = content.replace(`${prefix}${command}`, "").trim().toLowerCase();

  if (!query) {
    await api.sendMessage(
      { msg: CONFIG.messages.noQuery(senderName, prefix, command), quote: message, mentions: [MessageMention(senderId, senderName.length, 0)] },
      threadId,
      message.type
    );
    return;
  }

  const hasBannedKeyword = CONFIG.bannedKeywords.some(k => query.includes(k));
  if (hasBannedKeyword) {
    await api.sendMessage(
      { msg: CONFIG.messages.bannedKeyword(senderName), quote: message, mentions: [MessageMention(senderId, senderName.length, 0)] },
      threadId,
      message.type
    );
    return;
  }

  const tempFileName = `google_screenshot_${Date.now()}.png`;
  const imagePath = path.join(CONFIG.paths.saveDir, tempFileName);

  try {
    await captureGoogleScreenshot(query, imagePath);
    await api.sendMessage(
      { msg: CONFIG.messages.screenshotResult(senderName, query), mentions: [MessageMention(senderId, senderName.length, 1)], attachments: [imagePath], ttl: 300000 },
      threadId,
      message.type
    );
  } catch (error) {
    console.error(error);
    await api.sendMessage(
      { msg: CONFIG.messages.apiError(senderName), quote: message, mentions: [MessageMention(senderId, senderName.length, 0)] },
      threadId,
      message.type
    );
  } finally {
    await deleteFile(imagePath);
  }
}
