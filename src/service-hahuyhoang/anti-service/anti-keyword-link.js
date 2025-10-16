import fs from "fs";
import path from "path";
import { MessageMention, MessageType } from "zlbotdqt";
import { getBotId } from "../../index.js";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { createBlockSpamLinkImage } from "../../utils/canvas/event-image.js";
import { clearImagePath } from "../../utils/canvas/index.js";
import { getGroupInfoData } from "../info-service/group-info.js";
import { getUserInfoData } from "../info-service/user-info.js";
import { removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../service.js";
import { scanQRCode } from "../tien-ich/qr-scan.js";
import { isInWhiteList } from "./white-list.js";

const keywordFilePath = path.join(process.cwd(), "assets/json-data/blocked-link-keywords.json");

function loadLinkKeywordList(threadId) {
  try {
    const data = fs.readFileSync(keywordFilePath, "utf8");
    const json = JSON.parse(data);
    return json.groups?.[threadId] || [];
  } catch {
    return [];
  }
}

function writeLinkKeywordList(threadId, list) {
  try {
    const raw = fs.existsSync(keywordFilePath)
      ? JSON.parse(fs.readFileSync(keywordFilePath, "utf8"))
      : { groups: {} };
    if (!raw.groups) raw.groups = {};
    raw.groups[threadId] = [...new Set(list)];
    fs.writeFileSync(keywordFilePath, JSON.stringify(raw, null, 2));
  } catch {}
}

function containsBlockedKeyword(content, keywords) {
  if (!keywords || !Array.isArray(keywords)) return false;
  try {
    const lower = String(content || "").toLowerCase();
    return keywords.some(keyword => lower.includes(keyword));
  } catch {
    return false;
  }
}

let linkSendCount = {};
let linkSendTime = {};

export async function antiLinkKeyword(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;

  if (isSelf || !botIsAdminBox || !groupSettings[threadId]?.removeLinkKeywords) return false;

  const keywords = loadLinkKeywordList(threadId);
  const msgType = message.data.msgType;
  const content = message.data.msg || message.data.content?.title || message.data.content || "";
  let matched = containsBlockedKeyword(content, keywords);

  if (!matched && msgType === "chat.photo") {
    const attachments = message.data.attachments;
    const images = attachments && attachments.length > 0
      ? attachments.map(a => a?.href).filter(Boolean)
      : [message.data?.content?.href].filter(Boolean);

    for (const linkImage of images) {
      const result = await scanQRCode(linkImage).catch(() => null);
      if (result?.success) {
        const qrContent = result.data.content || "";
        if (containsBlockedKeyword(qrContent, keywords)) {
          matched = true;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  if (matched) {
    await api.deleteMessage(message, false).catch(() => {});
    const isUserWhiteList = isInWhiteList(groupSettings, threadId, senderId);
    if (!isAdminBox && !isUserWhiteList) {
      await updateLinkKeywordCount(api, message, threadId, senderId, senderName);
    }
    return true;
  }

  return false;
}

async function updateLinkKeywordCount(api, message, threadId, senderId, senderName) {
  const botId = getBotId();

  if (!linkSendCount[senderId]) {
    linkSendCount[senderId] = 0;
    linkSendTime[senderId] = Date.now();
  }

  linkSendCount[senderId]++;

  if (Date.now() - linkSendTime[senderId] < 10 * 60 * 1000) {
    if (linkSendCount[senderId] > 3) {
      await blockUser(api, message, threadId, senderId, senderName);
      return;
    }
  } else {
    linkSendCount[senderId] = 1;
    linkSendTime[senderId] = Date.now();
  }

  await sendWarningMessage(api, message, senderId, senderName, linkSendCount[senderId]);
}

async function blockUser(api, message, threadId, senderId, senderName) {
  try {
    await api.blockUsers(threadId, [senderId]);
    const groupInfo = await getGroupInfoData(api, threadId);
    const userInfo = await getUserInfoData(api, senderId);
    const imagePath = await createBlockSpamLinkImage(userInfo, groupInfo.name, groupInfo.groupType, userInfo.gender);

    await api.sendMessage(
      { msg: "", attachments: imagePath ? [imagePath] : [], quote: message },
      threadId,
      MessageType.GroupMessage
    );

    await api.sendMessage(
      { msg: `Bạn đã bị chặn vì gửi từ khóa cấm: [${senderName}]`, attachments: imagePath ? [imagePath] : [], quote: message },
      senderId,
      MessageType.DirectMessage
    ).catch(() => {});

    await clearImagePath(imagePath);
  } catch {}
}

async function sendWarningMessage(api, message, senderId, senderName, count) {
  try {
    let warning = `⚠️ Cảnh cáo ${senderName}! Không gửi link cấm trong nhóm.`;
    if (count === 2) {
      warning = `⚠️ Cảnh cáo ${senderName} lần 2\nKhông gửi link nữa! Vi phạm tiếp sẽ bị chặn.`;
    } else if (count === 3) {
      warning = `⚠️ Cảnh cáo ${senderName} lần 3\nMày muốn bị bố chặn à?`;
    }

    const mentionStart = warning.indexOf(senderName);
    const mentions = [MessageMention(senderId, senderName.length, mentionStart)];

    await api.sendMessage(
      { msg: warning, mentions, quote: message, ttl: 30000 },
      message.threadId,
      MessageType.GroupMessage
    );
  } catch {}
}

export async function handleAntiLinkKeywordCommand(api, message, aliasCommand, groupSettings) {
  const prefix = getGlobalPrefix();
  const threadId = message.threadId;
  const content = removeMention(message).replace(`${prefix}${aliasCommand}`, "").trim();
  const args = content.split(/\s+/);
  const command = args[0]?.toLowerCase();
  const value = args[1]?.toLowerCase();

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }
  const keywords = loadLinkKeywordList(threadId);

  if (["on", "off", undefined].includes(command)) {
    let newStatus;
    if (command === "on") {
      groupSettings[threadId].removeLinkKeywords = true;
      newStatus = "bật";
    } else if (command === "off") {
      groupSettings[threadId].removeLinkKeywords = false;
      newStatus = "tắt";
    } else {
      groupSettings[threadId].removeLinkKeywords = !groupSettings[threadId].removeLinkKeywords;
      newStatus = groupSettings[threadId].removeLinkKeywords ? "bật" : "tắt";
    }
    const caption = `Chức năng lọc link theo từ khóa chỉ định đã được ${newStatus}!`;
    await sendMessageStateQuote(api, message, caption, groupSettings[threadId].removeLinkKeywords, 30000);
    return true;
  }

  if (command === "add") {
    if (!value) {
      return sendMessageStateQuote(api, message, "Vui lòng nhập từ khóa link cần thêm.", false, 30000);
    }
    if (keywords.includes(value)) {
      return sendMessageStateQuote(api, message, `Từ khóa link "${value}" đã tồn tại.`, false, 30000);
    }
    keywords.push(value);
    writeLinkKeywordList(threadId, keywords);
    return sendMessageStateQuote(api, message, `Đã thêm từ khóa link "${value}".`, true, 30000);
  }

  if (command === "remove") {
    if (!value) {
      return sendMessageStateQuote(api, message, "Vui lòng nhập từ khóa cần xóa.", false, 30000);
    }
    if (!keywords.includes(value)) {
      return sendMessageStateQuote(api, message, `Không tìm thấy từ khóa link "${value}".`, false, 30000);
    }
    const updated = keywords.filter(k => k !== value);
    writeLinkKeywordList(threadId, updated);
    return sendMessageStateQuote(api, message, `Đã xóa từ khóa link "${value}".`, true, 30000);
  }

  if (command === "list") {
    if (keywords.length === 0) {
      return sendMessageStateQuote(api, message, "Danh sách từ khóa link đang trống.", false, 30000);
    }
    const listText = keywords.map((k, i) => `${i + 1}. ${k}`).join("\n");
    return sendMessageStateQuote(api, message, `Danh sách từ khóa link bị chặn:\n${listText}`, true, 30000);
  }

  return sendMessageStateQuote(
    api,
    message,
    `Cú pháp không hợp lệ. Dùng: ${prefix}${aliasCommand} add | remove <từ_khóa> | list | on | off`,
    false,
    30000
  );
}
