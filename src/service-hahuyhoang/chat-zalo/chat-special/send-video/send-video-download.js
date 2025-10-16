import axios from "axios";
import fs from "fs";
import path from "path";
import { sendMessageCompleteRequest, sendMessageWarningRequest } from "../../chat-style/chat-style.js";
import { getGlobalPrefix } from "../../../service.js";
import { removeMention } from "../../../../utils/format-util.js";

const RESOURCE_BASE_PATH = path.join(process.cwd(), "assets", "resources");
const VIDEO_RESOURCE_PATH = path.join(RESOURCE_BASE_PATH, "video");
const TEMP_VIDEO_PATH = path.join(VIDEO_RESOURCE_PATH, "downloaded_video.mp4");

// Author : Hà Huy Hoàng
// Description: Pexels Image code by H H H BOT

function getAvailableVideos() {
  if (!fs.existsSync(VIDEO_RESOURCE_PATH)) return [];
  return fs.readdirSync(VIDEO_RESOURCE_PATH).filter(file => file.endsWith(".mp4"));
}
async function downloadVideo(url, savePath) {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
    }
  });

  const writer = fs.createWriteStream(savePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

export async function sendVideoDownload(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message).replace(`${prefix}${aliasCommand}`, "").trim();
  const availableVideos = getAvailableVideos();

  if (!content) {
    if (availableVideos.length === 0) {
      await sendMessageWarningRequest(api, message, {
        caption: "⚠️ Không có video nào trong thư mục!",
      }, 1800000);
      return;
    }
    const fileList = availableVideos.map((name, index) => `${index + 1}. ${name.replace(".mp4", "")}`).join("\n");
    await sendMessageCompleteRequest(api, message, {
      caption: `🎞 Danh sách video có sẵn:\n${fileList}` +
        `\n\n📌 Dùng lệnh: ${prefix}${aliasCommand} <tên video> để gửi video.`,
    }, 1800000);
    return;
  }
  if (content.startsWith("http")) {
    if (content.length > 30000) {
      await sendMessageCompleteRequest(api, message, {
        caption: `🎥 Đang gửi video, vui lòng đợi...`,
      }, 60000);
      try {
        if (fs.existsSync(TEMP_VIDEO_PATH)) fs.unlinkSync(TEMP_VIDEO_PATH);
        await downloadVideo(content, TEMP_VIDEO_PATH);
        const uploadResult = await api.uploadAttachment([TEMP_VIDEO_PATH], message.threadId, message.type);
        if (uploadResult && uploadResult.length > 0) {
          const videoUrl = uploadResult[0].fileUrl;
          await api.sendVideo({
            videoUrl: videoUrl,
            threadId: message.threadId,
            threadType: message.type,
            message: { text: "" },
            ttl: 600000
          });
        } else {
          throw new Error("Upload video thất bại.");
        }
      } catch (error) {
        console.error("❌ Lỗi khi tải hoặc gửi video:", error);
        await sendMessageWarningRequest(api, message, {
          caption: "❌ Không thể tải hoặc gửi video từ link này.",
        }, 1800000);
      }
      if (fs.existsSync(TEMP_VIDEO_PATH)) {
        fs.unlinkSync(TEMP_VIDEO_PATH);
      }
    } else {
      try {
        await api.sendVideo({
          videoUrl: content,
          threadId: message.threadId,
          threadType: message.type,
          message: { text: "" },
          ttl: 600000
        });
      } catch (error) {
        console.error("❌ Lỗi khi gửi video từ link:", error);
        await sendMessageWarningRequest(api, message, {
          caption: "❌ Không thể gửi video từ link đã cung cấp.",
        }, 1800000);
      }
    }
    return;
  }
  let videoFileName = availableVideos.find(file => file.toLowerCase().startsWith(content.toLowerCase()));
  if (videoFileName) {
    const videoFilePath = path.join(VIDEO_RESOURCE_PATH, videoFileName);
    try {
      await sendMessageCompleteRequest(api, message, {
        caption: `🎥 Video "${videoFileName.replace(".mp4", "")}" của bạn đây!`,
      }, 1800000);
      const uploadResult = await api.uploadAttachment([videoFilePath], message.threadId, message.type);
      if (uploadResult && uploadResult.length > 0) {
        const videoUrl = uploadResult[0].fileUrl;
        await api.sendVideo({
          videoUrl: videoUrl,
          threadId: message.threadId,
          threadType: message.type,
          message: { text: "" },
          ttl: 600000
        });
      } else {
        throw new Error("Upload video thất bại.");
      }
    } catch (error) {
      console.error("Lỗi khi gửi video từ thư mục:", error);
      await sendMessageWarningRequest(api, message, {
        caption: "❌ Không thể gửi video này từ thư mục.",
      }, 1800000);
    }
    return;
  }

  await sendMessageWarningRequest(api, message, {
    caption: `❌ Không tìm thấy video với từ khóa: "${content}".\n📌 Dùng lệnh: ${prefix}${aliasCommand} để xem danh sách video.`,
  }, 1800000);
}
