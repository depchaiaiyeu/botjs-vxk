import dns from 'node:dns';
import whois from 'whois-json';
import fetch from 'node-fetch';
import { removeMention } from "../../utils/format-util.js";
import { sendMessageWarningRequest, sendMessageCompleteRequest } from "../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../service.js";

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

export async function handleCheckHostCommand(api, message, aliasCommand) {
  try {
    const prefix = getGlobalPrefix();
    const inputRaw = removeMention(message).replace(`${prefix}${aliasCommand}`, "").trim();
    const input = inputRaw.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    if (!input) {
      await sendMessageWarningRequest(api, message, {
        caption: "Vui lòng nhập domain hoặc IP để kiểm tra.",
      }, 30000);
      return;
    }
    const isIP = IP_REGEX.test(input);
    let ip = input;
    let domain = null;
    let caption = "";

    if (!isIP) {
      domain = input;
      try {
        const result = await dns.promises.lookup(domain);
        ip = result.address;
      } catch {
        await sendMessageWarningRequest(api, message, {
          caption: `Không thể lấy IP từ domain: ${domain}`,
        }, 30000);
        return;
      }
    }
    // IP
    let ipInfo = null;
    try {
      const res = await fetch(`https://ipwho.is/${ip}`);
      ipInfo = await res.json();
      if (!ipInfo.success) throw new Error("API ipwho.is lỗi");
    } catch {
      ipInfo = null;
    }
    caption += `🔍 Kết quả kiểm tra ${isIP ? `IP: \`${ip}\`` : `Domain: \`${domain}\``}\n\n`;
    caption += `🌐 IP: ${ip || "Không xác định"}\n`;
    caption += `📍 Quốc gia: ${ipInfo?.country || "?"} (${ipInfo?.country_code || "?"})\n`;
    caption += `🏙️ Thành phố: ${ipInfo?.city || "?"}\n`;
    caption += `🌐 ISP: ${ipInfo?.connection?.isp || "?"}\n`;
    caption += `🏢 Tổ chức: ${ipInfo?.connection?.org || "?"}\n`;
    caption += `🕒 Múi giờ: ${ipInfo?.timezone?.id || "?"}\n`;

    await sendMessageCompleteRequest(api, message, { caption }, 600000);

  } catch (err) {
    console.error("❌ Lỗi:", err);
    await sendMessageWarningRequest(api, message, {
      caption: `❌ Đã xảy ra lỗi. Vui lòng thử lại.`,
    }, 30000);
  }
}
