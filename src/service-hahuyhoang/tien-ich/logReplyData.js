import { sendMessageCompleteRequest, sendMessageFailed } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
export async function logReply(api, message) {
  try {
    const quote = message.data?.quote || message.reply;

    if (!quote) {
      await sendMessageFailed(api, message, "Không có dữ liệu REPLY hoặc chưa reply tin nhắn cần lấy dữ liệu");
      return;
    }
    if (quote.attach) {
      quote.attach = JSON.parse(quote.attach);
      if (quote.attach.params) {
        quote.attach.params = JSON.parse(quote.attach.params.replace(/\\\\/g, '\\').replace(/\\\//g, '/'));
      }
    }
    const logMessage = `📡 Dữ liệu tin nhắn được reply:\n\n${JSON.stringify(quote, null, 2)}`;
    await sendMessageCompleteRequest(api, message, { caption: logMessage }, 1800000);
  } catch (error) {
    const errorMessage = `Đã xảy ra lỗi khi gửi log dữ liệu: ${error.message}`;
    await sendMessageFailed(api, message, errorMessage);
  }
}
