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
  }
};

const searchGoogle = async (query, limit = 20) => {
  try {
    const searchUrl = `${CONFIG.baseUrl}${CONFIG.searchPath}?q=${encodeURIComponent(query)}&num=${limit}`;

    const response = await axios.get(searchUrl, {
      headers: CONFIG.headers,
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const results = [];

    $('div.g').each((i, element) => {
      if (i >= limit) return false;

      const titleElement = $(element).find('h3');
      const linkElement = $(element).find('a').first();
      const snippetElement = $(element).find('.VwiC3b');

      const title = titleElement.text().trim();
      const link = linkElement.attr('href');
      const snippet = snippetElement.text().trim();

      if (title && link && link.startsWith('http')) {
        results.push({
          title,
          link,
          snippet
        });
      }
    });

    return results;

  } catch (error) {
    console.error("Lỗi khi tìm kiếm Google:", error);
    return [];
  }
};

export async function handleGoogleCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();

  try {
    if (!keyword) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} Nội dung cần tìm`,
      };
      return await sendMessageWarningRequest(api, message, object, 30000);
    }

    let results = await searchGoogle(keyword);

    if (results.length === 0) {
      const object = {
        caption: `Không tìm thấy kết quả nào cho từ khóa: ${keyword}`,
      };
      return await sendMessageWarningRequest(api, message, object, 30000);
    }

	results = results.slice(0, 10);

    let responseText = `🔎 Kết quả tìm kiếm cho "${keyword}":\n\n`;
    results.forEach((result, index) => {
      responseText += `${index + 1}. ${result.title}\n`;
      responseText += `🔗: ${result.link}\n\n`;
    });

    const object = {
      caption: responseText,
    };

    await sendMessageCompleteRequest(api, message, object, 180000);

  } catch (error) {
    console.error("Lỗi khi xử lý lệnh Google:", error);
    const object = {
      caption: "Đã xảy ra lỗi khi tìm kiếm. Vui lòng thử lại sau!",
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}
