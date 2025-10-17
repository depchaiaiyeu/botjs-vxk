import { sendMessageFromSQL, sendMessageFailed, sendMessageQuery } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";

export async function handleGetMessageCommand(api, message) {
  try {
    const quote = message.data?.quote || message.reply;
    if (!quote) {
      await sendMessageQuery(api, message, "Reply tin nhắn cần lấy thông tin! 🤔");
      return;
    }
    if (quote.attach) {
      quote.attach = JSON.parse(quote.attach);
      if (quote.attach.params) {
        quote.attach.params = JSON.parse(quote.attach.params.replace(/\\\\/g, "\\").replace(/\\\//g, "/"));
      }
    }
    const fromD = quote.fromD;
    const ownerId = quote.ownerId;
    const cliMsgId = quote.cliMsgId;
    const cliMsgType = quote.cliMsgType;
    const ttl = quote.ttl;
    const msg = quote.msg || "Không có";
    const attach = quote.attach && Object.keys(quote.attach).length > 0 ? JSON.stringify(quote.attach, null, 2) : "Không có đính kèm";
    const logMessage = `Người gửi: ${fromD}\nID Người Gửi: ${ownerId}\ncliMsgId: ${cliMsgId}\ncliMsgType: ${cliMsgType}\nTime to live: ${ttl}\nMsg: ${msg}\nĐính kèm: ${attach}`;
    await sendMessageFromSQL(api, message, { caption: logMessage }, 1800000);
  } catch (error) {
    const errorMessage = `Đã xảy ra lỗi khi gửi log dữ liệu: ${error.message}`;
    await sendMessageFailed(api, message, errorMessage);
  }
}
