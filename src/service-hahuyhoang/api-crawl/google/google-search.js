import { MessageMention } from "zlbotdqt";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";
import { sendMessageCompleteRequest, sendMessageWarningRequest } from "../../chat-zalo/chat-style/chat-style.js";
import path from "path";
import { tempDir } from "../../../utils/io-json.js";
import { deleteFile } from "../../../utils/util.js";

export async function handleGoogleCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();

  if (!keyword) {
    return await sendMessageWarningRequest(api, message, {
      caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} Cách làm bánh flan`,
    }, 30000);
  }

  const tempFileName = `google_search_result_${Date.now()}.png`;
  const imagePath = path.join(tempDir, tempFileName);
  let browser;

  try {
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
      ],
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Thiết lập user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Ẩn dấu hiệu webdriver
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Truy cập Google với ngôn ngữ tiếng Việt
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(keyword)}&hl=vi`, {
      waitUntil: "networkidle2",
      timeout: 30000
    });

    // Đặt kích thước viewport
    await page.setViewport({ width: 1366, height: 768 });

    // Đợi một chút để trang load hoàn toàn
    await page.waitForTimeout(2000);

    // Chụp màn hình
    await page.screenshot({ 
      path: imagePath, 
      fullPage: false // Chỉ chụp phần nhìn thấy, không scroll
    });

    // Gửi ảnh kèm caption
    await sendMessageCompleteRequest(api, message, {
      caption: `🔎 Kết quả tìm kiếm cho: "${keyword}"`,
      attachments: [imagePath],
    }, 180000);

  } catch (error) {
    console.error("Lỗi khi chụp màn hình Google:", error);
    await sendMessageWarningRequest(api, message, {
      caption: `⚠️ Đã xảy ra lỗi khi tìm kiếm. Vui lòng thử lại sau!`
    }, 30000);
  } finally {
    if (browser) await browser.close();
    await deleteFile(imagePath);
  }
}
