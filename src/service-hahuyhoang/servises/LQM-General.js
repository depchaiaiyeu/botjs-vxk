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
import { createHeroFinalDetailImage } from "./canvas/LQM.image.js";

const PLATFORM = "lienquan";
const BASE_URL = "https://lienquan.garena.vn/hoc-vien/tuong-skin/";
const TIME_TO_SELECT = 60000;

const heroSelectionsMap = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT,
});

const resolveSrc = (src) => {
  if (!src) return null;
  return src.startsWith("http") ? src : `https://lienquan.garena.vn${src}`;
};

async function getAllHeroes() {
  const res = await axios.get(BASE_URL);
  const $ = cheerio.load(res.data);
  const heroes = [];
  $("a.st-heroes__item").each((_, el) => {
    const name = $(el).find("img").attr("alt");
    const img = resolveSrc($(el).find("img").attr("src"));
    const link = resolveSrc($(el).attr("href"));
    heroes.push({ name, img, link });
  });
  return heroes;
}

async function getHeroDetail(heroUrl) {
  const res = await axios.get(heroUrl);
  const $ = cheerio.load(res.data);

  const skins = [];
  const skinThumbs = [];
  $("ul.hero__skins--list li").each((_, el) => {
    const title = $(el).find("a").attr("title")?.trim();
    const thumb = resolveSrc($(el).find("img").attr("src"));
    if (title && thumb) {
      skinThumbs.push({ name: title, avatar: thumb });
    }
  });

  $("section.hero__skins .hero__skins--detail").each((i, el) => {
    const h3 = $(el).find("h3");
    const name = h3.clone().children("img").remove().end().text().trim();
    const icon = resolveSrc(h3.find("img").attr("src"));
    const img = resolveSrc($(el).find("picture img").attr("src"));
    const avatar = skinThumbs[i]?.avatar || img;
    skins.push({ name, icon, img, avatar });
  });

  const skills = [];
  $("section.hero__skills .hero__skills--detail").each((i, el) => {
    const name = $(el).find("h3").text().trim();
    const description = $(el).find("article").text().trim();
    const img = resolveSrc(
      $(`ul.hero__skills--list li:nth-child(${i + 1}) img`).attr("src")
    );
    skills.push({ name, description, img });
  });

  return { skins, skills };
}

export async function handleLienQuanCommand(api, message, aliasCommand) {
  const senderId = message.data.uidFrom;
  let imagePaths = null;

  try {
    const content = removeMention(message);
    const prefix = getGlobalPrefix();
    const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();

    const allHeroes = await getAllHeroes();
    const filtered = commandContent
      ? allHeroes.filter((h) =>
          h.name.toLowerCase().includes(commandContent.toLowerCase())
        )
      : allHeroes;

    if (filtered.length === 0) {
      await sendMessageWarningRequest(api, message, {
        caption: `Không tìm thấy tướng nào với từ khóa: ${commandContent}`,
      }, 30000);
      return;
    }

    if (filtered.length === 1) {
      const selectedHero = filtered[0];
      const detail = await getHeroDetail(selectedHero.link);

      const skinsList = detail.skins.map((skin) => ({
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
          skills: detail.skills
        })),
        timestamp: Date.now(),
        platform: PLATFORM
      });

      await deleteFile(imagePath);
      return;
    }

    const formatted = filtered.map((h) => ({
      title: h.name,
      thumbnailM: h.img,
    }));

    imagePaths = await createSearchResultImage(formatted);

    const sendAndTrack = async (imgPath) => {
      const response = await sendMessageCompleteRequest(api, message, {
        caption: `Đây là các tướng bạn có thể chọn:\nHãy trả lời với số thứ tự để xem chi tiết (ví dụ: 1)`,
        imagePath: imgPath,
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
    };

    if (Array.isArray(imagePaths)) {
      for (const img of imagePaths) {
        await sendAndTrack(img);
        await deleteFile(img);
      }
    } else {
      await sendAndTrack(imagePaths);
      await deleteFile(imagePaths);
    }
  } catch (err) {
    console.error("Lỗi khi xử lý lệnh LienQuan:", err);
    await sendMessageWarningRequest(api, message, {
      caption: `Đã xảy ra lỗi. Vui lòng thử lại sau.`,
    }, 30000);
  }
}

