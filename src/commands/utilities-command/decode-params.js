import fetch from "node-fetch";
import { sendMessageFromSQL } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { decodeAES } from "../../api-zalo/utils.js";
import { appContext } from "../../api-zalo/context.js";

export async function handleEncodeParamsCommand(api, message) {
  const threadId = message.threadId;
  const rawContent = message?.data?.content;
  const content = (rawContent || "").toString().trim();
  const currentPrefix = getGlobalPrefix();
  if (!content.startsWith(`${currentPrefix}decode`)) return false;
  const args = content.slice(currentPrefix.length + "decode".length).trim();
  if (!args) return sendMessageFromSQL(api, threadId, `Vui lòng nhập params cần decode.\nVí dụ: ${currentPrefix}decode <chuỗi>`);
  const secretKey = appContext?.secretKey;
  if (!secretKey) return sendMessageFromSQL(api, threadId, `Không có secretKey để giải mã. Vui lòng đảm bảo bot đã khởi tạo appContext.secretKey.`);
  try {
    const result = decodeAES(secretKey, args);
    await sendMessageFromSQL(api, threadId, `🔍 Kết quả decode:\n${result}`);
  } catch (err) {
    await sendMessageFromSQL(api, threadId, `Không thể decode params.\nLỗi: ${err?.message || err}`);
  }
}
