import { sendMessageFromSQL, sendMessageFailed, sendMessageQuery } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";

export async function handleGetMessageCommand(api, message) {
  try {
    const quote = message.data?.quote || message.reply;
    if (!quote) {
      await sendMessageFailed(api, message, "Không có dữ liệu REPLY hoặc chưa reply tin nhắn cần lấy dữ liệu");
      return;
    }
    const senderNameOrigin = message.data.fromD || "[ Thông Tin Tin Nhắn ]";
    const senderId = quote.ownerId || quote.senderId || "Không rõ";
    const senderName = quote.fromD || "Không rõ";
    const cliMsgId = quote.cliMsgId || "Không rõ";
    const cliMsgType = quote.cliMsgType || "Không rõ";
    const ttl = quote.ttl || 0;
    const msgContent = quote.msg || "";
    let attachInfo = "Không có đính kèm";

    if (quote.attach) {
      try {
        let attachData = quote.attach;
        if (typeof attachData === 'string') {
          attachData = JSON.parse(attachData);
          if (attachData.params && typeof attachData.params === 'string') {
            attachData.params = JSON.parse(attachData.params.replace(/\\\\/g, '\\').replace(/\\\//g, '/'));
          }
        }
        attachInfo = JSON.stringify(attachData, null, 2);
      } catch (e) {
        attachInfo = quote.attach;
      }
    }

    const logMessage = `[ ${senderNameOrigin} ]

Người gửi: ${senderName}
ID Người Gửi: ${senderId}
cliMsgId: ${cliMsgId}
cliMsgType: ${cliMsgType}
Time to live: ${ttl}
Msg: ${msgContent}
Đính kèm: ${attachInfo}`;

    if (attachInfo === "Không có đính kèm") {
      await sendMessageFromSQL(api, message, { caption: logMessage }, 1800000);
    } else {
      await sendMessageFromSQL(api, message, { caption: logMessage }, 1800000);
    }
  } catch (error) {
    const errorMessage = `Đã xảy ra lỗi khi gửi log dữ liệu: ${error.message}`;
    await sendMessageFailed(api, message, errorMessage);
  }
}