export async function handleLienQuanReply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = getBotId();
  const quotedMsgId = message.data.quote?.globalMsgId?.toString() || null;

  try {
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
        console.warn("Không thể xóa tin nhắn danh sách LQM khi reply:", e);
      }
    }

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
    let selection = removeMention(message).trim();
    if (!/^\d+$/.test(selection)) return false;

    const selectedIndex = parseInt(selection) - 1;
    if (isNaN(selectedIndex)) {
      await sendMessageWarningRequest(api, message, {
        caption: `Lựa chọn không hợp lệ. Vui lòng nhập số thứ tự.`,
      }, 30000);
      return true;
    }

    if (heroData.stage === "hero") {
      const { collection } = heroData;
      if (selectedIndex < 0 || selectedIndex >= collection.length) {
        await sendMessageWarningRequest(api, message, {
          caption: `Số thứ tự không nằm trong danh sách tướng.`,
        }, 30000);
        return true;
      }

      const selectedHero = collection[selectedIndex];
      const detail = await getHeroDetail(selectedHero.link);

      const formattedSkins = detail.skins.map((skin) => ({
        title: skin.name,
        thumbnailM: skin.img,
      }));

      const imagePath = await createSearchResultImage(formattedSkins);
      const response = await sendMessageCompleteRequest(api, message, {
        caption: `Danh sách trang phục của ${selectedHero.name}:\nTrả lời tin nhắn để xem chi tiết.`,
        imagePath,
      }, TIME_TO_SELECT);

      const newQuotedId = response?.message?.msgId || response?.attachment?.[0]?.msgId;
      heroSelectionsMap.set(newQuotedId.toString(), {
        userRequest: senderId,
        stage: "skin",
        selectedHero,
        detail,
        timestamp: Date.now(),
      });

      await deleteFile(imagePath);
      return true;
    }

    if (heroData.stage === "skin") {
      const { detail, selectedHero } = heroData;
      if (selectedIndex < 0 || selectedIndex >= detail.skins.length) {
        await sendMessageWarningRequest(api, message, {
          caption: `Số thứ tự không nằm trong danh sách trang phục.`,
        }, 30000);
        return true;
      }

      const selectedSkin = detail.skins[selectedIndex];
      const imagePath = await createHeroFinalDetailImage({
        name: selectedHero.name,
        skin: selectedSkin.name,
        avatarUrl: selectedSkin.avatar,
        backgroundUrl: selectedSkin.img,
        icon: selectedSkin.icon,
        skills: detail.skills,
      });

      await sendMessageCompleteRequest(api, message, {
        caption: `Thông tin về tướng ${selectedHero.name}`,
        imagePath,
      }, 600000);

      heroSelectionsMap.delete(key);
      deleteSelectionsMapData(senderId);
      await deleteFile(imagePath);
      return true;
    }

    return false;
  } catch (err) {
    console.error("Lỗi khi xử lý reply LienQuan:", err);
    return true;
  }
}


export async function handleSendHeroSkinDetail(api, message, media) {
  if (!media || !media.selectedHero || !media.selectedSkin) {
    return false;
  }

  const { selectedHero, selectedSkin, skills } = media;

  try {
    const imagePath = await createHeroFinalDetailImage({
      name: selectedHero.name,
      skin: selectedSkin.name,
      avatarUrl: selectedSkin.avatar,
      backgroundUrl: selectedSkin.img,
      icon: selectedSkin.icon,
      skills,
    });

    await sendMessageCompleteRequest(api, message, {
      caption: `Thông tin về tướng ${selectedHero.name}`,
      imagePath,
    }, 600000);

    await deleteFile(imagePath);
    return true;
  } catch (error) {
    console.error("Lỗi khi gửi chi tiết tướng:", error);
    return false;
  }
}