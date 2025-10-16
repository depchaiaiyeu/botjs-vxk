import axios from "axios";
import path from "path";
import * as cheerio from "cheerio";
import youtubedl from 'yt-dlp-exec';
import { fileURLToPath } from 'url';
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
import { splitLargeFileEvenly, downloadM3U8ToMP4 } from "../util.js";

const execAsync = promisify(exec);
const PLATFORM = "subnhanhchill";
const BASE_URL = "https://subnhanhchill.net";
const headers = {
  "User-Agent": "Mozilla/5.0",
  Referer: BASE_URL,
};
const selectionsMap = new Map();

async function fetchHTML(url) {
  const res = await axios.get(url, { headers });
  return cheerio.load(res.data);
}

async function searchSubNhanhChill(keyword) {
  const searchUrl = `${BASE_URL}/?search=${encodeURIComponent(keyword)}`;
  const $ = await fetchHTML(searchUrl);
  const results = [];

  $(".listing__item").each((_, el) => {
    const link = $(el).find("a").attr("href");
    const title = $(el).find(".item-title").text().trim();
    if (title && link) {
      results.push({
        title,
        link: link.startsWith("http") ? link : `${BASE_URL}${link}`,
      });
    }
  });

  return results;
}

async function getHomepageMoviesFallback() {
  const $ = await fetchHTML(BASE_URL);
  const homepageSections = [];

  $(".listing").each((_, el) => {
    const section = $(el);
    const category = section.find(".listing__title").text().trim();
    const movies = [];

    section.find(".listing__item").each((_, item) => {
      const $item = $(item).find("a").first();
      const title = $item.attr("title")?.trim() || "";
      const url = $item.attr("href") || "";
      const thumbStyle = $(item).find(".listing__item__image").attr("style") || "";
      const imageMatch = thumbStyle.match(/url\((.*?)\)/);
      const thumbnail = imageMatch ? BASE_URL.replace(/\/$/, "") + imageMatch[1] : "";
      const name = $(item).find(".item-title").text().trim();
      const subtitle = $(item).find(".item-title2").text().trim();

      if (url) {
        movies.push({ title, name, subtitle, url, thumbnail });
      }
    });

    if (category && movies.length > 0) {
      homepageSections.push({ category, movies });
    }
  });

  return homepageSections;
}

async function getMovieDetail(link) {
  const $ = await fetchHTML(link);
  const title = $("h1.movie-title").text().trim();
  let episodes = [];

  $(".btn-episode").each((_, el) => {
    const epTitle = $(el).text().trim();
    const epUrl = $(el).attr("href");
    if (epTitle && epUrl) {
      episodes.push({ label: epTitle, url: epUrl });
    }
  });

  if (episodes.length === 0) {
    const watchUrl = $(".button_xemphim").attr("href");
    if (watchUrl) {
      try {
        const $$ = await fetchHTML(watchUrl);
        $$(".btn-episode").each((_, el) => {
          const epTitle = $$(el).text().trim();
          const epUrl = $$(el).attr("href");
          if (epTitle && epUrl) {
            episodes.push({ label: epTitle, url: epUrl });
          }
        });
      } catch (e) {
        console.warn("Không thể lấy tập từ trang xem phim:", e.message);
      }
    }
  }

  return { title, episodes };
}

