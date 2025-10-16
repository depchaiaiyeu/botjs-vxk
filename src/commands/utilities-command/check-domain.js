import fetch from "node-fetch";
import {
  sendMessageFromSQL,
  sendMessageFromSQLImage,
  sendMessageImageNotQuote,
} from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";

export async function handleCheckDomainCommand(api, message) {
  const threadId = message.threadId;
  const uid = message.data.uidFrom;
  const rawContent = message?.data?.content;
  const content = (rawContent || "").toString().trim();
  const currentPrefix = getGlobalPrefix();
  if (!content.startsWith(`${currentPrefix}checkdomain`)) return false;
  const args = content.slice(currentPrefix.length + "checkdomain".length).trim();
  const parts = args.split(/\s+/);
  let domain = parts[0] || "";
  domain = domain.replace(/[^a-zA-Z0-9.-]/g, "").toLowerCase();
  if (!domain) {
    return sendMessageFromSQL(api, threadId, `Vui lòng nhập tên miền.\nCú pháp: ${currentPrefix}checkdomain <domain>`);
  }
  const isDotVN = domain.endsWith(".vn");
  const apiUrl = `https://whois.inet.vn/api/whois/domainspecify/${encodeURIComponent(domain)}`;
  try {
    const res = await fetch(apiUrl);
    const data = await res.json();
    if (data?.code === "1" || data.message?.toLowerCase().includes("does not exist")) {
      const fee = data.fee || "Không rõ";
      const reg = data.reg || "Không rõ";
      const ren = data.ren || "Không rõ";
      const registrar = data.registrar || "Không rõ";
      const feeMsg =
        `🔍 Thông Tin Tên Miền: ${domain}\n` +
        `⚠️ Tên miền chưa được đăng ký.\n\n` +
        `💰 Phí đăng ký: ${reg.toLocaleString()}đ\n` +
        `♻️ Phí gia hạn: ${ren.toLocaleString()}đ\n` +
        `🛒 Tổng giá (năm đầu): ${fee.toLocaleString()}đ\n` +
        `🔗 Đăng ký tại: ${registrar}`;
      return await sendMessageFromSQL(api, threadId, feeMsg);
    }
    if (data?.code !== "0") throw new Error(data.message || "Không thể lấy thông tin domain.");
    const nameServers = Array.isArray(data.nameServer) ? `[ ${data.nameServer.join(", ")} ]` : "Không rõ";
    const status = Array.isArray(data.status) ? `[ ${data.status.join(", ")} ]` : "Không rõ";
    const msg =
      `🔍 Thông Tin Tên Miền: ${data.domainName || domain}\n` +
      `👤 Người Đăng Ký: ${isDotVN ? data.registrantName || "Không công khai" : "Không rõ"}\n` +
      `🏢 Đơn Vị Đăng Ký: ${data.registrar || "Không rõ"}\n` +
      `📅 Ngày Đăng Ký: ${data.creationDate || "Không rõ"}\n` +
      `📅 Ngày Hết Hạn: ${data.expirationDate || "Không rõ"}\n` +
      `🔐 DNSSEC: ${data.DNSSEC || "Không rõ"}\n` +
      `🖥️ Tên Máy Chủ: ${nameServers}\n` +
      `⚙️ Trạng Thái: ${status}\n` +
      `✅✅✅`;
    await sendMessageFromSQL(api, threadId, msg);
  } catch (err) {
    await sendMessageFromSQL(api, threadId, `Không thể tra cứu tên miền "${domain}".\nLỗi: ${err.message}`);
  }
}
