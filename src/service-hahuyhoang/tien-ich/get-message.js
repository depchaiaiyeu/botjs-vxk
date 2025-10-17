import { sendMessageFromSQL, sendMessageFailed, sendMessageQuery } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";

export async function handleGetMessageCommand(api, message) {
  try {
    const quote = message.data?.quote || message.reply;
    if (!quote) {
      await sendMessageQuery(api, message, "Reply tin nhắn cần lấy dữ liệu! 🤔");
      return;
    }

    const senderId = quote.ownerId || quote.senderId || "Không rõ";
    const senderName = quote.fromD || "Không rõ";
    const cliMsgId = quote.cliMsgId || "Không rõ";
    const cliMsgType = quote.cliMsgType || "Không rõ";
    const ttl = quote.ttl || 0;
    const msgContent = quote.msg || "";
    let attachInfo = "Không có đính kèm";

    if (quote.attach && quote.attach !== "") {
      try {
        let attachData = quote.attach;
        if (typeof attachData === "string") {
          attachData = JSON.parse(attachData);
          if (attachData.params && typeof attachData.params === "string") {
            attachData.params = JSON.parse(
              attachData.params.replace(/\\\\/g, "\\").replace(/\\\//g, "/")
            );
          }
        }
        attachInfo = JSON.stringify(attachData, null, 2);
      } catch (e) {
        attachInfo = quote.attach;
      }
    }

    const logMessage = `[ Thông Tin Tin Nhắn ]

Người gửi: ${senderName}
ID Người Gửi: ${senderId}
cliMsgId: ${cliMsgId}
cliMsgType: ${cliMsgType}
Time to live: ${ttl}
Msg: ${msgContent}
Đính kèm: ${attachInfo}`;

    await sendMessageFromSQL(api, message, { message: logMessage, success: true }, true, 1800000);
  } catch (error) {
    console.error("Error in handleGetMessageCommand:", error);
    await sendMessageFailed(api, message, `Đã xảy ra lỗi khi xử lý: ${error.message || error}`);
  }
}
