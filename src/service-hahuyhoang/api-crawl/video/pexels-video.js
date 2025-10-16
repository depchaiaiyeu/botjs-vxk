import axios from "axios";
import fs from "fs";
import path from "path";
import schedule from "node-schedule";
import {
    sendMessageCompleteRequest,
    sendMessageProcessingRequest,
    sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { MessageMention } from "zlbotdqt";
import { tempDir } from "../../../utils/io-json.js";
import { deleteFile, downloadFile, deleteRepliedMessage } from "../../../utils/util.js";
import { removeMention } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
// test thoi lam chua duoc =))
// Develop: Hà Huy Hoàng
const CONFIG = {
  maxResults: 5,
  timeWaitSelection: 30000,
  pexelsBaseUrl: "https://api.pexels.com/v1/videos/search",
  pexelsApiKey: "26WqqKYxBteywqR1nEQUcm6YwipAWyA49wudto7GCsexbWpDp9iTY6hw",
  paths: {
    saveDir: tempDir,
  },
};

const pexelsSelectionsMap = new Map();

export const searchPexels = async (query, limit = CONFIG.maxResults) => {
  try {
    const response = await axios.get(CONFIG.pexelsBaseUrl, {
      headers: { Authorization: CONFIG.pexelsApiKey },
      params: { query, per_page: limit },
    });

    if (!response?.data?.videos) {
      throw new Error("Không thể lấy được dữ liệu từ Pexels");
    }

    return response.data.videos;
  } catch (error) {
    console.error("Lỗi khi tìm kiếm video Pexels:", error.message);
    return [];
  }
};

export async function handlePexelsCommand(api, message, aliasCommand) {
  const content = removeMention(message).trim();
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix();
  const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const [keyword, limitInput] = commandContent.split("&&");
  let imagePath;

  try {
    if (!keyword) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} phong cảnh`,
      };
      return await sendMessageCompleteRequest(api, message, object, 30000);
    }

    const limit = parseInt(limitInput) || CONFIG.maxResults;
    const searchResults = await searchPexels(keyword, limit);

    if (searchResults.length === 0) {
      const object = {
        caption: `Không tìm thấy video phù hợp với từ khóa: ${keyword}`,
      };
      return await sendMessageWarningRequest(api, message, object, 30000);
    }

    const templates = searchResults.map((video, index) => ({
      title: video.user.name,
      thumbnail: video.video_pictures?.[0]?.picture || "",
      duration: `${Math.round(video.duration)} giây`,
      quality: "1280x720",
      index: index + 1,
    }));

    imagePath = await createSearchResultImage(templates);

    const object = {
      caption: `Đây là kết quả tìm kiếm video của bạn.\nReply tin nhắn này với số thứ tự để chọn video.`,
      imagePath,
    };

    const searchResultMessage = await sendMessageCompleteRequest(api, message, object, CONFIG.timeWaitSelection);
    const quotedMsgId = searchResultMessage?.message?.msgId || searchResultMessage?.attachment[0]?.msgId;

    pexelsSelectionsMap.set(quotedMsgId.toString(), {
      results: searchResults,
      timestamp: Date.now(),
      threadId: message.threadId,
      type: message.type,
      senderId,
      senderName,
    });
  } catch (error) {
    console.error("Lỗi khi tìm kiếm video Pexels:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi tìm kiếm video, vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}

export async function handlePexelsReply(api, message) {
  const senderId = message.data.uidFrom;

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();
    if (!pexelsSelectionsMap.has(quotedMsgId)) return false;

    const videoData = pexelsSelectionsMap.get(quotedMsgId);
    if (videoData.senderId !== senderId) return false;

    const content = removeMention(message).trim();
    const [selection, typeVideo = "normal"] = content.split(" ");

    const selectedIndex = parseInt(selection) - 1;
    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= videoData.results.length) {
      const object = {
        caption: `Lựa chọn không hợp lệ. Vui lòng chọn một số từ danh sách.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    await deleteRepliedMessage(api, message); // Xóa tin nhắn reply gốc nếu cần
    pexelsSelectionsMap.delete(quotedMsgId); // Xóa khỏi bộ nhớ tạm

    const selectedVideo = videoData.results[selectedIndex];
    let videoFile;

    if (typeVideo.toLowerCase() === "audio") {
      // Lựa chọn file audio nếu có
      videoFile = selectedVideo.video_files.find((file) => file.file_type === "audio/mpeg");
      if (!videoFile) {
        const object = {
          caption: `Không tìm thấy file âm thanh phù hợp.`,
        };
        await sendMessageWarningRequest(api, message, object, 30000);
        return true;
      }
    } else {
      // Mặc định chọn file video 1280x720
      videoFile = selectedVideo.video_files.find(
        (file) => file.width === 1280 && file.height === 720
      );
      if (!videoFile) {
        const object = {
          caption: `Không tìm thấy video 1280x720 để tải. Vui lòng thử lại.`,
        };
        await sendMessageWarningRequest(api, message, object, 30000);
        return true;
      }
    }

    const videoUrl = videoFile.link;
    const tempFileName = `pexels_${typeVideo}_${Date.now()}.mp4`;
    const videoPath = path.join(CONFIG.paths.saveDir, tempFileName);

    try {
      await downloadFile(videoUrl, videoPath);

      const stats = fs.statSync(videoPath);
      if (stats.size < 1024) {
        throw new Error("File tải về quá nhỏ");
      }

      await api.sendMessage(
        {
          msg: `[${videoData.senderName}] Đã tải xong file từ Pexels (${typeVideo}).`,
          attachments: [videoPath],
        },
        message.threadId,
        message.type
      );
    } catch (error) {
      console.error("Lỗi khi tải file:", error);
      const object = {
        caption: `Không thể tải file. Vui lòng thử lại sau.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
    } finally {
      await deleteFile(videoPath);
    }

    return true;
  } catch (error) {
    console.error("Lỗi khi xử lý reply Pexels:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý tin nhắn của bạn. Vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return true;
  }
}