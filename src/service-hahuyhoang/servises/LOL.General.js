import axios from "axios";
import { LRUCache } from "lru-cache";
import * as cheerio from "cheerio";
import { sendMessageCompleteRequest, sendMessageWarningRequest } from "../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../utils/format-util.js";
import { createSearchResultImage } from "./canvas/Seach.canvas.js";
import { deleteFile } from "../../utils/util.js";
import { getBotId } from "../../index.js";
import { getGlobalPrefix } from "../service.js";
import { setSelectionsMapData, deleteSelectionsMapData } from "../api-crawl/index.js";
import { createHeroFinalDetailImage } from "./canvas/LOL.image.js";

const PLATFORM = "lol";
const BASE_URL = "https://www.leagueoflegends.com/vi-vn/champions/";
const TIME_TO_SELECT = 60000;

const heroSelectionsMap = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT
});

async function getAllChampions() {
  const res = await axios.get(BASE_URL);
  const $ = cheerio.load(res.data);
  const jsonRaw = $('#__NEXT_DATA__').html();
  const data = JSON.parse(jsonRaw);
  const items = data.props?.pageProps?.page?.blades.find(b => b.type === "characterCardGrid")?.items || [];
  return items.map(item => ({
    name: item.title,
    image: item.media?.url,
    link: `https://www.leagueoflegends.com${item.action?.payload?.url}`
  }));
}

async function getChampionDetail(url) {
  const res = await axios.get(url);
  const $ = cheerio.load(res.data);
  const jsonRaw = $('#__NEXT_DATA__').html();
  const data = JSON.parse(jsonRaw);
  const blades = data.props?.pageProps?.page?.blades || [];

  const skillsTab = blades.find(b => b.type === 'iconTab');
  const skinsTab = blades.find(b => b.type === 'landingMediaCarousel');
  const masthead = blades.find(b => b.type === 'characterMasthead');

  const skins = skinsTab?.groups?.map(s => ({
    name: s.label,
    img: s.content?.media?.url,
    avatar: s.content?.media?.url,
    icon: s.content?.media?.url
  })) || [];

  const skills = skillsTab?.groups?.map(skill => ({
    name: skill.content?.title,
    description: skill.content?.description?.body,
    img: skill.thumbnail?.url
  })) || [];

  const role = masthead?.role?.roles?.map(r => r.name) || [];
  const difficulty = masthead?.difficulty?.name || "Không rõ";
  const description = masthead?.description?.body || "";

  return { skins, skills, role, difficulty, description };
}

export async function handleLOLCommand(api, message, aliasCommand) {
  const senderId = message.data.uidFrom;
  let imagePaths = null;

  try {
    const content = removeMention(message);
    const prefix = getGlobalPrefix();
    const commandContent = content.replace(`${prefix}${aliasCommand}`, '').trim();

    const allChamps = await getAllChampions();
    const filtered = commandContent
      ? allChamps.filter(c => c.name.toLowerCase().includes(commandContent.toLowerCase()))
      : allChamps;

    if (!filtered.length) {
      await sendMessageWarningRequest(api, message, {
        caption: `Không tìm thấy tướng nào với từ khóa: ${commandContent}`,
      }, 30000);
      return;
    }

    if (filtered.length === 1) {
      const selectedHero = filtered[0];
      const detail = await getChampionDetail(selectedHero.link);

      const skinsList = detail.skins.map(skin => ({
        title: skin.name,
        thumbnailM: skin.img
      }));

      const imagePath = await createSearchResultImage(skinsList);
      const response = await sendMessageCompleteRequest(api, message, {
        caption: `Danh sách trang phục của ${selectedHero.name}:\nTrả lời với số để xem chi tiết.`,
        imagePath
      }, TIME_TO_SELECT);

      const quotedMsgId = response?.message?.msgId || response?.attachment?.[0]?.msgId;

      setSelectionsMapData(senderId, {
        quotedMsgId: quotedMsgId.toString(),
        collection: detail.skins.map(skin => ({
          selectedHero,
          selectedSkin: skin,
          skills: detail.skills,
          role: detail.role,
          difficulty: detail.difficulty
        })),
        timestamp: Date.now(),
        platform: PLATFORM
      });

      await deleteFile(imagePath);
      return;
    }
    const formatted = filtered.map(c => ({
      title: c.name,
      thumbnailM: c.image
    }));

    imagePaths = await createSearchResultImage(formatted);

    const response = await sendMessageCompleteRequest(api, message, {
      caption: `Đây là các tướng bạn có thể chọn:\nHãy trả lời với số thứ tự để xem chi tiết (ví dụ: 1)`,
      imagePath: imagePaths
    }, TIME_TO_SELECT);

    const quotedMsgId = response?.message?.msgId || response?.attachment?.[0]?.msgId;

    heroSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      stage: "hero",
      collection: filtered,
      timestamp: Date.now(),
    });

    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: filtered,
      timestamp: Date.now(),
      platform: PLATFORM,
    });

    await deleteFile(imagePaths);
  } catch (err) {
    console.error("Lỗi khi xử lý lệnh LOL:", err);
    await sendMessageWarningRequest(api, message, {
      caption: `Đã xảy ra lỗi. Vui lòng thử lại sau.`
    }, 30000);
  }
}

