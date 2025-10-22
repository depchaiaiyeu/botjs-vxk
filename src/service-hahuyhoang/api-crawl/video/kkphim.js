import axios from "axios";
import fs from "fs";
import path from "path";
import { tempDir } from "../../../utils/io-json.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { deleteFile } from "../../../utils/util.js";
import {
  sendMessageCompleteRequest,
  sendMessageProcessingRequest,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { setSelectionsMapData } from "../index.js";
import { removeMention } from "../../../utils/format-util.js";
import { getBotId } from "../../../index.js";
import { exec } from "child_process";
import { promisify } from "util";
import { MessageMention, MessageType } from "zlbotdqt";

const execAsync = promisify(exec);

const PLATFORM = "kkphim";
const selectionsMap = new Map();

export async function getEpisodeMap(slug) {
  try {
    const { data } = await axios.get(`https://phimapi.com/phim/${slug}`);
    const episodes = [];

    if (data.episodes && data.episodes.length > 0) {
      const server = data.episodes[0];
      if (server.server_data && server.server_data.length > 0) {
        server.server_data.forEach(item => {
          if (item.name && item.link_m3u8) {
            episodes.push({
              label: item.name,
              url: item.link_m3u8
            });
          }
        });
      }
    }

    const uniqueEpisodes = [...new Map(episodes.map(ep => [ep.label, ep])).values()];
    return uniqueEpisodes;
  } catch (err) {
    console.error("Lỗi khi lấy danh sách tập:", err.message);
    return [];
  }
}

export async function searchKKPhim(keyword) {
  try {
    const url = `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=10`;
    const { data } = await axios.get(url);
    const results = [];

    if (data.data && data.data.items) {
      data.data.items.forEach(item => {
        const title = item.name;
        const slug = item.slug;
        if (title && slug) {
          results.push({ title, slug });
        }
      });
    }

    return results;
  } catch (err) {
    console.error("Lỗi khi tìm kiếm:", err.message);
    return [];
  }
}

export async function handleKKPhimCommand(api, message, command) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const query = content.replace(`${prefix}${command}`, "").trim();

  if (!query) {
    await sendMessageWarningRequest(api, message, {
      caption: `Bạn chưa nhập từ khóa tìm kiếm.\nVí dụ: ${prefix}${command} tu tiên`,
    });
    return;
  }

  const results = await searchKKPhim(query);
  if (!results.length) {
    await sendMessageWarningRequest(api, message, {
      caption: `Không tìm thấy phim phù hợp với từ khóa "${query}"`,
    }, 60000);
    return;
  }
  if (results.length === 1) {
    const selected = results[0];
    const episodeMap = await getEpisodeMap(selected.slug);
    if (!episodeMap.length) {
      await sendMessageWarningRequest(api, message, {
        caption: `Không thể lấy danh sách tập phim.`,
      }, 60000);
      return;
    }
  
    const labels = episodeMap
  .map(ep => ep.label)
  .sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b, "vi", { numeric: true });
  })
  .join(", ");
    const reply = await sendMessageCompleteRequest(api, message, {
      caption: `${selected.title}\nCác tập có sẵn:\n${labels}\n\nTrả lời đúng tên tập để xem (VD: 1-5 hoặc 50)`,
    }, 60000);
  
    const newMsgId = reply?.message?.msgId || reply?.attachment?.[0]?.msgId;
    selectionsMap.set(newMsgId.toString(), {
      userId: message.data.uidFrom,
      stage: "episode",
      selected,
      episodeMap,
      timestamp: Date.now(),
    });
    setSelectionsMapData(message.data.uidFrom, {
      quotedMsgId: newMsgId.toString(),
      collection: episodeMap.map(ep => ({
        selectedHero: selected,
        selectedSkin: ep,
      })),
      timestamp: Date.now(),
      platform: PLATFORM
    });
    return;
  }
  let caption = `Tìm thấy ${results.length} phim với từ khóa "${query}":\n`;
  results.forEach((item, i) => {
    caption += `\n${i + 1}. ${item.title}`;
  });
  caption += `\n\nTrả lời số phim để chọn (VD: 1)`;

  const listMessage = await sendMessageCompleteRequest(api, message, { caption }, 60000);
  const quotedMsgId = listMessage?.message?.msgId || listMessage?.attachment?.[0]?.msgId;

  selectionsMap.set(quotedMsgId.toString(), {
    userId: message.data.uidFrom,
    stage: "movie",
    list: results,
    timestamp: Date.now(),
  });
}

