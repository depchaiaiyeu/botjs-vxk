import { MessageType } from "zlbotdqt";
import * as cv from "../../utils/canvas/index.js";
import { getUserInfoData } from "../../service-hahuyhoang/info-service/user-info.js";
import { sendMessageWarning } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import {
  writeCommandConfig,
  writeGroupSettings,
} from "../../utils/io-json.js";
import {
  sendMessageFromSQL,
  sendMessageInsufficientAuthority,
  sendMessageStateQuote,
} from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { getCommandConfig, isAdmin } from "../../index.js";
import { removeMention } from "../../utils/format-util.js";
import { managerData } from "./active-bot.js";

export async function handleKick(api, message, groupInfo) {
  const threadId = message.threadId;
  const groupName = groupInfo.name;
  const senderName = message.data.dName;

  if (!message.data.mentions || message.data.mentions.length === 0) {
    await sendMessageWarning(
      api,
      message,
      ":D Đại Ca muốn kick ai? 🚀",
      false
    );
    return;
  }

  const uids = [];
  const UserDataMentions = [];
  for (const mention of message.data.mentions) {
    if (isAdmin(mention.uid, threadId)) {
      await sendMessageWarning(
        api,
        message,
        "Đại Ca Không thể bảo em kick quản trị bot được 🚀",
        false
      );
      continue;
    }
    uids.push(mention.uid);
    try {
      const userInfo = await getUserInfoData(api, mention.uid);
      if (userInfo) {
        UserDataMentions.push(userInfo);
      }
    } catch (error) {
      console.error(
        ` Không lấy được thông tin cho người dùng ${mention.uid}:`,
        error
      );
    }
  }

  if (uids.length === 0) {
    return;
  }

  try {
    const result = await api.removeUserFromGroup(threadId, uids);
    if (result.errorMembers.length > 0) {
      await sendMessageWarning(
        api,
        message,
        "Đưa Em Key Vàng 🔑, Em Kick Cho Đại Ca Xem :D 🚀",
        false
      );
      return;
    }

    for (const userInfo of UserDataMentions) {
      let imagePath = null;
      try {
        imagePath = await cv.createKickImage(
          userInfo,
          groupName,
          groupInfo.type,
          userInfo.genderId,
          senderName
        );

        const kickMessage = {
          msg: "",
          attachments: imagePath ? [imagePath] : [],
        };

        await api.sendMessage(kickMessage, threadId, MessageType.GroupMessage);
      } catch (error) {
        console.error("Lỗi khi tạo và gửi ảnh kết quả:", error);
      } finally {
        await cv.clearImagePath(imagePath);
      }
    }
  } catch (error) {
    console.error("Chắc Chắn Là Đã Có Lỗi Gì Đó :D", error);
    await sendMessageWarning(
      api,
      message,
      "Đưa Em Key Vàng 🔑, Em Kick Cho Đại Ca Xem :D 🚀",
      false
    );
  }
}

export async function handleBlock(api, message, groupInfo) {
  const threadId = message.threadId;
  const groupName = groupInfo.name;
  const senderName = message.data.dName;

  if (!message.data.mentions || message.data.mentions.length === 0) {
    await sendMessageWarning(
      api,
      message,
      ":D Đại Ca muốn chặn ai? 🚀",
      false
    );
    return;
  }

  const uids = [];
  const UserDataMentions = [];
  for (const mention of message.data.mentions) {
    if (isAdmin(mention.uid, threadId)) {
      await sendMessageWarning(
        api,
        message,
        "Đại Ca Không thể bảo em block quản trị bot được 🚀",
        false
      );
      continue;
    }
    uids.push(mention.uid);
    try {
      const userInfo = await getUserInfoData(api, mention.uid);
      if (userInfo) {
        UserDataMentions.push(userInfo);
      }
    } catch (error) {
      console.error(
        `Không lấy thông tin cho người dùng ${mention.uid}:`,
        error
      );
    }
  }

  if (uids.length === 0) {
    return;
  }

  try {
    const result = await api.blockUsers(threadId, uids);
    if (result.errorMembers && result.errorMembers.length > 0) {
      await sendMessageWarning(
        api,
        message,
        "Đưa Em Key Vàng 🔑, Em Block Cho Đại Ca Xem :D 🚀",
        false
      );
      return;
    }

    for (const userInfo of UserDataMentions) {
      let imagePath = null;
      try {
        imagePath = await cv.createBlockImage(
          userInfo,
          groupName,
          groupInfo.type,
          userInfo.genderId,
          senderName
        );

        const blockMessage = {
          msg: "",
          attachments: imagePath ? [imagePath] : [],
        };

        await api.sendMessage(blockMessage, threadId, message.type);
      } catch (error) {
        console.error("Lỗi khi tạo và gửi ảnh kết quả:", error);
      } finally {
        await cv.clearImagePath(imagePath);
      }
    }
  } catch (error) {
    console.error("Chắc Chắn Là Đã Có Lỗi Gì Đó :D", error);
    await sendMessageWarning(
      api,
      message,
      "Đưa Em Key Vàng 🔑, Em Block Cho Đại Ca Xem :D 🚀",
      false
    );
  }
}

