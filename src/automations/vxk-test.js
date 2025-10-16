import { getSimsimiReply } from "../service-hahuyhoang/chat-bot/simsimi/simsimi-api.js";
import { getBotId } from "../index.js";
import { sendMessageStateQuote } from "../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { MessageMention } from "zlbotdqt";

const lastAutoReplyMap = new Map();
const AUTO_REPLY_COOLDOWN = 5 * 60 * 1000;
const MESSAGE_TTL = AUTO_REPLY_COOLDOWN;

export async function superCheckBox(api, message, isSelf, botIsAdminBox, isAdminBox, groupSettings) {
  if (isSelf || !message.data?.mentions?.length) return false;

  const threadId = message.threadId;
  const mentions = message.data.mentions;
  const senderName = message.data.dName;
  const senderId = message.data.uidFrom;
  const botUid = getBotId();

  const botMentioned = mentions.some(m => m.uid === botUid);
  if (!botMentioned) return false;

  if (!groupSettings[threadId]?.autoReply) return false;

  const mention = mentions.find(m => m.uid === botUid);
  const userMessage = mention && message.data?.content
    ? message.data.content.slice(mention.len).trim()
    : "";

  const now = Date.now();
  if (!lastAutoReplyMap.has(threadId)) lastAutoReplyMap.set(threadId, new Map());
  const groupMap = lastAutoReplyMap.get(threadId);
  const lastSent = groupMap.get(senderId) || 0;

  if (!userMessage) {
    if (now - lastSent >= AUTO_REPLY_COOLDOWN) {
      groupMap.set(senderId, now);
      await api.sendMessage(
        {
          msg:
            `Xin chào ${senderName}, mình là bot của anh Kiên.\n` +
            `Hiện tại anh Kiên đang offline, nếu bạn cần giúp đỡ có thể để lại tin nhắn, anh ấy sẽ đọc lại sau!`,
          ttl: MESSAGE_TTL
        },
        threadId,
        message.type
      );
    }
    return true;
  }

  try {
    const simsimiReply = await getSimsimiReply(userMessage, 0.9);
    const simsimiMessage = `@${senderName} ${simsimiReply}`;
    const offset = simsimiMessage.indexOf(`@${senderName}`);

    await api.addReaction("HEART", message);
    await api.sendMessage(
      {
        msg: simsimiMessage,
        quote: message,
        ttl: MESSAGE_TTL,
        mentions: [MessageMention(senderId, senderName.length + 1, offset)]
      },
      threadId,
      message.type
    );
  } catch {
    const fallbackMessage = `@${senderName} xin lỗi, mình chưa hiểu bạn nói gì. Bạn có thể nói rõ hơn được không ạ?`;
    const offset = fallbackMessage.indexOf(`@${senderName}`);
    await api.sendMessage(
      {
        msg: fallbackMessage,
        quote: message,
        ttl: MESSAGE_TTL,
        mentions: [MessageMention(senderId, senderName.length + 1, offset)]
      },
      threadId,
      message.type
    );
  }

  return true;
}

export async function handleAutoReplyCommand(api, message, groupSettings) {
  const content = message.data?.content || "";
  const threadId = message.threadId;
  const args = content.split(" ");
  const command = args[1]?.toLowerCase();

  if (!groupSettings[threadId]) groupSettings[threadId] = {};

  if (command === "on") {
    groupSettings[threadId].autoReply = true;
  } else if (command === "off") {
    groupSettings[threadId].autoReply = false;
  } else {
    groupSettings[threadId].autoReply = !groupSettings[threadId].autoReply;
  }

  const newStatus = groupSettings[threadId].autoReply ? "bật" : "tắt";
  await sendMessageStateQuote(
    api,
    message,
    `Chức năng tự động trả lời tin nhắn với Simsimi đã được ${newStatus}!`,
    groupSettings[threadId].autoReply,
    MESSAGE_TTL
  );
  return true;
}
