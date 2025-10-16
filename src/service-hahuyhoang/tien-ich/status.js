import path from "path";
import { createCustomCanvas } from "./canvas/custom-canvas.js";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import fsp from "fs/promises";

// Author :  Hà Huy Hoàng
// Description: Pexels Image code by Hà Huy Hoàng

export async function handleCustomCanvasCommand(api, message) {
  const threadId = message.threadId;
  const senderId = message.data?.uidFrom;
  const senderName = message.data?.dName || "Người dùng";
  const content = message.data?.content?.trim();
  const quote = message.data?.quote;
  let textInput;
  if (quote && quote.msg) {
    textInput = quote.msg;
  } else if (content && content.split(" ").length >= 2) {
    textInput = content.split(" ").slice(1).join(" ");
  } else {
    await sendMessageStateQuote(
      api,
      message,
      "Vui lòng nhập nội dung sau lệnh hoặc reply tin nhắn chứa nội dung muốn tạo!",
      false,
      30000
    );
    return;
  }

  if (textInput.split(" ").length > 2000) {
    await sendMessageStateQuote(
      api,
      message,
      "Sếp tao giới hạn rồi 2000 từ thôi cu!",
      false,
      30000
    );
    return;
  }

  try {
    const userData = await getUserData(api, senderId);
    if (!userData) {
      await sendMessageStateQuote(
        api,
        message,
        "Không thể lấy thông tin người dùng!",
        false,
        30000
      );
      return;
    }

    const outputPath = await createCustomCanvas(
      userData.zaloName,
      userData.cover,
      userData.avatar,
      textInput
    );

    await api.sendMessage(
      {
        msg: `Status của bạn đã được tạo!`,
        attachments: [outputPath],
        ttl: 5000000,
      },
      threadId,
      message.type
    );

    await fsp.unlink(outputPath).catch(() => {});
  } catch (error) {
    console.error("Lỗi khi xử lý canvas:", error.message);
    await sendMessageStateQuote(api, message, "Lỗi khi tạo canvas!", false, 30000);
  }
}

async function getUserData(api, userId) {
  try {
    const userInfoResponse = await api.getUserInfo(userId);
    const userData = userInfoResponse?.changed_profiles?.[userId];
    if (!userData) return null;

    return {
      zaloName: userData.zaloName,
      cover: userData.cover || null,
      avatar: userData.avatar || null,
    };
  } catch (err) {
    console.error("Lỗi khi lấy thông tin user:", err);
    return null;
  }
}