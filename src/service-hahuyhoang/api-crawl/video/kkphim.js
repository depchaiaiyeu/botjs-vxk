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

function normalizeEpisodeName(input) {
  const normalized = input.toLowerCase().replace(/\s/g, "");
  if (normalized === "full") return "full";
  const numMatch = normalized.match(/\d+/);
  return numMatch ? numMatch[0] : normalized;
}

function matchEpisode(episodes, input) {
  const normalizedInput = normalizeEpisodeName(input);
  
  return episodes.find(ep => {
    const epName = ep.name.toLowerCase().replace(/\s/g, "");
    if (epName === normalizedInput) return true;
    if (epName === "full" && normalizedInput === "full") return true;
    
    const epNum = epName.match(/\d+/);
    if (epNum && epNum[0] === normalizedInput) return true;
    
    return false;
  });
}

export async function searchKKPhim(keyword) {
  try {
    const url = `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=10`;
    const { data } = await axios.get(url);
    
    if (data.status !== "success" || !data.data?.items) {
      return [];
    }

    return data.data.items.map(item => ({
      title: item.name,
      slug: item.slug,
      origin_name: item.origin_name,
      year: item.year,
      episode_current: item.episode_current,
      quality: item.quality,
      lang: item.lang
    }));
  } catch (err) {
    console.error("Lỗi tìm kiếm:", err.message);
    return [];
  }
}

export async function getMovieDetail(slug) {
  try {
    const url = `https://phimapi.com/phim/${slug}`;
    const { data } = await axios.get(url);
    
    if (!data.status || !data.movie || !data.episodes) {
      return null;
    }

    return {
      movie: data.movie,
      episodes: data.episodes
    };
  } catch (err) {
    console.error("Lỗi lấy chi tiết phim:", err.message);
    return null;
  }
}

