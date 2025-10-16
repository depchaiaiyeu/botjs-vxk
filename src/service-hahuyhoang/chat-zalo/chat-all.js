import { MultiMsgStyle, MessageStyle } from "../../api-zalo/models/Message.js";
import { removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../service.js";

export async function TagAllAuto(api, message, overrideContent = null) {
  const content = overrideContent || removeMention(message);
  const prefix = getGlobalPrefix();
  const threadId = message.threadId;

  const chatMessage = content.replace(`${prefix}all`, "").trim();
  if (chatMessage) {
    await api.sendMessagev1(
      {
        msg: chatMessage, ttl: 10000,
        style: MultiMsgStyle([MessageStyle(0, chatMessage.length, "ff3131", "18")]),
        mentions: [{ pos: 0, uid: -1, len: chatMessage.length }],
      },
      threadId,
      message.type
    );
  }
}
export async function chatAll(api, message) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const threadId = message.threadId;

  const chatMessage = content.replace(`${prefix}all`, "").trim();
  if (chatMessage) {
    await api.sendMessagev1(
      {
        msg: chatMessage,
        style: MultiMsgStyle([MessageStyle(0, chatMessage.length, "ff3131", "18")]),
        mentions: [{ pos: 0, uid: -1, len: chatMessage.length }],
      },
      threadId,
      message.type
    );
    return;
  }
}
