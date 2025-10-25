import { MessageMention } from "zlbotdqt";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";
import { sendMessageCompleteRequest, sendMessageWarningRequest } from "../../chat-zalo/chat-style/chat-style.js";
import path from "path";
import fs from "fs";
import { tempDir } from "../../../utils/io-json.js";
import { deleteFile } from "../../../utils/util.js";

export async function handleGoogleCommandWithChromium(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;

  if (!keyword) {
    return await sendMessageWarningRequest(api, message, {
      caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} Cách làm bánh flan`,
    }, 30000);
  }

  const tempFileName = `google_screenshot_${Date.now()}.png`;
  const imagePath = path.join(tempDir, tempFileName);

  let browser;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(keyword)}`, { waitUntil: "networkidle2" });
    await page.setViewport({ width: 1366, height: 768 });

    const results = await page.evaluate(() => {
      const nodes = document.querySelectorAll("div.tF2Cxc");
      const arr = [];
      nodes.forEach((el) => {
        const title = el.querySelector("h3")?.innerText.trim() || "";
        const link = el.querySelector("a")?.href || "";
        const snippet = el.querySelector(".VwiC3b")?.innerText.trim() || "";
        if (title && link) arr.push({ title, link, snippet });
      });
      return arr.slice(0, 10);
    });

    await page.screenshot({ path: imagePath, fullPage: true });

    let responseText = `🔎 Kết quả tìm kiếm cho "${keyword}":\n\n`;
    if (results.length === 0) responseText = `Không tìm thấy kết quả nào cho từ khóa: "${keyword}".`;
    else results.forEach((r, i) => {
      responseText += `${i + 1}. ${r.title}\n`;
      if (r.snippet) responseText += `📝 ${r.snippet}\n`;
      responseText += `🔗 ${r.link}\n\n`;
    });

    await sendMessageCompleteRequest(api, message, {
      caption: responseText.trim(),
      attachments: [imagePath],
    }, 180000);

  } catch (error) {
    console.error("Lỗi khi xử lý Google với Chromium:", error);
    await sendMessageWarningRequest(api, message, { caption: "Đã xảy ra lỗi khi tìm kiếm. Vui lòng thử lại sau!" }, 30000);
  } finally {
    if (browser) await browser.close();
    await deleteFile(imagePath);
  }
}
