import { sendMessageFromSQL, sendMessageFailed, sendMessageQuery } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";

export async function handleGetMessageCommand(api, message) {
  try {
    const quote = message.data?.quote || message.reply;
    
    if (!quote) {
      await sendMessageQuery(api, message, "Reply tin nhắn cần lấy thông tin! 🤔");
      return;
    }

    console.log("Quote object:", JSON.stringify(quote, null, 2));


    if (quote.attach && typeof quote.attach === 'string') {
      try {
        quote.attach = JSON.parse(quote.attach);
        if (quote.attach?.params && typeof quote.attach.params === 'string') {
          quote.attach.params = JSON.parse(
            quote.attach.params.replace(/\\\\/g, "\\").replace(/\\\//g, "/")
          );
        }
      } catch (parseError) {
        console.error("Lỗi parse JSON attach:", parseError);
        quote.attach = null;
      }
    }

    const sender = quote.sender || quote.fromD || quote.from || "Không rõ";
    const senderId = quote.senderId || quote.ownerId || quote.uid || "Không rõ";
    const msgId = quote.msgId || quote.cliMsgId || quote.id || "Không rõ";
    const msgType = quote.type || quote.cliMsgType || quote.msgType || "Không rõ";
    const ttl = quote.ttl || "Không rõ";
    const msg = quote.msg || quote.text || quote.message || "Không có";
    const attach = quote.attach && Object.keys(quote.attach).length > 0 
      ? JSON.stringify(quote.attach, null, 2) 
      : "Không có đính kèm";

    const logMessage = `Người gửi: ${sender}\nID Người Gửi: ${senderId}\nMsg ID: ${msgId}\nMsg Type: ${msgType}\nTime to live: ${ttl}\nMsg: ${msg}\nĐính kèm: ${attach}`;
    
    await sendMessageFromSQL(api, message, { caption: logMessage }, 1800000);
  } catch (error) {
    console.error("Chi tiết lỗi:", error);
    const errorMessage = `Đã xảy ra lỗi khi gửi log dữ liệu: ${error.message || error}`;
    await sendMessageFailed(api, message, errorMessage);
  }
}
