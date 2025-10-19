import fs from "fs/promises";
import path from "path";
import schedule from "node-schedule";
import chalk from "chalk";
import axios from "axios";
import { LRUCache } from "lru-cache";
import { handleSendTrackZingMp3 } from "./music/zingmp3.js";
import { removeMention } from "../../utils/format-util.js";
import { getMessageCache, getMessageCacheByMsgId } from "../../utils/message-cache.js";
import { getBotId, isAdmin } from "../../index.js";
import { handleSendTrackSoundCloud } from "./music/soundcloud.js";
import { handleSendTrackNhacCuaTui } from "./music/nhaccuatui.js";
import { handleSendMediaYoutube } from "./youtube/youtube-service.js";
import { deleteFile } from "../../utils/util.js";
import { sendTikTokVideo } from "./tiktok/tiktok-service.js";
import { handleSendTemplateCapcut } from "./capcut/capcut-service.js";
import { processAndSendMedia } from "./api-hahuyhoangbot/aio-downlink.js";
import { handleSendHeroSkinDetail } from "../servises/LQM-General.js";
import { handleSendLOLChampionDetail } from "../servises/LOL.General.js";
import { handleSendHH3DEpisode } from "./video/yanhh3d-phim3d.js";
import { handleSendSubNhanhChillEpisode } from "./video/subnhanhchill.net.js";
const TIME_TO_SELECT = 60000;
export const selectionsMapData = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT
});

export const getSelectionsMapData = () => selectionsMapData;
export function setSelectionsMapData(idUser, data) {
  deleteSelectionsMapData(idUser);
  selectionsMapData.set(idUser, { ...data });
};
export function deleteSelectionsMapData(idUser) {
  if (selectionsMapData.has(idUser)) {
    selectionsMapData.delete(idUser);
  }
}
export async function checkReplySelectionsMapData(api, message) {
  const platformResolvers = {
    hh3d: (collection, input) => {
      const cleanInput = input.trim().replace(/\s/g, "");
      return collection.find(item => item.selectedSkin?.label?.replace(/\s/g, "") === cleanInput);
    },
    default: (collection, input) => {
      const index = parseInt(input.trim()) - 1;
      if (isNaN(index) || index < 0 || index >= collection.length) return null;
      return collection[index];
    }
  };
  
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const isAdminLevelHighest = isAdmin(senderId);
  if (message.data?.quote) return false;
  if (selectionsMapData.has(senderId)) {
    const data = selectionsMapData.get(senderId);
    let selection = removeMention(message).trim();
    let [firstPart, subCommand] = selection.split(" ");
    const { collection, quotedMsgId, platform } = data;
    const resolver = platformResolvers[platform] || platformResolvers.default;
    const media = resolver(collection, firstPart);
    
    if (!media) return false;
    
    if (!isAdminLevelHighest && media.duration && media.duration > 30 * 60 * 1000) {
      const object = {
        caption: `Thời lượng của lựa chọn bạn chọn vượt quá thời gian tin nhắn tồn tại, vui lòng chọn lựa chọn khác.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }
    deleteSelectionsMapData(senderId);
    const cacheMessage = getMessageCacheByMsgId(quotedMsgId);
    if (cacheMessage) {
      const msgDel = {
        type: cacheMessage.type,
        threadId: cacheMessage.threadId,
        data: {
          cliMsgId: cacheMessage.cliMsgId,
          msgId: cacheMessage.msgId,
          uidFrom: getBotId(),
        },
      };
      await api.deleteMessage(msgDel, false);
    }

    switch (data.platform) {
      case "subnhanhchill": 
        return await handleSendSubNhanhChillEpisode(api, message, media);
      case "hh3d":
        return await handleSendHH3DEpisode(api, message, media);
      case "lol":
        return await handleSendLOLChampionDetail(api, message, media);
      case "lienquan":
        return await handleSendHeroSkinDetail(api, message, media);
      case "zingmp3":
        return await handleSendTrackZingMp3(api, message, media, subCommand);
      case "soundcloud":
        return await handleSendTrackSoundCloud(api, message, media);
      case "nhaccuatui":
        return await handleSendTrackNhacCuaTui(api, message, media);
      case "youtube":
        const videoPath = null;
        try {
          await handleSendMediaYoutube(api, message, media, subCommand || "default", videoPath, isAdminLevelHighest);
        } catch (error) {
          if (videoPath) await deleteFile(videoPath);
        }
        return true;
      case "tiktok":
        return await sendTikTokVideo(api, message, media, false, subCommand || "540p");
      case "capcut":
        return await handleSendTemplateCapcut(api, message, media);
      case "downlink":
        let { uniqueId, mediaType, title, duration = 0, author } = data;
        await processAndSendMedia(api, message, {
          selectedMedia: media,
          mediaType,
          uniqueId,
          duration,
          title,
          author,
          senderId,
          senderName
        });
        return true;
    }
  }
  return false;
};