export async function handleKeyCommands(api, message, groupSettings, isAdminLevelHighest) {
  const content = removeMention(message);
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const prefix = getGlobalPrefix();

  if (!content.startsWith(`${prefix}keygold`) && !content.startsWith(`${prefix}keysilver`) && !content.startsWith(`${prefix}unkey`)) {
    return false;
  }

  const action = content.startsWith(`${prefix}keygold`) ? "gold" : content.startsWith(`${prefix}keysilver`) ? "silver" : "unkey";

  if (!isAdminLevelHighest) {
    const caption = "Chỉ có quản trị bot cấp cao mới được sử dụng lệnh này!";
    await sendMessageInsufficientAuthority(api, message, caption);
    return false;
  }

  const mentions = message.data.mentions;

  if (!mentions || mentions.length === 0) {
    await handleKeyAction(api, message, groupSettings, threadId, senderId, action, "Bạn");
  } else {
    for (const mention of mentions) {
      const targetId = mention.uid;
      const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");
      await handleKeyAction(api, message, groupSettings, threadId, targetId, action, targetName);
    }
  }

  writeGroupSettings(groupSettings);
  return true;
}

async function handleKeyAction(api, message, groupSettings, threadId, targetId, action, targetName) {
  switch (action) {
    case "gold":
      try {
        await api.changeGroupOwner(threadId, targetId);
        await sendMessageStateQuote(api, message, `Đã nhường key vàng cho ${targetName}.`, true, 300000);
      } catch (error) {
        await sendMessageStateQuote(api, message, `Không đủ quyền hạn để nhường key cho ${targetName}.`, false, 300000);
      }
      break;
    case "silver":
      try {
        await api.addGroupAdmins(threadId, targetId);
        await sendMessageStateQuote(api, message, `Đã phong key bạc cho ${targetName}.`, true, 300000);
      } catch (error) {
        await sendMessageStateQuote(api, message, `Không đủ quyền hạn để phong key bạc cho ${targetName}.`, false, 300000);
      }
      break;
    case "unkey":
      try {
        await api.removeGroupAdmins(threadId, targetId);
        await sendMessageStateQuote(api, message, `Đã xóa key của ${targetName}.`, true, 300000);
      } catch (error) {
        await sendMessageStateQuote(api, message, `${targetName} không có key để xóa.`, false, 300000);
      }
      break;
  }
}

