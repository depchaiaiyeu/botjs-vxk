import axios from "axios";
import path from "path";
import { getGlobalPrefix } from "../../service.js";
import {
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { downloadFile, deleteFile } from "../../../utils/util.js";
import { capitalizeEachWord, removeMention } from "../../../utils/format-util.js";
import { clearImagePath } from "../../../utils/canvas/index.js";
import { tempDir } from "../../../utils/io-json.js";

import { MultiMsgStyle, MessageStyle, MessageMention } from "../../../api-zalo/index.js";
export const COLOR_GREEN = "15a85f";
export const SIZE_16 = "14";
export const IS_BOLD = true;

let cachedTokens = null;
let tokenExpiry = 0;

const getJ2DownloadTokens = async () => {
  const now = Date.now();
  if (cachedTokens && tokenExpiry > now) {
    return cachedTokens;
  }

  try {
    const response = await axios.get("https://j2download.com/vi", {
      headers: {
        "authority": "j2download.com",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
      }
    });

    const cookies = response.headers['set-cookie'];
    if (!cookies) {
      throw new Error("No cookies received");
    }

    let apiToken = null;
    let csrfToken = null;

    cookies.forEach(cookie => {
      if (cookie.includes('api_token=')) {
        apiToken = cookie.split('api_token=')[1].split(';')[0];
      }
      if (cookie.includes('csrf_token=')) {
        csrfToken = cookie.split('csrf_token=')[1].split(';')[0];
      }
    });

    if (!apiToken || !csrfToken) {
      throw new Error("Tokens not found in cookies");
    }

    cachedTokens = { apiToken, csrfToken };
    tokenExpiry = now + 4 * 60 * 1000;

    return cachedTokens;
  } catch (error) {
    throw new Error("Failed to get tokens");
  }
};

export const getDataDownloadVideo = async (url) => {
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      const { apiToken, csrfToken } = await getJ2DownloadTokens();

      const response = await axios.post(
        "https://j2download.com/api/autolink",
        {
          data: {
            url: url,
            unlock: true
          }
        },
        {
          headers: {
            "authority": "j2download.com",
            "accept": "application/json, text/plain, */*",
            "accept-language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7",
            "content-type": "application/json",
            "origin": "https://j2download.com",
            "referer": "https://j2download.com/vi",
            "sec-ch-ua": '"Chromium";v="137", "Not/A)Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Linux"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
            "x-csrf-token": csrfToken,
            "cookie": `api_token=${apiToken}; csrf_token=${csrfToken}`
          }
        }
      );

      if (response.data && !response.data.error) {
        return response.data;
      }
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        cachedTokens = null;
        tokenExpiry = 0;
      }
    }
    
    attempts++;
    if (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
    }
  }
  return null;
};

