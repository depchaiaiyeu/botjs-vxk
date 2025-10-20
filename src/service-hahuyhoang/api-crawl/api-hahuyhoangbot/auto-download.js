import { MessageMention } from "zlbotdqt";
import { sendMessageStateQuote } from "../../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../../utils/format-util.js";
import { getDataDownloadVideo, processAndSendMedia } from "./aio-downlink.js";
import { capitalizeEachWord } from "../../../utils/format-util.js";
import path from "path";
import { downloadFile } from "../../../utils/util.js";
import { clearImagePath } from "../../../utils/canvas/index.js";
import { tempDir } from "../../../utils/io-json.js";
import { admins } from "../../../index.js";

export const SUPPORTED_PLATFORMS = [
  { name: 'tiktok', patterns: ['tiktok.com', 'vt.tiktok.com', 'vm.tiktok.com'] },
  { name: 'instagram', patterns: ['instagram.com', 'instagr.am'] },
  { name: 'facebook', patterns: ['facebook.com', 'fb.watch', 'fb.com'] },
  { name: 'youtube', patterns: ['youtube.com', 'youtu.be'] },
  { name: 'threads', patterns: ['threads.net'] },
  { name: 'twitter', patterns: ['twitter.com', 'x.com'] },
  { name: 'pinterest', patterns: ['pinterest.com', 'pin.it'] },
  { name: 'reddit', patterns: ['reddit.com', 'redd.it'] },
  { name: 'tumblr', patterns: ['tumblr.com'] },
  { name: 'snapchat', patterns: ['snapchat.com'] },
  { name: 'linkedin', patterns: ['linkedin.com'] },
  { name: 'dailymotion', patterns: ['dailymotion.com', 'dai.ly'] },
  { name: 'vimeo', patterns: ['vimeo.com'] },
  { name: 'soundcloud', patterns: ['soundcloud.com'] }
];

function detectPlatform(url) {
  const lowerUrl = url.toLowerCase();
  
  for (const platform of SUPPORTED_PLATFORMS) {
    for (const pattern of platform.patterns) {
      if (lowerUrl.includes(pattern)) {
        return platform.name;
      }
    }
  }
  
  return null;
}

function extractLinks(content) {
  if (typeof content !== 'string') return [];
  
  const urlRegex = /https?:\/\/[^\s]+/gi;
  const matches = content.match(urlRegex) || [];
  
  return matches.filter(url => detectPlatform(url) !== null);
}

export async function handleAutoDownloadCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const args = content.split(" ");
  const command = args[1]?.toLowerCase();

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  if (command === "on") {
    groupSettings[threadId].autoDownload = true;
  } else if (command === "off") {
    groupSettings[threadId].autoDownload = false;
  } else {
    groupSettings[threadId].autoDownload = !groupSettings[threadId].autoDownload;
  }

  const newStatus = groupSettings[threadId].autoDownload ? "bật" : "tắt";
  const caption = `Chức năng tự động tải link đã được ${newStatus}!`;
  
  await sendMessageStateQuote(
    api,
    message,
    caption,
    groupSettings[threadId].autoDownload,
    300000
  );
  
  return true;
}

export async function autoDownload(api, message, isSelf, groupSettings) {
  if (isSelf) {
    return false;
  }

  let content = message.data.content;
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;

  let textContent = '';
  if (typeof content === 'string') {
    textContent = content;
  } else if (content && typeof content === 'object') {
    if (content.href) {
      textContent = content.href;
    } else if (content.title) {
      textContent = content.title;
    }
  }

  if (!textContent || typeof textContent !== 'string') {
    return false;
  }
  
  if (!groupSettings[threadId]) {
    return false;
  }

  const autoDownloadEnabled = groupSettings[threadId]?.autoDownload;
  if (!admins.includes(senderId.toString()) && !autoDownloadEnabled) {
    return false;
  }

  const links = extractLinks(textContent);
  
  if (links.length === 0) {
    return false;
  }

  for (const link of links) {
    try {
      const platform = detectPlatform(link);
      
      if (!platform) {
        continue;
      }

      await api.addReaction("CLOCK", message);

      let dataDownload = await getDataDownloadVideo(link);
      
      if (!dataDownload || dataDownload.error) {
        await api.addReaction("UNDO", message);
        continue;
      }

      await api.addReaction("UNDO", message);

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
        await api.addReaction("OK", message);
        continue;
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

          await api.sendMessage(
            {
              msg: caption,
              attachments: [filePath],
            },
            threadId,
            message.type
          );

          try {
            await clearImagePath(filePath);
          } catch (error) {
            console.error("Không thể xóa file ảnh tạm:", error);
          }
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

          await api.sendMessage(
            {
              msg: caption,
            },
            threadId,
            message.type
          );

          await api.sendMessage(
            {
              msg: "",
              attachments: attachmentPaths,
            },
            threadId,
            message.type
          );

          for (const filePath of attachmentPaths) {
            try {
              await clearImagePath(filePath);
            } catch (error) {
              console.error("Không thể xóa file ảnh tạm:", error);
            }
          }
        }
      } else {
        const videos = dataLink.filter(item => item.type.toLowerCase() === "video");
        
        if (videos.length === 0) {
          await api.addReaction("OK", message);
          continue;
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

      await api.addReaction("OK", message);
      return true;
    } catch (error) {
      console.error("Lỗi khi xử lý link:", link);
      console.error("Chi tiết lỗi:", error.message);
      console.error("Stack:", error.stack);
      
      try {
        await api.addReaction("UNDO", message);
      } catch (reactionError) {
        console.error("Lỗi khi thêm reaction UNDO:", reactionError.message);
      }
      
      continue;
    }
  }

  return false;
}
