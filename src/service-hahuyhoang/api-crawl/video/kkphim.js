import axios from "axios";
import { removeMention } from "../../../utils/format-util.js";
import { sendMessageCompleteRequest, sendMessageProcessingRequest, sendMessageWarningRequest } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { getBotId } from "../../../index.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { setSelectionsMapData } from "../index.js";

const PLATFORM = "kkphim";
const selectionsMap = new Map();
const API_BASE = "https://phimapi.com";

export async function searchKKPhim(keyword, page = 1) {
  try {
    const url = `${API_BASE}/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=10&page=${page}`;
    const { data } = await axios.get(url);
    if (data.status !== "success" || !data.data?.items) return [];
    return data.data.items.map(item => ({
      title: item.name,
      slug: item.slug,
      originName: item.origin_name,
      posterUrl: item.poster_url,
      episodeCurrent: item.episode_current,
      year: item.year,
      quality: item.quality,
      lang: item.lang
    }));
  } catch {
    return [];
  }
}

export async function getMovieDetail(slug) {
  try {
    const url = `${API_BASE}/phim/${slug}`;
    const { data } = await axios.get(url);
    if (!data.status || !data.movie) return null;
    return { movie: data.movie, episodes: data.episodes || [] };
  } catch {
    return null;
  }
}

export async function handleKKPhimCommand(api, message, command) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const query = content.replace(`${prefix}${command}`, "").trim();
  if (!query) {
    await sendMessageWarningRequest(api, message, { caption: `Bạn chưa nhập từ khóa tìm kiếm.\nVí dụ: ${prefix}${command} one piece` });
    return;
  }
  const results = await searchKKPhim(query);
  if (!results.length) {
    await sendMessageWarningRequest(api, message, { caption: `Không tìm thấy phim phù hợp với từ khóa "${query}"` }, 60000);
    return;
  }
  if (results.length === 1) {
    const selected = results[0];
    const detail = await getMovieDetail(selected.slug);
    if (!detail || !detail.episodes.length) {
      await sendMessageWarningRequest(api, message, { caption: `Không thể lấy danh sách tập phim.` }, 60000);
      return;
    }
    const episodeMap = detail.episodes[0].server_data || [];
    const labels = episodeMap.map(ep => ep.name).join(", ");
    const reply = await sendMessageCompleteRequest(api, message, { caption: `${selected.title}\n${selected.originName}\nTập: ${selected.episodeCurrent}\nCác tập có sẵn:\n${labels}\n\nTrả lời đúng tên tập để xem (VD: Full, 1, 50)` }, 60000);
    const newMsgId = reply?.message?.msgId || reply?.attachment?.[0]?.msgId;
    selectionsMap.set(newMsgId.toString(), { userId: message.data.uidFrom, stage: "episode", selected, episodeMap, timestamp: Date.now() });
    setSelectionsMapData(message.data.uidFrom, { quotedMsgId: newMsgId.toString(), collection: episodeMap.map(ep => ({ selectedHero: selected, selectedSkin: ep })), timestamp: Date.now(), platform: PLATFORM });
    return;
  }
  let caption = `Tìm thấy ${results.length} phim với từ khóa "${query}":\n`;
  results.forEach((item, i) => {
    caption += `\n${i + 1}. ${item.title}\n${item.originName}\nTập: ${item.episodeCurrent}`;
  });
  caption += `\n\nTrả lời số phim để chọn (VD: 1)`;
  const listMessage = await sendMessageCompleteRequest(api, message, { caption }, 60000);
  const quotedMsgId = listMessage?.message?.msgId || listMessage?.attachment?.[0]?.msgId;
  selectionsMap.set(quotedMsgId.toString(), { userId: message.data.uidFrom, stage: "movie", list: results, timestamp: Date.now() });
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
    await api.deleteMessage({ type: message.type, threadId: message.threadId, data: { cliMsgId: message.data.quote.cliMsgId, msgId: message.data.quote.globalMsgId, uidFrom: botId } }, false);
    await api.deleteMessage({ type: message.type, threadId: message.threadId, data: { cliMsgId: message.data.cliMsgId, msgId: message.data.msgId, uidFrom: senderId } }, false);
  } catch {}
  if (data.stage === "movie") {
    const selectedIndex = parseInt(selectedInput) - 1;
    const selected = data.list[selectedIndex];
    if (!selected) {
      await sendMessageWarningRequest(api, message, { caption: `Số phim không hợp lệ.` }, 60000);
      return true;
    }
    const detail = await getMovieDetail(selected.slug);
    if (!detail || !detail.episodes.length) {
      await sendMessageWarningRequest(api, message, { caption: `Không lấy được danh sách tập phim.` }, 60000);
      return true;
    }
    const episodeMap = detail.episodes[0].server_data || [];
    const listLabel = episodeMap.map(e => e.name).join(", ");
    const reply = await sendMessageCompleteRequest(api, message, { caption: `${selected.title}\nCác tập có sẵn: ${listLabel}\n\nTrả lời đúng tên tập để xem (VD: Full, 1, 50)` }, 60000);
    const newMsgId = reply?.message?.msgId || reply?.attachment?.[0]?.msgId;
    selectionsMap.set(newMsgId.toString(), { userId: senderId, stage: "episode", selected, episodeMap, timestamp: Date.now() });
    setSelectionsMapData(senderId, { quotedMsgId: newMsgId.toString(), collection: episodeMap.map(ep => ({ selectedHero: selected, selectedSkin: ep })), timestamp: Date.now(), platform: PLATFORM });
    selectionsMap.delete(quotedMsgId);
    return true;
  }
  if (data.stage === "episode") {
    const { selected, episodeMap } = data;
    if (!Array.isArray(episodeMap)) {
      await sendMessageWarningRequest(api, message, { caption: `Dữ liệu tập phim bị lỗi.` });
      return true;
    }
    const match = episodeMap.find(ep => ep.name.toLowerCase() === selectedInput.toLowerCase());
    if (!match) {
      await sendMessageWarningRequest(api, message, { caption: `Tập không hợp lệ. Hãy nhập đúng tên tập.` });
      return true;
    }
    const embedUrl = match.link_embed;
    if (!embedUrl) {
      await sendMessageWarningRequest(api, message, { caption: `Không tìm thấy link xem phim.` });
      return true;
    }
    await sendMessageProcessingRequest(api, message, { caption: `Đang xử lý phim ${selected.title}, tập ${match.name}...` }, 5000);
    await sendMessageCompleteRequest(api, message, { caption: `Vì giới hạn tài nguyên nên Bot không thể download video này, bạn có thể vào link dưới đây để xem phim trọn vẹn nhất!\n🔗 Link: ${embedUrl}` }, 60000);
    selectionsMap.delete(quotedMsgId);
    return true;
  }
  return false;
}

export async function handleSendKKPhimEpisode(api, message, media) {
  const { selectedHero: selected, selectedSkin: match } = media;
  if (!selected || !match?.link_embed || !match?.name) return false;
  const embedUrl = match.link_embed;
  await sendMessageProcessingRequest(api, message, { caption: `Đang xử lý phim ${selected.title}, tập ${match.name}...` }, 5000);
  await sendMessageCompleteRequest(api, message, { caption: `Vì giới hạn tài nguyên nên Bot không thể download video này, bạn có thể vào link dưới đây để xem phim trọn vẹn nhất!\n🔗 Link: ${embedUrl}` }, 60000);
  return true;
}
