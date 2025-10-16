import fs from "fs/promises";
import path from "path";
import { MessageMention } from "zlbotdqt";
import { getGlobalPrefix } from "../service.js";
import { removeMention } from "../../utils/format-util.js";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { isInWhiteList } from "./white-list.js";
import { getAntiState, updateAntiConfig } from "./index.js";


const filePath = path.join(process.cwd(), "assets/json-data/anti_sticker.json");
const stickerListPath = path.join(process.cwd(), "assets/json-data/anti_sticker_list.json");

async function ensureFile() {
  try {
    await fs.access(filePath);
  } catch (err) {
    if (err.code === "ENOENT") {
      await fs.writeFile(filePath, JSON.stringify({ groups: {} }, null, 2));
    } else {
      console.error("Lỗi kiểm tra file anti_sticker:", err);
    }
  }
}

async function readStickerBlockList() {
  try {
    const data = await fs.readFile(stickerListPath, "utf8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeStickerBlockList(list) {
  await fs.writeFile(stickerListPath, JSON.stringify(list, null, 2));
}

export async function readAntiSticker(threadId) {
  await ensureFile();
  try {
    const data = JSON.parse(await fs.readFile(filePath, "utf8"));
    return data.groups?.[threadId] ?? false;
  } catch {
    return false;
  }
}

export async function writeAntiSticker(threadId, status) {
  await ensureFile();
  const data = JSON.parse(await fs.readFile(filePath, "utf8"));
  if (!data.groups) data.groups = {};
  data.groups[threadId] = status;
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function handleAntiStickerCommand(api, message, groupSettings, aliasCommand) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message).replace(`${prefix}${aliasCommand}`, "").trim();
  const status = content.split(" ")[0]?.toLowerCase();
  const threadId = message.threadId;

  if (!groupSettings[threadId]) groupSettings[threadId] = {};

  let newStatus;
  if (status === "on") {
    groupSettings[threadId].antiSticker = true;
    newStatus = "bật";
  } else if (status === "off") {
    groupSettings[threadId].antiSticker = false;
    newStatus = "tắt";
  } else {
    groupSettings[threadId].antiSticker = !groupSettings[threadId].antiSticker;
    newStatus = groupSettings[threadId].antiSticker ? "bật" : "tắt";
  }

  await writeAntiSticker(threadId, groupSettings[threadId].antiSticker);

  const caption = `Chức năng Chặn sticker đã được ${newStatus}!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].antiSticker, 300000);

  return true;
}

export async function antiSticker(api, message, groupSettings, isAdminBox, botIsAdminBox, isSelf) {
  if (isSelf) return false;
  const threadId = message.threadId;
  const senderId = message.data?.uidFrom;

  if (!botIsAdminBox || isAdminBox || !message.data) return false;
  if (!groupSettings[threadId]?.antiSticker && !groupSettings[threadId]?.antiStkLag) return false;
  if (isInWhiteList(groupSettings, threadId, senderId)) return false;

  const content = message.data.attach || message.data.content;
  if (!content) return false;

  const antiSticker = groupSettings[threadId]?.antiSticker ?? false;
  const antiStkLag = groupSettings[threadId]?.antiStkLag ?? false;
  const stickerBlockList = antiStkLag ? await readStickerBlockList() : [];
  
  let isStickerSystem = false;
  let isStickerCustom = false;
  let isStickerInLagList = false;

  if (
    typeof content.catId === "number" &&
    typeof content.id === "number" &&
    typeof content.type === "number"
  ) {
    isStickerSystem = true;
    if (antiStkLag) {
      isStickerInLagList = stickerBlockList.some(item =>
        item.cateId === content.catId &&
        item.stickerId === content.id
      );
    }
  }
  
  if (typeof content.params === "string") {
    try {
      const params = JSON.parse(content.params);
      if (params?.webp?.url) {
        isStickerCustom = true;
      }
    } catch (err) {
      console.error("[AntiSticker] Lỗi parse params:", err.message);
    }
  }

  let shouldDelete = false;
  if (antiSticker) {
    if (isStickerSystem || isStickerCustom) {
      shouldDelete = true;
    }
  } else if (antiStkLag) {
    if (isStickerSystem && isStickerInLagList) {
      shouldDelete = true;
    }
  }

  if (shouldDelete) {
    try {
   //   console.log(`[AntiSticker] Chuẩn bị xoá message: ${message.data.cliMsgId || message.cliMsgId}`);
      await api.deleteMessage(message, false);
 //     console.log(`[AntiSticker] Đã xoá sticker gửi bởi ${senderId}`);
    } catch (error) {
      console.error("[AntiSticker] Lỗi khi xoá sticker:", error.message);
    }

    if (antiStkLag) {
      // Nếu là antiStkLag thì mới cảnh cáo!
      const senderName = message.data.dName;
      const antiState = getAntiState();
      const violations = antiState.data.violations || {};

      if (!violations[threadId]) violations[threadId] = {};
      const now = Date.now();
      const userData = violations[threadId][senderId] ?? {
        count: 0,
        words: [],
        name: senderName,
        mediaCount: 0,
        stickerCount: 0,
        lastStickerTime: 0,
      };
      if (now - (userData.lastStickerTime || 0) > 10 * 60 * 1000) {
        userData.stickerCount = 0;
      }
      
      userData.stickerCount++;
      userData.lastStickerTime = now;
      violations[threadId][senderId] = userData;

      await updateAntiConfig({
        ...antiState.data,
        violations,
      });

      const count = violations[threadId][senderId].stickerCount;

      if (count >= 5) {
        violations[threadId][senderId].stickerCount = 0;
        await updateAntiConfig({
          ...antiState.data,
          violations,
        });
      
        try {
          await api.blockUsers(threadId, [senderId]);
          try {
            await api.sendMessage(
              {
                msg: `Bạn đã bị chặn khỏi nhóm vì gửi sticker cấm quá nhiều lần.`,
                quote: message,
              },
              senderId,
              MessageType.DirectMessage
            );
          } catch (err) {
            console.error(`Không thể nhắn riêng cho ${senderName}:`, err.message);
          }
        } catch (err) {
          console.error(`Không thể chặn ${senderName}:`, err.message);
        }
      } else {
        let warning = `⚠️ Cảnh cáo ${senderName}! Không gửi sticker bị lag.`;
        if (count === 2) {
          warning = `⚠️ Cảnh cáo ${senderName} lần 2\nKhông gửi sticker bị lag, vi phạm tiếp sẽ bị chặn!`;
        } else if (count === 3) {
          warning = `⚠️ Cảnh cáo ${senderName} lần 3\nKhông gửi sticker bị lag, Gửi đéo gì gửi lắm, địt mẹ mày nữa bố nói mày nói đéo nghe à?`;
        } else if (count === 4) {
          warning = `⚠️ Cảnh cáo ${senderName} lần 4\nĐã cảnh cáo nhiều lần, lần nữa bố cho cút nhé...!`;
        }
        await api.sendMessage(
          {
            msg: warning,
            mentions: [MessageMention(senderId, senderName.length, "⚠️ Cảnh cáo ".length)],
            quote: message,
            ttl: 30000,
          },
          threadId,
          message.type
        );
      }
    }
      
    return true;
  }

  return false;
}