/*
export async function handleBlock(api, message, groupInfo, groupSettings, aliasCommand) {
  console.log("🚀 [handleBlock] Bắt đầu xử lý lệnh");

  const prefix = getGlobalPrefix();
  const threadId = message.threadId;
  const senderName = message.data.dName;
  const senderId = message.data.uidFrom;

  const rawContent = message.data?.content || "";
  const content = rawContent.replace(`${prefix}${aliasCommand}`, "").trim();
  const args = content.split(/\s+/);
  const command = args[0]?.toLowerCase();

  console.log("📥 Raw Content:", JSON.stringify(rawContent));
  console.log("📤 Sau khi tách lệnh:", JSON.stringify(content));
  console.log("🧩 Command:", command);

  let uids = [];
  let UserDataMentions = [];

  const botId = message.botID || global.botID || null;

  if (command === "all") {
    console.log("✅ Nhận diện block all");

    let gridData = groupInfo?.gridInfoMap?.[threadId]?.memVerList;

    if (!Array.isArray(gridData)) {
      console.log("🔄 groupInfo không đầy đủ, đang gọi api.getGroupInfo(threadId)");
      try {
        const fetchedGroupInfo = await api.getGroupInfo(threadId);
        gridData = fetchedGroupInfo?.gridInfoMap?.[threadId]?.memVerList;
      } catch (err) {
        console.error("❌ Lỗi khi gọi api.getGroupInfo:", err);
        return;
      }
    }

    if (!Array.isArray(gridData)) {
      console.warn("❌ Không tìm thấy danh sách thành viên trong nhóm.");
      return;
    }

    const memberIds = gridData.map(id => id.split("_")[0]);

    for (const memberId of memberIds) {
      if (botId && memberId === botId) continue;
      if (await isAdmin(memberId, threadId)) continue;

      uids.push(memberId);
      try {
        const userInfo = await getUserInfoData(api, memberId);
        if (userInfo) UserDataMentions.push(userInfo);
      } catch (err) {
        console.error(`⚠️ Không thể lấy thông tin ${memberId}:`, err);
      }
    }

    console.log(`🎯 Tổng số UID sẽ bị block: ${uids.length}`);
    if (uids.length === 0) {
      console.log("⚠️ Không có ai để block.");
      return;
    }
  } else {
    console.log("🧾 Xử lý block theo mention");

    if (!message.data.mentions || message.data.mentions.length === 0) {
      await sendMessageWarning(api, message, ":D Sếp muốn chặn ai? 🚀", false);
      return;
    }

    for (const mention of message.data.mentions) {
      if (await isAdmin(mention.uid, threadId)) {
        await sendMessageWarning(api, message, "Sếp không thể bảo em block quản trị bot được 🚀", false);
        continue;
      }
      uids.push(mention.uid);
      try {
        const userInfo = await getUserInfoData(api, mention.uid);
        if (userInfo) UserDataMentions.push(userInfo);
      } catch (err) {
        console.error(`⚠️ Không thể lấy thông tin ${mention.uid}:`, err);
      }
    }

    if (uids.length === 0) return;
  }

  try {
    console.log("🔒 Đang gọi api.blockUsers:", uids);
    const result = await api.blockUsers(threadId, uids);
    if (result?.errorMembers?.length > 0) {
      console.warn("❗ Không thể block một số UID:", result.errorMembers);
      if (command !== "all") {
        await sendMessageWarning(api, message, "Đưa Em Key Vàng 🔑, Em Block Cho Sếp Xem :D 🚀", false);
      }
      return;
    }

    if (groupSettings?.[threadId]?.enableBlockImage === true) {
      for (const userInfo of UserDataMentions) {
        let imagePath = null;
        try {
          imagePath = await cv.createBlockImage(
            userInfo,
            groupInfo.name,
            groupInfo.type,
            userInfo.genderId,
            senderName
          );

          await api.sendMessage(
            { msg: "", attachments: [imagePath] },
            threadId,
            message.type
          );
        } catch (err) {
          console.error("❌ Lỗi khi tạo/gửi ảnh block:", err);
        } finally {
          await cv.clearImagePath(imagePath);
        }
      }
    }
  } catch (err) {
    console.error("❌ Lỗi khi gọi api.blockUsers:", err);
    if (command !== "all") {
      await sendMessageWarning(api, message, "Đưa Em Key Vàng 🔑, Em Block Cho Sếp Xem :D 🚀", false);
    }
  }
}
*/
export async function handleBlockBot(api, message, groupSettings) {
  const threadId = message.threadId;
  let listIdBlock = [];
  let messageContent = "";

  if (groupSettings) {
    const mentions = message.data.mentions;
    if (mentions && mentions.length > 0) {
      for (const mention of mentions) {
        const targetId = mention.uid;
        const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");
        if (!isAdmin(targetId)) {
          listIdBlock.push({ targetId, targetName });
        } else {
          messageContent += `🚨 Không thể block bot Quản Trị Cấp Cao: ${targetName}\n`;
        }
      }
    }
  } else {
    const userInfo = await getUserInfoData(api, threadId);
    if (!isAdmin(threadId)) {
      listIdBlock.push({ targetId: threadId, targetName: userInfo.name });
    } else {
      messageContent += `🚨 Không thể block bot Quản Trị Cấp Cao: ${userInfo.name}\n`;
    }
  }

  if (listIdBlock.length > 0) {
    const blockData = managerData.data;
    let blockedUsers = [];
    let alreadyBlockedUsers = [];

    if (!Array.isArray(blockData.blockBot)) {
      blockData.blockBot = [];
    }

    for (const item of listIdBlock) {
      const isBlocked = blockData.blockBot.some((blocked) => blocked.idUserZalo === item.targetId);

      if (isBlocked) {
        alreadyBlockedUsers.push(item.targetName);
      } else {
        blockData.blockBot.push({
          idUserZalo: item.targetId,
          senderName: item.targetName,
        });
        blockedUsers.push(item.targetName);
      }
    }
    if (blockedUsers.length > 0) {
      messageContent += `✅ Đã chặn tương tác bot đối với: ${blockedUsers.join(", ")}\n`;
    }
    if (alreadyBlockedUsers.length > 0) {
      messageContent += `❌ Những người đã bị chặn từ trước: ${alreadyBlockedUsers.join(", ")}`;
    }

    if (messageContent.trim() === "") {
      messageContent = "🚨 Không có mục tiêu để chặn, vui lòng đề cập thông qua @mention";
    }

    await api.sendMessage(
      {
        msg: messageContent.trim(),
        quote: message,
        ttl: 300000,
      },
      message.threadId,
      message.type
    );

    managerData.hasChanges = true;
  }
}