async function getBestM3u8(epUrl) {
  const html = await axios.get(epUrl, { headers }).then(res => res.data);
  const match = html.match(/https:\/\/[^"]+\.m3u8/);
  if (!match) return null;

  let m3u8Link = match[0];
  if (m3u8Link.endsWith("index.m3u8")) {
    const base = m3u8Link.split("/").slice(0, -1).join("/");
    const indexContent = await axios.get(m3u8Link, { headers }).then(res => res.data);
    const best = indexContent.split("\n")
      .filter(l => l.endsWith(".m3u8") && !l.startsWith("#"))
      .map(l => ({ quality: parseInt(l.match(/\d+/)?.[0] || "0"), url: l }))
      .sort((a, b) => b.quality - a.quality)[0];

    if (best) m3u8Link = `${base}/${best.url}`;
  }

  return m3u8Link;
}

export async function handleSubNhanhChillCommand(api, message, command) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const query = content.replace(`${prefix}${command}`, "").trim();
  const senderId = message.data.uidFrom;

  let results = [];

  if (!query) {
    const homepageSections = await getHomepageMoviesFallback();
    results = homepageSections.flatMap(s => s.movies).map(m => ({
      title: `${m.name || m.title} (${m.subtitle || ""})`.trim(),
      link: m.url,
    }));

    if (!results.length) {
      await sendMessageWarningRequest(api, message, {
        caption: `⚠️ Không lấy được danh sách phim từ trang chủ.`,
      });
      return;
    }

    let caption = `📺 Danh sách phim từ trang chủ:\n`;
    results.slice(0, 10).forEach((item, i) => {
      caption += `\n${i + 1}. ${item.title}`;
     // \n🔗 ${item.link}
    });
    caption += `\n\n➡️ Trả lời số phim để chọn (VD: 1)`;

    const res = await sendMessageCompleteRequest(api, message, { caption });
    const msgId = res?.message?.msgId || res?.attachment?.[0]?.msgId;

    selectionsMap.set(msgId.toString(), {
      userId: senderId,
      stage: "movie",
      list: results,
      timestamp: Date.now(),
    });

    setSelectionsMapData(senderId, {
      platform: PLATFORM,
      quotedMsgId: msgId?.toString(),
      collection: results,
      timestamp: Date.now(),
    });
    return;
  }

  results = await searchSubNhanhChill(query);

  if (!results.length) {
    await sendMessageWarningRequest(api, message, {
      caption: `❌ Không tìm thấy phim với từ khóa: ${query}`,
    });
    return;
  }

  let caption = `🔍 Tìm thấy ${results.length} phim:\n`;
  results.slice(0, 10).forEach((item, i) => {
    caption += `\n${i + 1}. ${item.title}`;
  });
  caption += `\n\n➡️ Trả lời số phim để chọn (VD: 1)`;

  const res = await sendMessageCompleteRequest(api, message, { caption });
  const msgId = res?.message?.msgId || res?.attachment?.[0]?.msgId;

  selectionsMap.set(msgId.toString(), {
    userId: senderId,
    stage: "movie",
    list: results,
    timestamp: Date.now(),
  });

  setSelectionsMapData(senderId, {
    platform: PLATFORM,
    quotedMsgId: msgId?.toString(),
    collection: results,
    timestamp: Date.now(),
  });
}

export async function handleSubNhanhChillReply(api, message) {
  const senderId = message.data.uidFrom;
  const botId = getBotId();
  const quotedMsgId = message.data.quote?.globalMsgId?.toString();
  const cliMsgId = message.data.quote?.cliMsgId;
  const selection = removeMention(message).trim().replace(/\s/g, "");

  if (!quotedMsgId) return false;

  const stored = selectionsMap.get(quotedMsgId);
  if (!stored || stored.userId !== senderId) return false;

  try {
    await api.deleteMessage({
      type: message.type,
      threadId: message.threadId,
      data: {
        cliMsgId,
        msgId: quotedMsgId,
        uidFrom: botId,
      }
    }, false);
  } catch {}

  if (stored.stage === "movie") {
    const index = parseInt(selection) - 1;
    const selected = stored.list[index];
    if (!selected) {
      await sendMessageWarningRequest(api, message, {
        caption: "❌ Số phim không hợp lệ.",
      });
      return true;
    }

    const { title, episodes } = await getMovieDetail(selected.link);
    if (!episodes.length) {
      await sendMessageWarningRequest(api, message, {
        caption: `❌ Không có tập phim.`,
      });
      return true;
    }

    const labels = episodes.map(ep => ep.label).join(", ");
    const reply = await sendMessageCompleteRequest(api, message, {
      caption: `🎬 ${title}\nTập có sẵn: ${labels}\n\n➡️ Trả lời đúng tên tập để xem (VD: 1, Tập 2...)`,
    });

    const msgId = reply?.message?.msgId || reply?.attachment?.[0]?.msgId;

    selectionsMap.set(msgId.toString(), {
      userId: senderId,
      stage: "episode",
      selected,
      episodeMap: episodes,
      timestamp: Date.now(),
    });

    selectionsMap.delete(quotedMsgId);
    return true;
  }

  if (stored.stage === "episode") {
    const { selected, episodeMap } = stored;
    const matched = episodeMap.find(ep =>
      ep.label.replace(/\s/g, "") === selection ||
      ep.label.toLowerCase().includes(selection.toLowerCase()) ||
      ep.label.replace(/\D/g, "") === selection
    );

    if (!matched) {
      await sendMessageWarningRequest(api, message, {
        caption: `❌ Không tìm thấy tập "${selection}". Hãy nhập đúng như "Tập 1" hoặc số.`,
      });
      return true;
    }

    await handleSendSubNhanhChillEpisode(api, message, {
      selectedHero: selected,
      selectedSkin: matched
    });

    selectionsMap.delete(quotedMsgId);
    return true;
  }

  return false;
}

export async function handleSendSubNhanhChillEpisode(api, message, media) {
  const { selectedHero: selected, selectedSkin: match } = media;
  if (!selected || !match?.url || !match?.label) return false;

  try {
    await sendMessageProcessingRequest(api, message, {
      caption: `⏳ Đang xử lý phim ${selected.title}, tập ${match.label}...`,
    }, 50000);

    const key = `${selected.title}_ep${match.label}`;
    const cached = await getCachedMedia(PLATFORM, key);
    let videoUrl = cached?.fileUrl;

    if (!videoUrl) {
      const m3u8Url = await getBestM3u8(match.url);
      if (!m3u8Url) throw new Error("Không tìm thấy link m3u8");

      const fileName = `${Date.now()}_${match.label}.mp4`;
      const filePath = path.join(tempDir, fileName); 
      
      await downloadM3U8ToMP4(m3u8Url, filePath, {
        referer: 'https://vip.opstream90.com/',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      });

      await sendMessageProcessingRequest(api, message, {
        caption: `📤 Đang upload phim, vui lòng đợi tí...`,
      }, 30000);
      const parts = await splitLargeFileEvenly(filePath);
      let uploadedUrl = null; 
      for (const [index, part] of parts.entries()) {
        const uploadResult = await api.uploadAttachment([part], message.threadId, message.type);
        console.log(`✅ Upload part ${index + 1}:`, uploadResult);
        const fileUrl = uploadResult?.[0]?.fileUrl;
        if (!fileUrl) {
          console.warn(`❌ Không thể upload part ${index + 1}`);
          continue;
        }
        if (index === 0) {
          uploadedUrl = fileUrl;
          await setCacheData(PLATFORM, key, { fileUrl: uploadedUrl });
        }

        await api.sendVideov2({
          videoUrl: fileUrl,
          threadId: message.threadId,
          threadType: message.type,
          message: {
            text: `🎬 ${selected.title} – Tập ${match.label} (Phần ${index + 1}/${parts.length})`,
            mentions: [MessageMention(message.data.uidFrom, 0, 0, false)],
          },
          ttl: 6000000,
        });
      
        deleteFile(part);
      }
    }      
    return true;
  } catch (err) {
    console.error("❌ Lỗi gửi tập phim:", err.message);
    await sendMessageWarningRequest(api, message, {
      caption: `⚠️ Không thể xử lý tập ${match.label}.`,
    }, 1500000);
    return true;
  }
}
