import schedule from "node-schedule";
import { handleSettingGroupCommand } from "./group-manage.js";
import { getGroupInfoData } from "../../service-hahuyhoang/info-service/group-info.js";
import { readGroupSettings, writeGroupSettings } from "../../utils/io-json.js";
import { sendMessageCompleteRequest, sendMessageStateQuote, sendMessageWarning } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { removeMention } from "../../utils/format-util.js";
import { MultiMsgStyle, MessageStyle, MessageType } from "../../api-zalo/index.js";
import { nameServer } from "../../database/index.js";
import { getBotId } from "../../index.js";

export const COLOR_RED = "db342e";
export const COLOR_YELLOW = "f7b503";
export const COLOR_GREEN = "15a85f";
export const SIZE_18 = "18";
export const SIZE_16 = "14";
export const IS_BOLD = true;

// 🧠 Gọi định kỳ tự động mỗi phút
export function startAutoLockChatScheduler(api) {
  schedule.scheduleJob("*/1 * * * *", () => {
      checkAndApplyAutoLock(api);
  });
}

// 🕐 Hàm kiểm tra và áp dụng hành động khoá/mở
async function checkAndApplyAutoLock(api) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const senderId = getBotId();

  const groupSettings = readGroupSettings();
  const prefix = getGlobalPrefix();

  for (const threadId in groupSettings) {
    const group = groupSettings[threadId];
    const autoConfig = group.autoLockChat;
    if (!autoConfig) continue;

    const {
      startHour,
      startMinute = 0,
      startAction,
      endHour,
      endMinute = 0,
      endAction
    } = autoConfig;

    let actionToApply = null;

    if (currentHour === endHour && currentMinute === endMinute) {
      actionToApply = endAction;
    } else if (currentHour === startHour && currentMinute === startMinute) {
      actionToApply = startAction;
    }

    if (actionToApply) {
      const fakeMsg = {
        threadId,
        type: "GroupMessage",
        data: {
          content: `${prefix}settinggroup lockchat ${actionToApply}`,
          uidFrom: "auto-lock",
          dName: "Bot"
        }
      };

      try {
        const groupInfo = await getGroupInfoData(api, threadId);
        await handleSettingGroupCommand(api, fakeMsg, groupInfo, "setting");

        const actionText = actionToApply === "off" ? "Mở" : "Khoá";
        const senderName = nameServer;
        const title = `@${senderId}`;
        const body = `Đã thực hiện ${actionText} chat tự động theo yêu cầu\n✅✅✅`;

        const fullMessage = `${title}\n${senderName}\n${body}`;

        const style = MultiMsgStyle([
          MessageStyle(title.length + 1, senderName.length, COLOR_RED, SIZE_18, IS_BOLD)
        ]);

        await api.sendMessage(
          {
            msg: fullMessage,
            mentions: [{ pos: 0, uid: senderId, len: title.length }],
            style: style,
            ttl: 300000
          },
          threadId,
          MessageType.GroupMessage
        );

      } catch (sendErr) {
        console.error(`[AutoLock] Không gửi được tin nhắn xác nhận nhóm ${threadId}:`, sendErr.message);
      }
    }
  }
}
  // Xử lý lệnh cấu hình auto lock chat
  export async function handleAutoLockChatCommand(api, message, groupSettings, aliasCommand) {
    const prefix = getGlobalPrefix();
    const content = removeMention(message).replace(`${prefix}${aliasCommand}`, "").trim();
    const threadId = message.threadId;
  
    if (content.toLowerCase() === "off") {
      if (groupSettings[threadId]?.autoLockChat) {
        delete groupSettings[threadId].autoLockChat;
        writeGroupSettings(groupSettings);
        await sendMessageStateQuote(api, message, "❌ Đã tắt chức năng tự động khoá/mở nhóm!", false, 300000);
      } else {
        await sendMessageWarning(api, message, "⚠️ Chức năng chưa được thiết lập để tắt.");
      }
      return true;
    }
  
    if (content.toLowerCase() === "on") {
      const config = groupSettings[threadId]?.autoLockChat;
      if (!config) {
        await sendMessageWarning(api, message, "⚠️ Không có cấu hình auto lock nào để bật.");
        return false;
      }
  
      const { startHour, startMinute, startAction, endHour, endMinute, endAction } = config;
  
      const statusMsg =
`✅ Đã bật lại tự động đóng mở chat:\n- ⏰ ${startHour}:${String(startMinute).padStart(2, "0")} → ${startAction === "on" ? "🔒 Khoá" : "🔓 Mở"} chat\n` +
`- ⏰ ${endHour}:${String(endMinute).padStart(2, "0")} → ${endAction === "on" ? "🔒 Khoá" : "🔓 Mở"} chat`;
  
      await sendMessageCompleteRequest(api, message, { caption: statusMsg }, 300000);
      return true;
    }
  
    const [startPart, endPart] = content.split("|").map(s => s.trim());
    const [startRaw, startAction] = startPart.split(" ");
    const [endRaw, endAction] = endPart.split(" ");
  
    if (
      !/^\d{1,2}:\d{1,2}$/.test(startRaw) ||
      !/^\d{1,2}:\d{1,2}$/.test(endRaw) ||
      !["on", "off"].includes(startAction?.toLowerCase()) ||
      !["on", "off"].includes(endAction?.toLowerCase())
    ) {
      await sendMessageWarning(api, message, `Cú pháp không hợp lệ.\nVí dụ: ${prefix}${aliasCommand} 22:00 off|6:05 on`);
      return false;
    }
  
    const [startHour, startMinute] = startRaw.split(":" ).map(Number);
    const [endHour, endMinute] = endRaw.split(":" ).map(Number);
  
    if (!groupSettings[threadId]) groupSettings[threadId] = {};
    groupSettings[threadId].autoLockChat = {
      startHour,
      startMinute,
      startAction: startAction.toLowerCase(),
      endHour,
      endMinute,
      endAction: endAction.toLowerCase()
    };
  
    writeGroupSettings(groupSettings);
  
    const statusMsg =
`✅ Đã bật tự động đóng mở chat:\n- ⏰ ${startHour}:${String(startMinute).padStart(2, "0")} → ${startAction === "on" ? "🔒 Khoá" : "🔓 Mở"} chat\n` +
`- ⏰ ${endHour}:${String(endMinute).padStart(2, "0")} → ${endAction === "on" ? "🔒 Khoá" : "🔓 Mở"} chat`;
  
    await sendMessageCompleteRequest(api, message, { caption: statusMsg }, 300000);
    return true;
  }