export async function handleLOLReply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = getBotId();
  const quotedMsgId = message.data.quote?.globalMsgId?.toString() || null;

  try {
    // Xóa tin nhắn danh sách khi reply
    if (
      message.data.quote?.cliMsgId &&
      quotedMsgId &&
      heroSelectionsMap.has(quotedMsgId)
    ) {
      const msgDel = {
        type: message.type,
        threadId: message.threadId,
        data: {
          cliMsgId: message.data.quote.cliMsgId,
          msgId: quotedMsgId,
          uidFrom: idBot,
        },
      };
      try {
        await api.deleteMessage(msgDel, false);
      } catch (e) {
        console.warn("Không thể xóa tin nhắn danh sách LOL khi reply:", e);
      }
    }

    // Tìm dữ liệu đã lưu
    let matchedEntry = null;
    if (quotedMsgId && heroSelectionsMap.has(quotedMsgId)) {
      matchedEntry = { key: quotedMsgId, value: heroSelectionsMap.get(quotedMsgId) };
    } else {
      for (const [key, value] of heroSelectionsMap.entries()) {
        if (value.userRequest === senderId) {
          matchedEntry = { key, value };
          break;
        }
      }
    }

    if (!matchedEntry) return false;

    const { key, value: heroData } = matchedEntry;
    const selection = removeMention(message).trim();
    if (!/^\d+$/.test(selection)) return false;

    const selectedIndex = parseInt(selection) - 1;

    // Trường hợp chọn tướng
    if (heroData.stage === "hero") {
      const { collection } = heroData;
      if (selectedIndex < 0 || selectedIndex >= collection.length) {
        await sendMessageWarningRequest(api, message, {
          caption: `Số thứ tự không nằm trong danh sách tướng.`,
        }, 30000);
        return true;
      }

      const selectedHero = collection[selectedIndex];
      const detail = await getChampionDetail(selectedHero.link);

      const skinsList = detail.skins.map(skin => ({
        title: skin.name,
        thumbnailM: skin.img
      }));

      const imagePath = await createSearchResultImage(skinsList);
      const response = await sendMessageCompleteRequest(api, message, {
        caption: `Danh sách trang phục của ${selectedHero.name}:\nTrả lời với số để xem chi tiết.`,
        imagePath
      }, TIME_TO_SELECT);

      const newQuotedId = response?.message?.msgId || response?.attachment?.[0]?.msgId;

      heroSelectionsMap.set(newQuotedId.toString(), {
        userRequest: senderId,
        stage: "skin",
        selectedHero,
        detail,
        timestamp: Date.now()
      });

      setSelectionsMapData(senderId, {
        quotedMsgId: newQuotedId.toString(),
        collection: detail.skins.map(skin => ({
          selectedHero,
          selectedSkin: skin,
          skills: detail.skills,
          role: detail.role,
          difficulty: detail.difficulty
        })),
        timestamp: Date.now(),
        platform: PLATFORM
      });

      heroSelectionsMap.delete(key);
      await deleteFile(imagePath);
      return true;
    }

    // Trường hợp chọn skin
    if (heroData.stage === "skin") {
      const { detail, selectedHero } = heroData;
      if (selectedIndex < 0 || selectedIndex >= detail.skins.length) {
        await sendMessageWarningRequest(api, message, {
          caption: `Số thứ tự không nằm trong danh sách trang phục.`,
        }, 30000);
        return true;
      }

      const selectedSkin = detail.skins[selectedIndex];

      await handleSendLOLChampionDetail(api, message, {
        selectedHero,
        selectedSkin,
        skills: detail.skills,
        role: detail.role,
        difficulty: detail.difficulty
      });

      heroSelectionsMap.delete(key);
      deleteSelectionsMapData(senderId);
      return true;
    }

    return false;
  } catch (err) {
    console.error("Lỗi khi xử lý reply LOL:", err);
    return true;
  }
}

export async function handleSendLOLChampionDetail(api, message, media) {
  if (!media || !media.selectedHero || !media.selectedSkin) return false;

  const { selectedHero, selectedSkin, skills, role, difficulty } = media;

  try {
    const imagePath = await createHeroFinalDetailImage({
      name: selectedHero.name,
      skin: selectedSkin.name,
      avatarUrl: selectedSkin.avatar,
      backgroundUrl: selectedSkin.img,
      icon: selectedSkin.icon,
      skills,
      role,
      difficulty
    });

    await sendMessageCompleteRequest(api, message, {
      caption: `Thông tin chi tiết về ${selectedHero.name} – ${selectedSkin.name}`,
      imagePath
    }, 600000);

    await deleteFile(imagePath);
    return true;
  } catch (error) {
    console.error("Lỗi khi gửi chi tiết LOL:", error);
    return false;
  }
}
