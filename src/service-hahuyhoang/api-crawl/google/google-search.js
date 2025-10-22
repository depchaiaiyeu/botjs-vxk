import axios from "axios";
import * as cheerio from "cheerio";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";
import { sendMessageCompleteRequest, sendMessageWarningRequest } from "../../chat-zalo/chat-style/chat-style.js";

const CONFIG = {
  baseUrl: "https://www.google.com",
  searchPath: "/search",
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://www.google.com/",
  },
};

const searchGoogle = async (query, limit = 10) => {
  try {
    const url = `${CONFIG.baseUrl}${CONFIG.searchPath}?q=${encodeURIComponent(query)}&num=${limit}`;
    const response = await axios.get(url, { headers: CONFIG.headers, timeout: 12000 });
    const $ = cheerio.load(response.data);
    const results = [];

    $("div.tF2Cxc").each((i, element) => {
      if (i >= limit) return false;
      const title = $(element).find("h3").text().trim();
      const link = $(element).find("a").attr("href");
      const snippet = $(element).find(".VwiC3b").text().trim();
      if (title && link && /^https?:\/\//.test(link)) {
        results.push({ title, link, snippet });
      }
    });

    if (results.length === 0) {
      $("a h3").each((i, element) => {
        if (i >= limit) return false;
        const title = $(element).text().trim();
        const link = $(element).parent("a").attr("href");
        if (title && link && /^https?:\/\//.test(link)) {
          results.push({ title, link, snippet: "" });
        }
      });
    }

    return results;
  } catch (error) {
    console.error("Lỗi khi tìm kiếm Google:", error.message);
    return [];
  }
};

export async function handleGoogleCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();

  try {
    if (!keyword) {
      return await sendMessageWarningRequest(api, message, {
        caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} Cách làm bánh flan`,
      }, 30000);
    }

    const results = await searchGoogle(keyword, 10);
    if (results.length === 0) {
      return await sendMessageWarningRequest(api, message, {
        caption: `Không tìm thấy kết quả nào cho từ khóa: "${keyword}".`,
      }, 30000);
    }

    let responseText = `🔎 Kết quả tìm kiếm cho "${keyword}":\n\n`;
    results.forEach((r, i) => {
      responseText += `${i + 1}. ${r.title}\n`;
      if (r.snippet) responseText += `📝 ${r.snippet}\n`;
      responseText += `🔗 ${r.link}\n\n`;
    });

    await sendMessageCompleteRequest(api, message, { caption: responseText.trim() }, 180000);
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh Google:", error);
    await sendMessageWarningRequest(api, message, {
      caption: "Đã xảy ra lỗi khi tìm kiếm. Vui lòng thử lại sau!",
    }, 30000);
  }
}
