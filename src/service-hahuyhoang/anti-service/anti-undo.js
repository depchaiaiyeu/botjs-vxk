import { formatTime, removeMention } from "../../utils/format-util.js";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { isInWhiteList } from "./white-list.js";
import { getMessageCache } from "../../utils/message-cache.js";

const undoQueue = [];
let isProcessingQueue = false;
const TIME_SHOW_UNDO_MESSAGE = 300000;

export async function handleAntiUndoCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const parts = content.split(" ");
  const threadId = message.threadId;
  const command = parts[1]?.toLowerCase();

  let newStatus;
  if (command === "on") {
    groupSettings[threadId].antiUndo = true;
    newStatus = "bật";
  } else if (command === "off") {
    groupSettings[threadId].antiUndo = false;
    newStatus = "tắt";
  } else {
    groupSettings[threadId].antiUndo = !groupSettings[threadId].antiUndo;
    newStatus = groupSettings[threadId].antiUndo ? "bật" : "tắt";
  }

  const caption = `Chức năng chống thu hồi tin nhắn đã được ${newStatus}!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].antiUndo, 300000);

  return true;
}

async function processUndoQueue() {
  if (isProcessingQueue || undoQueue.length === 0) return;

  isProcessingQueue = true;
  const { api, undoEvent, isAdminBox, groupSettings, botIsAdminBox, isSelf } = undoQueue.shift();

  try {
    await processUndo(api, undoEvent, isAdminBox, groupSettings, botIsAdminBox, isSelf);
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    console.error("Lỗi khi xử lý tin nhắn thu hồi trong queue:", error);
  }

  isProcessingQueue = false;
  processUndoQueue();
}

async function processUndo(api, undoEvent, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const threadId = undoEvent.data.idTo;
  const senderId = undoEvent.data.uidFrom;

  if (
    isSelf ||
    isAdminBox ||
    !groupSettings[threadId]?.antiUndo
  ) {
    return;
  }

  const messageId = undoEvent.data.content.cliMsgId.toString();
  const originalMessage = getMessageCache()[messageId];

  if (!originalMessage || originalMessage.isUndo) return;

  const senderName = originalMessage.dName;
  const timestamp = formatTime(new Date());
  const baseContent = `👤 ${senderName} đã thu hồi tin nhắn sau...\n` +
    `⏰ Thời gian gửi: ${originalMessage.timestampString}\n` +
    `🔔 Thời gian thu hồi: ${timestamp}\n` +
    `📝 Nội Dung: `;

  try {
    const messageHandlers = {
      webchat: async () => {
        await sendBaseMessage(originalMessage.content.title || originalMessage.content);
      },

      "chat.photo": async () => {
        await sendBaseMessage("Ảnh...");
        
        const caption = originalMessage.content.title 
            ? `📝 Nội Dung: ${originalMessage.content.title}`
            : "";
        await api.sendImage(
          originalMessage.content.href,
          originalMessage,
          caption,
          TIME_SHOW_UNDO_MESSAGE
        );
      },

      "chat.gif": async () => {
        await sendBaseMessage("Gif...");
        await api.sendGif(originalMessage.content.href,
          originalMessage,
          originalMessage.content.title || "",
          TIME_SHOW_UNDO_MESSAGE);
      },

      "chat.video.msg": async () => {
        await sendBaseMessage("Video...");
        await api.sendVideo({
          videoUrl: originalMessage.content.href,
          thumbnail: originalMessage.content.thumb,
          threadId,
          threadType: originalMessage.type,
          message: { text: originalMessage.content.title || "" },
          ttl: TIME_SHOW_UNDO_MESSAGE,
        });
      },

      "chat.recommended": async () => {
        if (originalMessage.content.action === "recommened.link") {
          const params = JSON.parse(originalMessage.content.params);
          await sendBaseMessage("Link...");
          await api.sendMessageForward({
            msg: originalMessage.content.title,
            title: params.mediaTitle,
            src: params.src,
            link: originalMessage.content.href,
            desc: originalMessage.content.description,
            thumb: originalMessage.content.thumb
          }, threadId, originalMessage.type, TIME_SHOW_UNDO_MESSAGE);
        } else if (originalMessage.content.action === "recommened.user") {
          const description = JSON.parse(originalMessage.content.description);
          await sendBaseMessage();
          await api.sendBusinessCard(
            null,
            originalMessage.content.params,
            description.phone ? description.phone : null,
            originalMessage.type,
            threadId,
            TIME_SHOW_UNDO_MESSAGE
          );
        }
      },

      "chat.sticker": async () => {
        await sendBaseMessage("Sticker...");
        await api.sendSticker(
          {
            id: originalMessage.content.id,
            cateId: originalMessage.content.catId,
            type: originalMessage.content.type,
          },
          threadId,
          originalMessage.type,
          TIME_SHOW_UNDO_MESSAGE
        );
      },

      "chat.voice": async () => {
        await sendBaseMessage("Voice...");
        await api.sendVoice(
          { threadId, type: originalMessage.type },
          originalMessage.content.href,
          TIME_SHOW_UNDO_MESSAGE
        );
      },

      "share.file": async () => {
        const dataFile = JSON.parse(originalMessage.content.params);
        await sendBaseMessage("File...");
        await api.sendFile(originalMessage, originalMessage.content.href, TIME_SHOW_UNDO_MESSAGE, originalMessage.content.title || "", dataFile.fileSize, dataFile.fileExt, dataFile.checksum);
      },
    };

    async function sendBaseMessage(additionalContent = "") {
      return await api.sendMessageForward(
        {
          msg: baseContent + additionalContent,
        },
        threadId,
        originalMessage.type,
        TIME_SHOW_UNDO_MESSAGE
      );
    }

    originalMessage.isUndo = true;
    const handler = messageHandlers[originalMessage.msgType];
    if (handler) {
      await handler();
    }
  } catch (error) {
    console.error("Lỗi khi xử lý tin nhắn thu hồi:", error);
  }
}

export async function antiUndoGroup(api, undoEvent, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  undoQueue.push({ api, undoEvent, isAdminBox, groupSettings, botIsAdminBox, isSelf });
  processUndoQueue();
}
