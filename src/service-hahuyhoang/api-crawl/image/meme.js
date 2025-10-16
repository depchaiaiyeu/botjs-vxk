import axios from "axios";
import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { LRUCache } from "lru-cache";
import { fileURLToPath } from "url";
import { getGlobalPrefix } from "../../service.js";
import {
  sendMessageCompleteRequest,
  sendMessageFromSQL,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../../utils/format-util.js";
import { setSelectionsMapData } from "../index.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { deleteFile } from "../../../utils/util.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { getBotId, isAdmin } from "../../../index.js";
import { processAndSendSticker } from "../../chat-zalo/chat-special/send-sticker/send-sticker.js";

let apiKey = "AIzaSyC-P6_qz3FzCoXGLk6tgitZo4jEJ5mLzD8";
let clientKey = "tenor_web";

const PLATFORM = "tenor";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
];
const TIME_TO_SELECT = 60000;

const acceptLanguages = ["en-US,en;q=0.9", "fr-FR,fr;q=0.9", "es-ES,es;q=0.9", "de-DE,de;q=0.9", "zh-CN,zh;q=0.9"];

const getRandomElement = (array) => {
  return array[Math.floor(Math.random() * array.length)];
};

const getHeaders = () => {
  return {
    "User-Agent": getRandomElement(userAgents),
    "Accept-Language": getRandomElement(acceptLanguages),
    Referer: "https://tenor.com/",
    "Upgrade-Insecure-Requests": "1",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  };
};

async function getMemesInfo(question, limit) {
  limit = limit || 10;
  try {
    const response = await axios.get("https://tenor.googleapis.com/v2/search", {
      params: {
        q: question,
        key: apiKey,
        client_key: clientKey,
        locale: "en",
        limit: limit,
        contentfilter: "low",
        media_filter: "gif,gif_transparent,mediumgif,tinygif,tinygif_transparent,webp,webp_transparent,tinywebp,tinywebp_transparent,tinymp4,mp4,webm,originalgif,gifpreview",
        fields: "next,results.id,results.media_formats,results.title,results.h1_title,results.long_title,results.itemurl,results.url,results.created,results.user,results.shares,results.embed,results.hasaudio,results.policy_status,results.source_id,results.flags,results.tags,results.content_rating,results.bg_color,results.legacy_info,results.geographic_restriction,results.content_description",
        searchfilter: "none",
        component: "web_desktop",
        appversion: "browser-r20250506-2",
        prettyPrint: false,
      },
      headers: getHeaders(),
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching memes info:", error);
    return null;
  }
}

async function getMemeUrl(meme) {
  try {
    const headers = getHeaders();
    const mediaFormats = meme.media_formats;
    let url = mediaFormats.gif?.url || mediaFormats.webp?.url || mediaFormats.mp4?.url;
    if (!url) {
      throw new Error("Không tìm thấy URL meme");
    }
    return url;
  } catch (error) {
    console.error("Error getting meme URL:", error);
    return null;
  }
}

const memeSelectionsMap = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT
});

export async function handleMemeCommand(api, message, aliasCommand) {
  let imagePath = null;
  try {
    const content = removeMention(message);
    const senderId = message.data.uidFrom;
    const prefix = getGlobalPrefix();
    const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();
    const [question, numberMeme] = commandContent.split("&&");

    if (!question) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} cat`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const memeInfo = await getMemesInfo(question, parseInt(numberMeme));
    if (!memeInfo || !memeInfo.results || memeInfo.results.length === 0) {
      const object = {
        caption: `Không tìm thấy meme nào với từ khóa: ${question}`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    let memeListTxt = "Đây là danh sách meme trên Tenor mà tôi tìm thấy:\n";
    memeListTxt += "Hãy trả lời tin nhắn này với số index của meme bạn muốn chọn!";
    memeInfo.results = memeInfo.results.filter((meme) => meme.media_formats && (meme.media_formats.gif || meme.media_formats.webp));

    if (memeInfo.results.length === 0) {
      const object = {
        caption: `Không tìm thấy meme nào với từ khóa: ${question}`,
      };
      await sendMessageWarningRequest(api, message, object, TIME_TO_SELECT);
      return;
    }

    const memes = memeInfo.results.map(meme => ({
      title: meme.title,
      artistsNames: meme.user ? meme.user.username : "Unknown",
      thumbnailM: meme.media_formats.preview ? meme.media_formats.preview.url : null,
      listen: null,
      like: null,
      comment: null
    }));

    imagePath = await createSearchResultImage(memes);

    const object = {
      caption: memeListTxt,
      imagePath: imagePath,
    };
    const memeListMessage = await sendMessageCompleteRequest(api, message, object, 30000);

    const quotedMsgId = memeListMessage?.message?.msgId || memeListMessage?.attachment[0]?.msgId;
    memeSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      collection: memeInfo.results,
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: memeInfo.results,
      timestamp: Date.now(),
      platform: PLATFORM,
    });

  } catch (error) {
    console.error("Error handling meme command:", error);
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: "Đã xảy ra lỗi khi xử lý lệnh của bạn. Vui lòng thử lại sau.",
      },
      true,
      30000
    );
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}

export async function handleMemeReply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = getBotId();
  let meme;

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();
    if (!memeSelectionsMap.has(quotedMsgId)) return false;

    const memeData = memeSelectionsMap.get(quotedMsgId);
    if (memeData.userRequest !== senderId) return false;

    let selection = removeMention(message);
    const selectedIndex = parseInt(selection) - 1;
    if (isNaN(selectedIndex)) {
      const object = {
        caption: `Lựa chọn Không hợp lệ. Vui lòng chọn một số từ danh sách.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    const { collection } = memeSelectionsMap.get(quotedMsgId);
    if (selectedIndex < 0 || selectedIndex >= collection.length) {
      const object = {
        caption: `Số bạn chọn Không nằm trong danh sách. Vui lòng chọn lại.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    meme = collection[selectedIndex];

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
    memeSelectionsMap.delete(quotedMsgId);

    return await handleSendMeme(api, message, meme);
  } catch (error) {
    console.error("Error handling meme reply:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý lấy meme từ Tenor cho bạn, vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return true;
  }
}

export async function handleSendMeme(api, message, meme) {
  const senderName = message.data.name || "bạn";
  const cachedMeme = await getCachedMedia(PLATFORM, meme.id, null, meme.title);
  let mediaUrl;

  const object = {
    caption: `Chờ bé lấy meme một chút, xong bé gửi cho hay.` + `\n\n⏳ ${meme.title}`,
  };

  if (cachedMeme) {
    mediaUrl = cachedMeme.fileUrl;
  } else {
    await sendMessageCompleteRequest(api, message, object, 10000);
    mediaUrl = await getMemeUrl(meme);

    if (!mediaUrl) {
      const object = {
        caption: `Xin lỗi, bé Không thể lấy được meme này. Vui lòng thử lại meme khác.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    setCacheData(PLATFORM, meme.id, {
      title: meme.title,
      artist: meme.user ? meme.user.username : "Unknown",
      fileUrl: mediaUrl,
    }, null);
  }

  try {
    await processAndSendSticker(api, message, mediaUrl);
    return true;
  } catch (error) {
    console.error("Error processing sticker:", error);
    const caption = `@${senderName}\nMeme của bạn đây!`;
    const objectFallback = {
      attachment: [{
        type: "photo",
        url: mediaUrl,
      }],
      caption: caption,
    };
    await sendMessageCompleteRequest(api, message, objectFallback, 30000);
    return true;
  }
}
