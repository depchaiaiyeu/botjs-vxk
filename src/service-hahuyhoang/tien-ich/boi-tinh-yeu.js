import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { MultiMsgStyle, MessageStyle } from "../../api-zalo/index.js";

export const COLOR_GREEN = "15a85f";
export const SIZE_16 = "12";
export const IS_BOLD = true;

async function getFormBuildId() {
  const url = "https://vansu.net/boi-tinh-yeu-theo-ten.html";
  try {
    const response = await fetch(url, { method: "GET", headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36" } });
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const formBuildId = document.querySelector("input[name='form_build_id']").value;
    return formBuildId;
  } catch (error) {
    console.error("Lỗi khi lấy form_build_id:", error.message);
    throw new Error("Không thể lấy form_build_id");
  }
}

async function getBoiTinhYeuResult(kieuboi, tenNam, tenNu, formBuildId) {
  const url = "https://vansu.net/system/ajax";
  
  const payload = new URLSearchParams();
  payload.append("kieuboi", kieuboi);
  payload.append("nam", tenNam);
  payload.append("nu", tenNu);
  payload.append("form_build_id", formBuildId);
  payload.append("form_id", "chucnang_boi_tinh_yeu_form");
  payload.append("_triggering_element_name", "op");
  payload.append("_triggering_element_value", "Xem kết quả");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json, text/javascript, */*; q=0.01",
      },
      body: payload,
    });

    const data = await response.json();
    const dataHtml = data[1].data;

    const lovePercentageMatch = dataHtml.match(/(\d+)%/);
    const lovePercentage = lovePercentageMatch ? lovePercentageMatch[1] : "Không xác định";

    const messageMatch = dataHtml.match(/<p>(.*?)<\/p>/);
    let messageText = messageMatch ? messageMatch[1] : "Không có lời giải thích";

    messageText = messageText.replace(/[.,]/g, (match) => match + "\n");

    return { lovePercentage, messageText };
  } catch (error) {
    console.error("Lỗi khi gửi yêu cầu bói tình yêu:", error.message);
    throw new Error("Lỗi khi gửi yêu cầu bói tình yêu");
  }
}

async function sendResultMessage(api, message, result) {
  const threadId = message.threadId;
  const senderId = message.data?.uidFrom;
  const senderName = message.data?.dName || "Người dùng";
  
  const styledMessage = MultiMsgStyle([MessageStyle(senderName.length + 1, result.length, COLOR_GREEN, SIZE_16, IS_BOLD)]);
  
  await api.sendMessage(
    {
      msg: `@${senderName}\n${result}`,
      mentions: [{ uid: senderId, pos: 0, len: senderName.length + 1 }],
      style: styledMessage,
      ttl: 3000000,
    },
    threadId,
    message.type
  );
}

async function handleDuyenPhan(api, message, tenNam, tenNu, formBuildId) {
  const { lovePercentage, messageText } = await getBoiTinhYeuResult("duyenphan", tenNam, tenNu, formBuildId);
  
  const result = `
✨ Kết quả bói Duyên Phận:\n
❤️ Tỷ lệ hợp: ${lovePercentage}%
💬 Lời giải thích:\n ${messageText}\n
  `;
  
  await sendResultMessage(api, message, result);
}

async function handleTuongLai(api, message, tenNam, tenNu, formBuildId) {
  const { lovePercentage, messageText } = await getBoiTinhYeuResult("tuonglai", tenNam, tenNu, formBuildId);
  
  const result = `
✨ Kết quả bói Tương Lai :\n
❤️ Tỷ lệ hợp: ${lovePercentage}%\n
💬 Lời giải thích: \n${messageText}
  `;
  
  await sendResultMessage(api, message, result);
}

async function handleTamDauYhop(api, message, tenNam, tenNu, formBuildId) {
  const { lovePercentage, messageText } = await getBoiTinhYeuResult("tamdauyhop", tenNam, tenNu, formBuildId);
  
  const result = `
✨ Kết quả bói Tâm Đầu Ý Hợp:\n
❤️ Tỷ lệ hợp: ${lovePercentage}%\n
💬 Giải thích:\n ${messageText}
  `;
  
  await sendResultMessage(api, message, result);
}

export async function duyenphan(api, message) {
  const content = message.data?.content?.trim();
  
  if (!content || content.split(" ").length < 2) {
    await sendMessageStateQuote(api, message, "Vui lòng nhập tên nam và nữ sau lệnh, ví dụ: 'duyenphan Tên Nam|Tên Nữ'", false, 30000);
    return;
  }

  const args = content.split(" ");
  const names = args[1].split("|");
  if (names.length !== 2) {
    await sendMessageStateQuote(api, message, "Vui lòng nhập đúng định dạng tên, ví dụ: 'duyenphan Tên Nam|Tên Nữ'", false, 30000);
    return;
  }

  const tenNam = names[0];
  const tenNu = names[1];
  const formBuildId = await getFormBuildId();

  await handleDuyenPhan(api, message, tenNam, tenNu, formBuildId);
}

export async function tuonglai(api, message) {
  const content = message.data?.content?.trim();
  
  if (!content || content.split(" ").length < 2) {
    await sendMessageStateQuote(api, message, "Vui lòng nhập tên nam và nữ sau lệnh, ví dụ: 'tuonglai Tên Nam|Tên Nữ'", false, 30000);
    return;
  }

  const args = content.split(" ");
  const names = args[1].split("|");
  if (names.length !== 2) {
    await sendMessageStateQuote(api, message, "Vui lòng nhập đúng định dạng tên, ví dụ: 'tuonglai Nam|Ten Nữ'", false, 30000);
    return;
  }

  const tenNam = names[0];
  const tenNu = names[1];
  const formBuildId = await getFormBuildId();

  await handleTuongLai(api, message, tenNam, tenNu, formBuildId);
}

export async function tamdauyhop(api, message) {
  const content = message.data?.content?.trim();
  
  if (!content || content.split(" ").length < 2) {
    await sendMessageStateQuote(api, message, "Vui lòng nhập tên nam và nữ sau lệnh, ví dụ: tuonglai Tên Nam|Tên Nữ", false, 30000);
    return;
  }

  const args = content.split(" ");
  const names = args[1].split("|");
  if (names.length !== 2) {
    await sendMessageStateQuote(api, message, "Vui lòng nhập đúng định dạng tên, ví dụ: tuonglai Tên Nam|Tên Nữ", false, 30000);
    return;
  }

  const tenNam = names[0];
  const tenNu = names[1];
  const formBuildId = await getFormBuildId();

  await handleTamDauYhop(api, message, tenNam, tenNu, formBuildId);
}
