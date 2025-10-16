import axios from "axios";
import schedule from "node-schedule";
import { MessageMention } from "../../../api-zalo/index.js";
import { getGlobalPrefix } from "../../service.js";
import {
  sendMessageCompleteRequest,
  sendMessageProcessingRequest,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../../utils/format-util.js";
import { setSelectionsMapData } from "../index.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { downloadAndSaveVideo, deleteFile } from "../../../utils/util.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { getBotId } from "../../../index.js";

// Author: ndqitvn
// Description: Code get data youtube by N D Q (ndqitvn)
// Note: This code is not working, let goto https://www.capcut.com/vi-vn/templates and copy new request headers of search capcut

const CONFIG = {
  baseUrl: "https://edit-api-sg.capcut.com",
  searchPath: "/lv/v1/cc_web/replicate/search_templates",
  headers: {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9,vi;q=0.8",
    "app-sdk-version": "48.0.0",
    "appvr": "5.8.0",
    "content-type": "application/json",
    "device-time": "1734146729",
    "lan": "vi-VN",
    "loc": "va",
    "origin": "https://www.capcut.com",
    "pf": "7",
    "priority": "u=1, i",
    "referer": "https://www.capcut.com/",
    "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"Android"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "sign": "8c69245fb9e23bbe2401518a277ef9d4",
    "sign-ver": "1",
    "user-agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
  },
  maxResults: 10,
  timeWaitSelection: 60000,
};

const PLATFORM = "capcut";

const templateSelectionsMap = new Map();

export const searchCapcut = async (query, limit = CONFIG.maxResults) => {
  try {
    const data = {
      cc_web_version: 0,
      count: limit,
      cursor: "0",
      enter_from: "workspace",
      query: query,
      scene: 1,
      sdk_version: "86.0.0",
      search_version: 2,
    };

    const response = await axios.post(`${CONFIG.baseUrl}${CONFIG.searchPath}`, data, {
      headers: CONFIG.headers,
      timeout: 10000
    });

    if (!response?.data?.data?.video_templates) {
      throw new Error("Không thể lấy được dữ liệu từ Capcut");
    }

    return response.data.data.video_templates;
  } catch (error) {
    console.error("Lỗi khi tìm kiếm template Capcut:", error.message);
    return [];
  }
};

schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of templateSelectionsMap.entries()) {
    if (currentTime - data.timestamp > CONFIG.timeWaitSelection) {
      templateSelectionsMap.delete(msgId);
    }
  }
});

export async function handleCapcutCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix();
  const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const [keyword, numberTemplate] = commandContent.split("&&");
  let imagePath;

  try {
    if (!keyword) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} Template Cần Tìm`,
      };
      return await sendMessageCompleteRequest(api, message, object, 30000);
    }

    let limit = parseInt(numberTemplate) || CONFIG.maxResults;
    let searchResults = await searchCapcut(keyword, limit);

    if (searchResults.length === 0) {
      object.caption = `Không tìm thấy template phù hợp với cụm từ: ${keyword}`;
      return await sendMessageWarningRequest(api, message, object, 30000);
    }

    const templates = searchResults.map(template => ({
      title: template.title,
      artistsNames: template.author?.nickname || "CapCut Creator",
      thumbnailM: template.cover_url,
      view: template.play_amount,
      like: template.like_count,
      usage: template.usage_amount
    }));

    imagePath = await createSearchResultImage(templates);

    const object = {
      caption: `Đây là kết quả tìm kiếm template của bạn.\nReply tin nhắn này với số thứ tự để chọn template.`,
      imagePath: imagePath,
    };

    const searchResultMessage = await sendMessageCompleteRequest(api, message, object, CONFIG.timeWaitSelection);

    const quotedMsgId = searchResultMessage?.message?.msgId || searchResultMessage?.attachment[0]?.msgId;

    templateSelectionsMap.set(quotedMsgId.toString(), {
      templates: searchResults,
      timestamp: Date.now(),
      senderId: senderId,
      senderName: senderName
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: searchResults,
      timestamp: Date.now(),
      platform: PLATFORM,
    });
  } catch (error) {
    console.error("Lỗi khi xử lý tìm kiếm CapCut:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi tìm kiếm template CapCut, vui lòng thử lại sau.`
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}

export async function handleCapcutReply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = getBotId();

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();
    if (!templateSelectionsMap.has(quotedMsgId)) return false;

    const templateData = templateSelectionsMap.get(quotedMsgId);
    if (templateData.senderId !== senderId) return false;

    const content = removeMention(message);
    const selectedIndex = parseInt(content) - 1;

    if (isNaN(selectedIndex)) {
      const object = {
        caption: `Lựa chọn Không hợp lệ. Vui lòng chọn một số từ danh sách.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    const { templates } = templateSelectionsMap.get(quotedMsgId);
    if (selectedIndex < 0 || selectedIndex >= templates.length) {
      const object = {
        caption: `Số bạn chọn Không nằm trong danh sách. Vui lòng chọn lại.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    const msgDel = {
      type: message.type,
      threadId: message.threadId,
      data: {
        cliMsgId: message.data.quote.cliMsgId,
        msgId: message.data.quote.globalMsgId,
        uidFrom: idBot,
      },
    };
    await api.deleteMessage(msgDel, false);
    // await api.undoMessage(message);
    templateSelectionsMap.delete(quotedMsgId);

    const template = templates[selectedIndex];
    return await handleSendTemplateCapcut(api, message, template);
  } catch (error) {
    console.error("Lỗi xử lý reply Capcut:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý tin nhắn của bạn. Vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return true;
  }
}

export async function handleSendTemplateCapcut(api, message, template) {
  const senderName = message.data.dName;
  const templateId = template.id;
  const cachedVideo = await getCachedMedia(PLATFORM, templateId, "template", template.title);
  let videoUrl;
  if (cachedVideo) {
    videoUrl = cachedVideo.fileUrl;
  } else {
    const object = {
      caption: `Chờ bé lấy video một chút, xong bé gọi cho hay!\n📊 Phân Loại: template`,
    };
    await sendMessageProcessingRequest(api, message, object, 8000);
    const tempFilePath = await downloadAndSaveVideo(template.video_url);
    const uploadResult = await api.uploadAttachment([tempFilePath], message.threadId, message.type);
    videoUrl = uploadResult[0].fileUrl;
    await deleteFile(tempFilePath);

    setCacheData(PLATFORM, templateId, { fileUrl: videoUrl, title: template.title }, "template");
  }

  await api.sendVideo({
    videoUrl,
    threadId: message.threadId,
    threadType: message.type,
    thumbnail: template.cover_url,
    message: {
      text: `[ ${senderName} ]\n` +
        `🎬 Template: ${template.title}\n` +
        `⏱️ Thời Lượng: ${template.duration ? `${(template.duration / 1000).toFixed(0)}s` : "Không rõ"}\n` +
        `👁️ Lượt Xem: ${template.play_amount || 0}\n` +
        `❤️ Lượt Thích: ${template.like_count || 0}\n` +
        `👁️ Lượt Sử Dụng: ${template.usage_amount || 0}\n` +
        `🔗 Link Download Template: ${template.template_url}`,
      // mentions: [MessageMention(senderId, senderName.length, 2, false)],
    },
    ttl: 3600000,
  });

  return true;
}