export async function handleUnblockBot(api, message, groupSettings) {
  const threadId = message.threadId;
  let listIdUnblock = [];

  if (groupSettings) {
    const mentions = message.data.mentions;
    if (mentions && mentions.length > 0) {
      for (const mention of mentions) {
        const targetId = mention.uid;
        const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");
        listIdUnblock.push({ targetId, targetName });
      }
    }
  } else {
    const userInfo = await getUserInfoData(api, threadId);
    listIdUnblock.push({ targetId: threadId, targetName: userInfo.name });
  }

  if (listIdUnblock.length > 0) {
    const blockData = managerData.data;
    let unblockUsers = [];
    let notBlockedUsers = [];

    for (const item of listIdUnblock) {
      const blockedUserIndex = blockData.blockBot.findIndex((blocked) => blocked.idUserZalo === item.targetId);

      if (blockedUserIndex !== -1) {
        blockData.blockBot.splice(blockedUserIndex, 1);
        unblockUsers.push(item.targetName);
      } else {
        notBlockedUsers.push(item.targetName);
      }
    }

    let messageContent = "";
    if (unblockUsers.length > 0) {
      messageContent += `✅ Đã bỏ chặn tương tác bot đối với: ${unblockUsers.join(", ")}\n`;
    }
    if (notBlockedUsers.length > 0) {
      messageContent += `❌ Các thành viên sau không bị chặn: ${notBlockedUsers.join(", ")}`;
    }

    if (messageContent.trim() === "") {
      messageContent = "🚨 Không có mục tiêu để bỏ chặn, vui lòng đề cập thông qua @mention";
    }

    await api.sendMessage(
      {
        msg: messageContent.trim(),
        quote: message,
        ttl: 300000,
      },
      message.threadId,
      message.type
    );

    managerData.hasChanges = true;
  }
}

export async function handleListBlockBot(api, message) {
  const blockData = managerData.data;
  const listBlockedUsers = blockData.blockBot.map((blocked) => blocked.senderName);
  if (listBlockedUsers.length === 0) {
    await api.sendMessage({ msg: `🚨 Không có ai bị chặn tương tác với bot`, ttl: 300000 }, message.threadId, message.type);
  } else {
    await api.sendMessage(
      {
        msg: `Danh sách người dùng đã bị chặn tương tác với bot:\n${listBlockedUsers
          .map((user, index) => `- ${index + 1}. ${user}`)
          .join("\n")}`,
        ttl: 300000,
      },
      message.threadId,
      message.type
    );
  }
}

export function isUserBlocked(senderId) {
  try {
    const blockData = managerData.data;
    if (!blockData || !blockData.blockBot) {
      return false;
    }

    return blockData.blockBot.some((blocked) => blocked.idUserZalo === senderId);
  } catch (error) {
    console.error("Lỗi khi kiểm tra trạng thái block:", error);
    return false;
  }
}