export async function processAndSendMedia(api, message, mediaData) {
  const {
    selectedMedia,
    mediaType,
    duration,
    title,
    author,
    senderId,
    senderName
  } = mediaData;

  const quality = selectedMedia.quality || "default";
  const typeFile = selectedMedia.type.toLowerCase();

  if ((mediaType === "youtube" || mediaType === "instagram") && duration > 3600000) {
    const object = {
      caption: "Vì tài nguyên có hạn, Không thể lấy video có độ dài hơn 60 phút!\nVui lòng chọn video khác.",
    };
    return await sendMessageWarningRequest(api, message, object, 30000);
  }

  const videoUrl = await categoryDownload(api, message, mediaType, selectedMedia, quality);
  if (!videoUrl) {
    const object = {
      caption: `Không tải được dữ liệu...`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }
  
  if (typeFile === "video") {
    const caption =
      `[ ${senderName} ]\n` +
      `🎥 Nền Tảng: ${capitalizeEachWord(mediaType)}\n` +
      `🎬 Tiêu Đề: ${title}\n` +
      `${author && author !== "Unknown Author" ? `👤 Người Đăng: ${author}\n` : ""}` +
      `📊 Chất lượng: ${quality}`;
    await api.sendVideo({
      videoUrl: videoUrl,
      threadId: message.threadId,
      threadType: message.type,
      thumbnail: selectedMedia.thumbnail,
      message: {
        text: caption
      }
    });
  }
}

export async function handleDownloadCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix();

  try {
    const query = content.replace(`${prefix}${aliasCommand}`, "").trim();

    if (!query) {
      const object = {
        caption: `Vui lòng nhập link cần tải\nVí dụ:\n${prefix}${aliasCommand} <link>`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    let dataDownload = await getDataDownloadVideo(query);
    if (!dataDownload || dataDownload.error) {
      const object = {
        caption: `Link Không hợp lệ hoặc Không hỗ trợ tải dữ liệu link dạng này.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }
    
    const dataLink = [];
    let uniqueId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;

    dataDownload.medias.forEach((item) => {
      if (item.type.toLowerCase() !== "audio") {
        dataLink.push({
          url: item.url,
          quality: item.quality || "unknown",
          type: item.type.toLowerCase(),
          title: dataDownload.title,
          thumbnail: dataDownload.thumbnail,
          extension: item.extension,
        });
      }
    });

    if (dataLink.length === 0) {
      const object = {
        caption: `Không tìm thấy dữ liệu tải về phù hợp cho link này!\nVui lòng thử lại với link khác.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const onlyImages = dataLink.every(item => item.type.toLowerCase() === "image");
    const mediaType = dataDownload.source;
    const title = dataDownload.title;
    const author = dataDownload.author || "Unknown Author";
    const duration = dataDownload.duration || 0;
    
    if (onlyImages) {
      if (dataLink.length === 1) {
        const media = dataLink[0];
        const uniqueFileName = `${uniqueId}_${Math.random().toString(36).substring(7)}.${media.extension}`;
        const filePath = path.resolve(tempDir, uniqueFileName);
        await downloadFile(media.url, filePath);

        const caption =
          `[ ${senderName} ]\n` +
          `🎥 Nền Tảng: ${capitalizeEachWord(mediaType)}\n` +
          `🎬 Tiêu Đề: ${title}\n` +
          `${author !== "Unknown Author" ? `👤 Người Đăng: ${author}\n` : ""}` +
          `📊 Chất Lượng: Ảnh`;

        await api.sendMessage({
          msg: caption,
          attachments: [filePath],
        }, message.threadId, message.type);

        await clearImagePath(filePath);
      } else {
        const attachmentPaths = [];
    
        for (const media of dataLink) {
          const uniqueFileName = `${uniqueId}_${Math.random().toString(36).substring(7)}.${media.extension}`;
          const filePath = path.resolve(tempDir, uniqueFileName);
          await downloadFile(media.url, filePath);
          attachmentPaths.push(filePath);
        }

        const caption =
          `[ ${senderName} ]\n` +
          `🎥 Nền Tảng: ${capitalizeEachWord(mediaType)}\n` +
          `🎬 Tiêu Đề: ${title}\n` +
          `${author !== "Unknown Author" ? `👤 Người Đăng: ${author}\n` : ""}` +
          `📊 Số ảnh: ${attachmentPaths.length}`;

        await api.sendMessage({
          msg: caption,
        }, message.threadId, message.type);

        await api.sendMessage({
          msg: "",
          attachments: attachmentPaths,
        }, message.threadId, message.type);
    
        for (const filePath of attachmentPaths) {
          await clearImagePath(filePath);
        }
      }
    
      return;
    } else {
      const videos = dataLink.filter(item => item.type.toLowerCase() === "video");
      if (videos.length === 0) {
        return;
      }

      const sortedVideos = videos.sort((a, b) => {
        const qa = parseInt((a.quality || "0").replace(/[^0-9]/g, ""));
        const qb = parseInt((b.quality || "0").replace(/[^0-9]/g, ""));
        return qb - qa;
      });

      const selectedMedia = sortedVideos[0];

      await processAndSendMedia(api, message, {
        selectedMedia,
        mediaType,
        uniqueId,
        duration,
        title,
        author,
        senderId,
        senderName,
      });
    }
  } catch (error) {
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý lệnh load data download.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}

export async function categoryDownload(api, message, platform, selectedMedia, quality) {
  let tempFilePath;
  try {
    tempFilePath = path.join(tempDir, `${platform}_${Date.now()}_${Math.random().toString(36).substring(7)}.${selectedMedia.extension}`);
    await downloadFile(selectedMedia.url, tempFilePath);
    const uploadResult = await api.uploadAttachment([tempFilePath], message.threadId, message.type);
    const videoUrl = uploadResult[0].fileUrl;
    await deleteFile(tempFilePath);
    return videoUrl;
  } catch (error) {
    await deleteFile(tempFilePath);
    return null;
  }
}
