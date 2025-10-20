import { getBotId, isAdmin } from "../../index.js";
import { sendMessageStateQuote } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { removeMention } from "../../utils/format-util.js";

export async function handleDeleteMessage(api, message, groupAdmins, aliasCommand) {
  const content = removeMention(message);
  const prefixGlobal = getGlobalPrefix(message);
  const keyContent = content.replace(`${prefixGlobal}${aliasCommand}`, "").trim();
  const [count, target = "normal"] = keyContent.split(" ");
  const idBot = getBotId();
  let countDelete = 0;
  let countDeleteFail = 0;

  if (count <= 0) {
    await sendMessageStateQuote(api, message, "Vui lòng nhập phạm vi số lượng tin nhắn cần check", false, 60000);
    return;
  }

  const recentMessage = await getRecentMessage(api, message, count);
  let mentionTarget = [];
  if (message.data.mentions) {
    for (const mention of message.data.mentions) {
      if (!isAdmin(mention.uid)) {
        mentionTarget.push(mention.uid);
      }
    }
  }

  const deletePromises = recentMessage
    .filter(msg => 
      target === "all" ||
      mentionTarget.includes(msg.uidFrom) || 
      (mentionTarget.includes(idBot) && msg.uidFrom === "0")
    )
    .map(msg => {
      const msgDel = {
        type: message.type,
        threadId: message.threadId,
        data: {
          cliMsgId: msg.cliMsgId,
          msgId: msg.msgId,
          uidFrom: msg.uidFrom === "0" ? idBot : msg.uidFrom,
        },
      };
      
      return api.deleteMessage(msgDel, false)
        .then(() => {
          countDelete++;
          return true;
        })
        .catch(error => {
          countDeleteFail++;
          return false;
        });
    });

  await Promise.all(deletePromises);

  const caption = `${countDelete > 0 ? `Xóa thành công ${countDelete} tin nhắn` : "Không có tin nhắn nào được xóa"}` +
    `${countDeleteFail > 0 ? `\nCó ${countDeleteFail} tin nhắn không xóa được` : ""}`;
  await sendMessageStateQuote(api, message, caption, true, 60000);
}

export async function getRecentMessage(api, message, count = 50) {
  const threadId = message.threadId || message.idTo;
  const globalMsgId = message.data.msgId || message.msgId;
  let allMessages = [];
  let currentMsgId = globalMsgId;

  try {
    while (allMessages.length < count) {
      const recentMessage = await api.getRecentMessages(threadId, currentMsgId, 50);
      const parsedMessage = JSON.parse(recentMessage);
      const messages = parsedMessage.groupMsgs;

      if (!messages || messages.length === 0) {
        break;
      }

      allMessages = [...allMessages, ...messages.sort((a, b) => b.ts - a.ts)];
      currentMsgId = messages[messages.length - 1].msgId;
    }
  } catch (error) {
    console.log(error);
  }

  const sortedMessages = allMessages.sort((a, b) => b.ts - a.ts);
  return sortedMessages.slice(0, count);
}

export async function handleAdminReactionDelete(api, reaction) {
  const adminId = reaction.data.uidFrom;
  const rType = reaction.data.content.rType;
  
  // Kiểm tra xem người reaction có phải admin và reaction type là 3 hoặc 5
  if (!isAdmin(adminId) || (rType !== 3 && rType !== 5)) {
    return false;
  }

  try {
    // Lấy thông tin tin nhắn được reaction từ rMsg[0]
    const rMsg = reaction.data.content.rMsg[0];
    const msgId = rMsg.gMsgID.toString();
    const cliMsgId = rMsg.cliMsgID?.toString();
    const threadId = reaction.data.threadId || reaction.data.idTo;

    // Tạo object để xóa tin nhắn được reaction
    const msgToDelete = {
      type: reaction.type,
      threadId: threadId,
      data: {
        msgId: msgId,
        cliMsgId: cliMsgId,
        uidFrom: rMsg.uidFrom,
      },
    };

    // Xóa tin nhắn được reaction
    await api.deleteMessage(msgToDelete, false);

    console.log(`Admin ${adminId} đã xóa tin nhắn ID: ${msgId}`);
    return true;
  } catch (error) {
    console.log(`Lỗi khi xóa tin nhắn từ admin reaction:`, error);
    return false;
  }
}