export async function handleSettingGroupCommand(api, message, groupInfo, aliasCommand) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const prefix = getGlobalPrefix();
  const args = content.slice(prefix.length).trim().split(/\s+/);

  args.shift();

  if (args.length < 1) {
    const result = {
      success: false,
      message: `Sử dụng: ${prefix}${aliasCommand} <loại config> <giá trị>` +
        `\n\n[Cài đặt Bật/Tắt] (on/off hoặc 1/0):` +
        `\n- lockchat: ${groupInfo.setting?.lockSendMsg ? "Tắt" : "Mở"} chat trong nhóm` +
        `\n- lockview: ${groupInfo.setting?.lockViewMember ? "Tắt" : "Mở"} xem thành viên trong nhóm` +
        `\n- history: ${groupInfo.setting?.enableMsgHistory ? "Mở" : "Tắt"} cho phép thành viên mới đọc tin nhắn gần nhất` +
        `\n- joinappr: ${groupInfo.setting?.joinAppr ? "Mở" : "Tắt"} chế độ phê duyệt thành viên` +
        `\n- showkey: ${groupInfo.setting?.signAdminMsg ? "Mở" : "Tắt"} hiển thị key quản trị` +
        `\n\n[Cài đặt Chuỗi]:` +
        `\n- name <tên mới>: Đổi tên nhóm`
    };
    await sendMessageFromSQL(api, message, result, false, 60000);
    return;
  }

  const settingType = args[0].toLowerCase();
  const value = args.slice(1).join(" ");

  // Xử lý các cài đặt chuỗi
  if (["name"].includes(settingType)) {
    if (!value) {
      await sendMessageStateQuote(api, message, `Vui lòng nhập giá trị cho cài đặt ${settingType}`, false, 60000);
      return;
    }

    try {
      switch (settingType) {
        case "name":
          await api.changeGroupName(threadId, value);
          await sendMessageStateQuote(api, message, `Đã đổi tên nhóm thành: ${value}`, true, 60000);
          break;
      }
      return;
    } catch (error) {
      console.error(`Lỗi khi thay đổi ${settingType}:`, error);
      await sendMessageStateQuote(api, message, `Không thể thay đổi ${settingType}: ${error.message}`, false, 60000);
      return;
    }
  }

  // Xử lý các cài đặt on/off
  if (!value || !["on", "off", "0", "1"].includes(value.toLowerCase())) {
    await sendMessageStateQuote(api, message, `Vui lòng chọn on/off hoặc 1/0 để thay đổi cài đặt`, false, 60000);
    return;
  }

  const newValue = ["on", "1"].includes(value.toLowerCase()) ? 1 : 0;
  const currentSettings = groupInfo.setting || {};

  try {
    switch (settingType) {
      case "lockchat":
        currentSettings.lockSendMsg = newValue;
        const status = newValue === 1 ? "tắt" : "mở";
        await updateGroupSetting(api, message, threadId, currentSettings, `Đã ${status} chat cho tất cả thành viên!`);
        break;

      case "lockview":
        currentSettings.lockViewMember = newValue;
        const memberStatus = newValue === 1 ? "tắt" : "mở";
        await updateGroupSetting(api, message, threadId, currentSettings, `Đã ${memberStatus} xem thành viên trong nhóm!`);
        break;

      case "history":
        currentSettings.enableMsgHistory = newValue;
        const historyStatus = newValue === 1 ? "mở" : "tắt";
        await updateGroupSetting(api, message, threadId, currentSettings, `Đã ${historyStatus} cho phép thành viên mới đọc tin nhắn gần nhất!`);
        break;

      case "joinappr":
        currentSettings.joinAppr = newValue;
        const joinApprStatus = newValue === 1 ? "mở" : "tắt";
        await updateGroupSetting(api, message, threadId, currentSettings, `Đã ${joinApprStatus} chế độ phê duyệt thành viên!`);
        break;

      case "showkey":
        currentSettings.signAdminMsg = newValue;
        const showKeyStatus = newValue === 1 ? "mở" : "tắt";
        await updateGroupSetting(api, message, threadId, currentSettings, `Đã ${showKeyStatus} hiển thị key quản trị!`);
        break;

      // Thêm các case khác ở đây trong tương lai
      // case "setting_name":
      //   currentSettings.settingKey = newValue;
      //   await updateGroupSetting(...);
      //   break;

      default:
        await sendMessageStateQuote(api, message, `Loại cài đặt '${settingType}' không hợp lệ!`, false, 60000);
        break;
    }
  } catch (error) {
    console.error("Lỗi khi thay đổi cài đặt nhóm:", error);
    await sendMessageStateQuote(api, message, `Không thể thay đổi cài đặt nhóm: ${error.message}`, false, 60000);
  }
}

async function updateGroupSetting(api, message, threadId, settings, successMessage) {
  await api.changeGroupSetting(threadId, settings);
  await sendMessageStateQuote(api, message, successMessage, true, 60000);
}