export async function handleKKPhimReply(api, message) {
  const senderId = message.data.uidFrom;
  const botId = getBotId();

  if (!message.data.quote?.globalMsgId) return false;

  const quotedMsgId = message.data.quote.globalMsgId.toString();
  const data = selectionsMap.get(quotedMsgId);
  if (!data || data.userId !== senderId) return false;

  const selectedInput = removeMention(message).trim().replace(/\s/g, "");

  try {
    await api.deleteMessage({
      type: message.type,
      threadId: message.threadId,
      data: {
        cliMsgId: message.data.quote.cliMsgId,
        msgId: message.data.quote.globalMsgId,
        uidFrom: botId,
      }
    }, false);

    await api.deleteMessage({
      type: message.type,
      threadId: message.threadId,
      data: {
        cliMsgId: message.data.cliMsgId,
        msgId: message.data.msgId,
        uidFrom: senderId,
      }
    }, false);
  } catch (e) {}

  if (data.stage === "movie") {
    const selectedIndex = parseInt(selectedInput) - 1;
    const selected = data.list[selectedIndex];
    if (!selected) {
      await sendMessageWarningRequest(api, message, {
        caption: `Số phim không hợp lệ.`,
      }, 60000);
      return true;
    }

    const episodeMap = await getEpisodeMap(selected.slug);
    if (!episodeMap.length) {
      await sendMessageWarningRequest(api, message, {
        caption: `Không lấy được danh sách tập phim.`,
      }, 60000);
      return true;
    }

    const listLabel = episodeMap.map((e) => e.label).join(", ");
    const reply = await sendMessageCompleteRequest(api, message, {
      caption: `${selected.title}\nCác tập có sẵn: ${listLabel}\n\nTrả lời đúng tên tập để xem (VD: 50 hoặc 1-5)`,
    }, 60000);

    const newMsgId = reply?.message?.msgId || reply?.attachment?.[0]?.msgId;
    selectionsMap.set(newMsgId.toString(), {
      userId: senderId,
      stage: "episode",
      selected,
      episodeMap,
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: newMsgId.toString(),
      collection: episodeMap.map(ep => ({
        selectedHero: selected,
        selectedSkin: ep,
      })),
      timestamp: Date.now(),
      platform: PLATFORM
    });

    selectionsMap.delete(quotedMsgId);
    return true;
  }

  if (data.stage === "episode") {
    const { selected, episodeMap } = data;
    if (!Array.isArray(episodeMap)) {
      await sendMessageWarningRequest(api, message, {
        caption: `Dữ liệu tập phim bị lỗi.`,
      });
      return true;
    }

    const match = episodeMap.find(ep => ep.label.replace(/\s/g, "") === selectedInput);
    if (!match) {
      await sendMessageWarningRequest(api, message, {
        caption: `Tập không hợp lệ. Hãy nhập đúng nhãn như: 1, 2, 3, 1-5, 51-55...`,
      });
      return true;
    }

    await sendMessageProcessingRequest(api, message, {
      caption: `Đang xử lý phim ${selected.title}, tập ${match.label}...`,
    }, 5000);

    try {
      const m3u8Url = match.url;
      if (!m3u8Url) throw new Error("Không tìm thấy link m3u8");
    
      const mp4File = path.join(tempDir, `${Date.now()}_${match.label}.mp4`);
      try {
        await execAsync(`ffmpeg -i "${m3u8Url}" -c copy -bsf:a aac_adtstoasc "${mp4File}"`);
    
        await sendMessageCompleteRequest(api, message, {
          caption: `Đã tải xong tập ${match.label}.\nĐang xử lý video, vui lòng đợi...`,
        }, 15000);
    
        const uploadResult = await api.uploadAttachment([mp4File], senderId, MessageType.DirectMessage);
        const videoUrl = uploadResult?.[0]?.fileUrl;
        deleteFile(mp4File);
    
        if (!videoUrl) {
          throw new Error("Upload không thành công hoặc thiếu URL.");
        }

        const key = `${selected.title}_ep${match.label}`;
        const cached = await getCachedMedia(PLATFORM, key);
        if (!cached?.fileUrl) {
          await setCacheData(PLATFORM, key, { fileUrl: videoUrl });
        }
    
        await api.sendVideo({
          videoUrl,
          threadId: message.threadId,
          threadType: message.type,
          message: {
            text: `${selected.title} – Tập ${match.label}`,
            mentions: [MessageMention(senderId, 0, 0, false)],
          },
          ttl: 60000000,
        });
      } catch (err) {
        console.error("Lỗi convert m3u8:", err.message);
        await sendMessageWarningRequest(api, message, {
          caption: `Không thể xử lý tập ${match.label} (ffmpeg lỗi hoặc stream lỗi).`,
        });
        return true;
      }
    } catch (err) {
      console.error("Lỗi khi gửi phim:", err.message);
      await sendMessageWarningRequest(api, message, {
        caption: `Không thể xử lý tập ${match.label}.`,
      }, 15000);
    }

    selectionsMap.delete(quotedMsgId);
    return true;
  }

 return false;
}
export async function handleSendKKPhimEpisode(api, message, media) {
  const { selectedHero: selected, selectedSkin: match } = media;
  if (!selected || !match?.url || !match?.label) return false;

  try {
    await sendMessageProcessingRequest(api, message, {
      caption: `Đang xử lý phim ${selected.title}, tập ${match.label}...`,
    }, 5000);

    const m3u8Url = match.url;
    if (!m3u8Url) throw new Error("Không tìm thấy link m3u8");

    const mp4File = path.join(tempDir, `${Date.now()}_${match.label}.mp4`);
    await execAsync(`ffmpeg -i "${m3u8Url}" -c copy -bsf:a aac_adtstoasc "${mp4File}"`);
    const uploadResult = await api.uploadAttachment([mp4File], message.data.uidFrom, MessageType.DirectMessage);
    const videoUrl = uploadResult?.[0]?.fileUrl;
    deleteFile(mp4File);

    if (!videoUrl) throw new Error("Không upload được video.");

    const key = `${selected.title}_ep${match.label}`;
    const cached = await getCachedMedia(PLATFORM, key);
    if (!cached?.fileUrl) {
      await setCacheData(PLATFORM, key, { fileUrl: videoUrl });
    }

    await api.sendVideov2({
      videoUrl,
      threadId: message.threadId,
      threadType: message.type,
      message: {
        text: `${selected.title} – Tập ${match.label}`,
        mentions: [MessageMention(message.data.uidFrom, 0, 0, false)],
      },
      ttl: 60000000,
    });

    return true;
  } catch (err) {
    console.error("Lỗi gửi tập phim KKPhim:", err.message);
    await sendMessageWarningRequest(api, message, {
      caption: `Không thể xử lý tập ${match.label}.`,
    }, 15000);
    return true;
  }
}
