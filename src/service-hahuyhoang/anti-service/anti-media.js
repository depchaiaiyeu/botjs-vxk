import fs from "fs/promises";
import path from "path";
import { getGlobalPrefix } from "../service.js";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../utils/format-util.js";
import { MessageMention } from "zlbotdqt";
import { isInWhiteList } from "./white-list.js";
import { getAntiState, updateAntiConfig } from "./index.js";

const filePath = path.join(process.cwd(), "assets/json-data/anti_media.json");

async function ensureFile() {
  try {
    await fs.access(filePath);
  } catch (err) {
    if (err.code === "ENOENT") {
      await fs.writeFile(filePath, JSON.stringify({ groups: {} }, null, 2));
    } else {
      console.error("Lỗi kiểm tra file:", err);
    }
  }
}

export async function readAntiMedia(threadId) {
  await ensureFile();
  try {
    const data = JSON.parse(await fs.readFile(filePath, "utf8"));
    return data.groups?.[threadId] ?? [];
  } catch {
    return [];
  }
}

export async function writeAntiMedia(threadId, list) {
  await ensureFile();
  const data = JSON.parse(await fs.readFile(filePath, "utf8"));
  if (!data.groups) data.groups = {};
  data.groups[threadId] = list;
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export function normalizeAttach(data) {
  if (data.attach) return data.attach;
  const content = data.content;
  if (!content) return null;
  const params = typeof content.params === "string" ? safeJsonParse(content.params) : content.params;

  if (data.msgType === "chat.sticker" && content.catId && content.id) {
    return {
      catId: content.catId,
      id: content.id,
      type: content.type || 0
    };
  }

  return {
    href: content.href || null,
    thumbUrl: content.thumbUrl || null,
    oriUrl: content.oriUrl || null,
    normalUrl: content.normalUrl || null,
    thumb: content.thumb || null,
    params,
    type: data.msgType,
  };
}

export function extractMediaUrls(attach) {
  const urls = [
    attach?.oriUrl,
    attach?.normalUrl,
    attach?.href,
    attach?.thumbUrl,
    attach?.thumb,
    attach?.params?.hd,
    attach?.params?.webp?.url,
  ];
  return urls.filter(Boolean);
}

export async function handleAntiMediaCommand(api, message, aliasCommand, groupSettings) {
  const prefix = getGlobalPrefix();
  const threadId = message.threadId;
  const content = removeMention(message).replace(`${prefix}${aliasCommand}`, "").trim();
  const args = content.split(/\s+/);
  const command = args[0]?.toLowerCase();
  const currentList = await readAntiMedia(threadId);

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }
  if (["on", "off", undefined].includes(command)) {
    let newStatus;
    if (command === "on") {
      groupSettings[threadId].antiMedia = true;
      newStatus = "bật";
    } else if (command === "off") {
      groupSettings[threadId].antiMedia = false;
      newStatus = "tắt";
    } else {
      groupSettings[threadId].antiMedia = !groupSettings[threadId].antiMedia;
      newStatus = groupSettings[threadId].antiMedia ? "bật" : "tắt";
    }
    const caption = `Chức năng chặn media đã được ${newStatus}!`;
    await sendMessageStateQuote(api, message, caption, groupSettings[threadId].antiMedia, 30000);
    return true;
  }
  if (command === "add") {
    const quote = message.data?.quote;
    if (!quote || !quote.attach) {
      console.warn("[antiMedia] Không có quote hoặc quote.attach:", quote);
      return sendMessageStateQuote(api, message, "Vui lòng reply vào một media để thêm vào danh sách chặn.", false, 30000);
    }
    let attach = quote.attach;
    if (typeof attach === "string") {
      try {
        attach = JSON.parse(attach);
      } catch (err) {
        console.error("[antiMedia] Lỗi parse quote.attach:", err, quote.attach);
        return sendMessageStateQuote(api, message, "Media reply không hợp lệ (dữ liệu hỏng).", false, 30000);
      }
    }

    const url = attach.href || attach.thumb || null;
    const catId = attach.catId;
    const id = attach.id;

    if (url) {
      const exists = currentList.some(e => e.url === url);
      if (exists) {
        return sendMessageStateQuote(api, message, "Media này đã bị chặn từ trước.", false, 30000);
      }
      await writeAntiMedia(threadId, [...currentList, { url }]);
      return sendMessageStateQuote(api, message, "Đã thêm media vào danh sách chặn.", true, 30000);
    } else if (catId && id) {
      const exists = currentList.some(e => e.catId === catId && e.id === id);
      if (exists) {
        return sendMessageStateQuote(api, message, "Sticker này đã bị chặn từ trước.", false, 30000);
      }
      await writeAntiMedia(threadId, [...currentList, { catId, id }]);
      return sendMessageStateQuote(api, message, "Đã chặn Media.", true, 30000);
    } else {
      return sendMessageStateQuote(api, message, "Không thể nhận dạng media để chặn.", false, 30000);
    }
  }

  if (command === "remove") {
    const param = args[1];
    if (!param) {
      return sendMessageStateQuote(api, message, "Vui lòng nhập số thứ tự, URL hoặc ID để xóa.", false, 30000);
    }

    let updatedList = [...currentList];
    let removed = false;

    if (/^\d+$/.test(param)) {
      const index = parseInt(param, 10) - 1;
      if (index >= 0 && index < currentList.length) {
        updatedList.splice(index, 1);
        removed = true;
      }
    } else if (param.startsWith("http")) {
      updatedList = updatedList.filter(e => e.url !== param);
      removed = updatedList.length !== currentList.length;
    } else {
      const idNum = parseInt(param, 10);
      const originalLength = updatedList.length;
      updatedList = updatedList.filter(e =>
        !(e.catId === idNum || e.id === idNum)
      );
      removed = updatedList.length !== originalLength;
    }

    if (!removed) {
      return sendMessageStateQuote(api, message, "Không tìm thấy media để xóa.", false, 30000);
    }

    await writeAntiMedia(threadId, updatedList);
    return sendMessageStateQuote(api, message, "Đã xóa media khỏi danh sách chặn.", true, 30000);
  }

  if (command === "list") {
    if (currentList.length === 0) {
      return sendMessageStateQuote(api, message, "Danh sách chặn media hiện trống.", false, 30000);
    }

    const listText = currentList.map((e, i) => {
      if (e.url) return `${i + 1}. URL: ${e.url}`;
      if (e.catId && e.id) return `${i + 1}. catId: ${e.catId}, id: ${e.id}`;
      return `${i + 1}. Không rõ định danh`;
    }).join("\n");

    return sendMessageStateQuote(api, message, `Danh sách media bị chặn:\n${listText}`, true, 30000);
  }
  return sendMessageStateQuote(
    api,
    message,
    `Cú pháp không hợp lệ. Dùng: ${prefix}${aliasCommand} add | remove <url|số|id> | list | on | off`,
    false,
    30000
  );
}
export async function antiMedia(api, message, groupSettings, isAdminBox, botIsAdminBox, isSelf) {
  if (isSelf) return false;
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;

  if (!groupSettings[threadId]?.antiMedia) return false;
  if (!botIsAdminBox || isAdminBox || isInWhiteList(groupSettings, threadId, senderId)) return false;

  const attach = normalizeAttach(message.data);
  if (!attach) return false;

  const urls = extractMediaUrls(attach);
  const catId = attach.catId;
  const id = attach.id;
  const antiList = await readAntiMedia(threadId);
  const isBlocked = antiList.some(item => {
    if (item.url) {
      return urls.includes(item.url);
    }
    if (item.catId && item.id) {
      return attach.catId === item.catId && attach.id === item.id;
    }
    return false;
  });

  if (isBlocked) {
    const senderName = message.data.dName;
    await api.deleteMessage(message, false).catch(console.error);
 //   await api.sendMessage(
 //     {
  //      msg: `${senderName} > Media bạn gửi đã bị xóa!`,
  //      quote: message,
  //      mentions: [MessageMention(senderId, senderName.length, 0)],
   //     ttl: 30000,
  //    },
  //    threadId,
  //    message.type
  //  );
    const antiState = getAntiState();
    const violations = antiState.data.violations || {};

    if (!violations[threadId]) violations[threadId] = {};
    const now = Date.now();
    const userData = violations[threadId][senderId] ?? {
      count: 0,
      words: [],
      name: senderName,
      mediaCount: 0,
      lastMediaTime: 0,
    };
    if (now - (userData.lastMediaTime || 0) > 10 * 60 * 1000) {
      userData.mediaCount = 0;
    }
    
    userData.mediaCount++;
    userData.lastMediaTime = now;
    violations[threadId][senderId] = userData;

    await updateAntiConfig({
      ...antiState.data,
      violations,
    });

    const count = violations[threadId][senderId].mediaCount;

    if (count >= 4) {
      violations[threadId][senderId].mediaCount = 0;
      await updateAntiConfig({
        ...antiState.data,
        violations,
      });

      try {
        await api.blockUsers(threadId, [senderId]);
   //     await api.sendMessage(
   //       {
    //        msg: `🚫 ${senderName} đã bị chặn vì vi phạm gửi media bị cấm quá nhiều lần.`,
    //        quote: message,
    //      },
    //      threadId,
    //      message.type
     //   );
        try {
          await api.sendMessage(
            {
              msg: `Bạn đã bị chặn khỏi nhóm vì vi phạm gửi media bị cấm trong nhóm .`,
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
    }
    else {
      let warning = `⚠️ Cảnh cáo ${senderName}! Không gửi media bị cấm trong nhóm.`;
      if (count === 2) {
        warning = `⚠️ Cảnh cáo ${senderName} lần 2\nKhông gửi media, vi phạm tiếp sẽ bị chặn!`;
      } else if (count === 3) {
        warning = `⚠️ Cảnh cáo ${senderName} lần 3\nMày muốn bị bố chặn à?`;
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

    return true;
  }

  return false;
}