export async function handleKKPhimCommand(api, message, command) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const query = content.replace(`${prefix}${command}`, "").trim();

  if (!query) {
    await sendMessageWarningRequest(api, message, {
      caption: `Bạn chưa nhập từ khóa tìm kiếm.\nVí dụ: ${prefix}${command} one piece`,
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
    const detail = await getMovieDetail(selected.slug);
    
    if (!detail || !detail.episodes.length) {
      await sendMessageWarningRequest(api, message, {
        caption: `Không thể lấy danh sách tập phim.`,
      }, 60000);
      return;
    }

    const allEpisodes = detail.episodes.flatMap(server => server.server_data);
    const labels = allEpisodes.map(ep => ep.name).join(", ");

    const reply = await sendMessageCompleteRequest(api, message, {
      caption: `${selected.title}\n${selected.origin_name}\nNăm: ${selected.year} | ${selected.quality} | ${selected.lang}\nTập hiện tại: ${selected.episode_current}\n\nCác tập có sẵn:\n${labels}\n\nTrả lời tên tập để xem (VD: Full, 1, 50)`,
    }, 60000);

    const newMsgId = reply?.message?.msgId || reply?.attachment?.[0]?.msgId;
    selectionsMap.set(newMsgId.toString(), {
      userId: message.data.uidFrom,
      stage: "episode",
      selected,
      episodes: allEpisodes,
      timestamp: Date.now(),
    });
    setSelectionsMapData(message.data.uidFrom, {
      quotedMsgId: newMsgId.toString(),
      collection: allEpisodes.map(ep => ({
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
    caption += `\n${i + 1}. ${item.title}\n${item.origin_name}\nNăm: ${item.year} | ${item.quality} | ${item.lang}\nTập: ${item.episode_current}`;
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

  const selectedInput = removeMention(message).trim();

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

    const detail = await getMovieDetail(selected.slug);
    if (!detail || !detail.episodes.length) {
      await sendMessageWarningRequest(api, message, {
        caption: `Không lấy được danh sách tập phim.`,
      }, 60000);
      return true;
    }

    const allEpisodes = detail.episodes.flatMap(server => server.server_data);
    const listLabel = allEpisodes.map(e => e.name).join(", ");
    
    const reply = await sendMessageCompleteRequest(api, message, {
      caption: `${selected.title}\nCác tập có sẵn: ${listLabel}\n\nTrả lời tên tập để xem (VD: Full, 1, 50)`,
    }, 60000);

    const newMsgId = reply?.message?.msgId || reply?.attachment?.[0]?.msgId;
    selectionsMap.set(newMsgId.toString(), {
      userId: senderId,
      stage: "episode",
      selected,
      episodes: allEpisodes,
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: newMsgId.toString(),
      collection: allEpisodes.map(ep => ({
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
    const { selected, episodes } = data;
    if (!Array.isArray(episodes)) {
      await sendMessageWarningRequest(api, message, {
        caption: `Dữ liệu tập phim bị lỗi.`,
      });
      return true;
    }

    const match = matchEpisode(episodes, selectedInput);
    if (!match) {
      await sendMessageWarningRequest(api, message, {
        caption: `Tập không hợp lệ. Hãy nhập đúng tên tập (VD: Full, 1, 50).`,
      });
      return true;
    }

    await sendMessageProcessingRequest(api, message, {
      caption: `Đang xử lý phim ${selected.title}, tập ${match.name}...`,
    }, 5000);

    try {
      const key = `${selected.slug}_ep${match.name}`;
      const cached = await getCachedMedia(PLATFORM, key);
      
      let videoUrl = cached?.fileUrl;

      if (!videoUrl) {
        const m3u8Url = match.link_m3u8;
        if (!m3u8Url) throw new Error("Không tìm thấy link video");

        const mp4File = path.join(tempDir, `${Date.now()}_${match.name.replace(/\s/g, "_")}.mp4`);
        
        await execAsync(`ffmpeg -i "${m3u8Url}" -c copy -bsf:a aac_adtstoasc "${mp4File}"`);

        await sendMessageCompleteRequest(api, message, {
          caption: `Đã tải xong tập ${match.name}.\nĐang upload video, vui lòng đợi...`,
        }, 15000);

        if (!fs.existsSync(mp4File)) {
          throw new Error("File không tồn tại sau khi convert");
        }

        const fileStats = fs.statSync(mp4File);
        console.log(`File size: ${fileStats.size} bytes`);

        const uploadResult = await api.uploadAttachment([mp4File], senderId, MessageType.DirectMessage);
        console.log("Upload result:", uploadResult);
        
        videoUrl = uploadResult?.[0]?.fileUrl;
        
        deleteFile(mp4File);

        if (!videoUrl) {
          throw new Error("Upload không thành công hoặc thiếu URL.");
        }

        await setCacheData(PLATFORM, key, { fileUrl: videoUrl });
      }

      await api.sendVideo({
        videoUrl,
        threadId: message.threadId,
        threadType: message.type,
        message: {
          text: `${selected.title} – Tập ${match.name}`,
          type: message.type,
          mentions: [MessageMention(senderId, 0, 0, false)],
        },
        ttl: 60000000,
      });
    } catch (err) {
      console.error("Lỗi khi gửi phim:", err.message);
      await sendMessageWarningRequest(api, message, {
        caption: `Không thể xử lý tập ${match.name}. Lỗi: ${err.message}`,
      }, 15000);
    }

    selectionsMap.delete(quotedMsgId);
    return true;
  }

  return false;
}

export async function handleSendKKPhimEpisode(api, message, media) {
  const { selectedHero: selected, selectedSkin: match } = media;
  if (!selected || !match?.name || !match?.link_m3u8) return false;

  try {
    await sendMessageProcessingRequest(api, message, {
      caption: `Đang xử lý phim ${selected.title}, tập ${match.name}...`,
    }, 5000);

    const key = `${selected.slug}_ep${match.name}`;
    const cached = await getCachedMedia(PLATFORM, key);
    let videoUrl = cached?.fileUrl;

    if (!videoUrl) {
      const mp4File = path.join(tempDir, `${Date.now()}_${match.name.replace(/\s/g, "_")}.mp4`);
      
      await execAsync(`ffmpeg -i "${match.link_m3u8}" -c copy -bsf:a aac_adtstoasc "${mp4File}"`);

      if (!fs.existsSync(mp4File)) {
        throw new Error("File không tồn tại sau khi convert");
      }

      const uploadResult = await api.uploadAttachment([mp4File], message.threadId, message.type);
      videoUrl = uploadResult?.[0]?.hdUrl || uploadResult?.[0]?.normalUrl || uploadResult?.[0]?.fileUrl;
      
      deleteFile(mp4File);

      if (!videoUrl) throw new Error("Không upload được video.");
      await setCacheData(PLATFORM, key, { fileUrl: videoUrl });
    }

    if (videoUrl) {
      await api.sendVideo({
        videoUrl,
        threadId: message.threadId,
        threadType: message.type,
        message: {
          text: `${selected.title} – Tập ${match.name}`,
          type: message.type,
          mentions: [MessageMention(message.data.uidFrom, 0, 0, false)],
        },
        ttl: 60000000,
      });
    }

    return true;
  } catch (err) {
    console.error("Lỗi gửi tập phim KKPhim:", err.message);
    await sendMessageWarningRequest(api, message, {
      caption: `Không thể xử lý tập ${match.name}. Lỗi: ${err.message}`,
    }, 15000);
    return true;
  }
}
