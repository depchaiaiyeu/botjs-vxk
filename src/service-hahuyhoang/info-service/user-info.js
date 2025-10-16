import * as cv from "../../utils/canvas/index.js";
import { removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../service.js";

export async function userInfoCommand(api, message, aliasCommand) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  let content = removeMention(message);
  const prefix = getGlobalPrefix();
  content = content.replace(`${prefix}${aliasCommand}`, "").trim();

  const isLogMode = content.endsWith("text");
  let imagePath = null;

  try {
    let targetUserId = senderId; // mặc định

    const cleanedContent = content.replace("log", "").trim();
    
    if (message.data.mentions?.[0]?.uid) {
      targetUserId = message.data.mentions[0].uid;
    } else if (cleanedContent === "-f" && message.data.idTo) {
      targetUserId = message.data.idTo;
    } else if (/^\d{10,20}$/.test(cleanedContent)) {
      targetUserId = cleanedContent; // truyền UID trực tiếp
    }

    const userInfo = await getUserInfoData(api, targetUserId);
    if (!userInfo) {
      await sendErrorMessage(api, message, threadId, "❌ Không thể lấy thông tin người dùng này.");
      return;
    }

    if (isLogMode) {
      const logMessage =
        `📄 ${userInfo.title}\n\n` +
        `👤 Tên: ${userInfo.name}\n` +
        `🆔 UID: ${userInfo.uid}\n` +
        `📸 Avatar: ${userInfo.avatar}\n` +
        `🖼️ Ảnh bìa: ${userInfo.cover}\n` +
        `👥 Giới tính: ${userInfo.gender} (${userInfo.genderId})\n` +
        `🎂 Sinh nhật: ${userInfo.birthday}\n` +
        `📞 Số điện thoại: ${userInfo.phone}\n` +
        `📝 Bio: ${userInfo.bio}\n` +
        `💬 Username: ${userInfo.username || "Không có"}\n` +
        `✅ Tài khoản xác thực: ${userInfo.isValid ? "Có" : "Không"}\n` +
        `🕘 Online: ${userInfo.isOnline ? "🟢 Đang hoạt động" : "⚪️ Offline"}\n` +
        `   ┗ PC: ${userInfo.isActivePC ? "🟢" : "⚪️"} | Web: ${userInfo.isActiveWeb ? "🟢" : "⚪️"}\n` +
        `📅 Tạo lúc: ${userInfo.createdDate}\n` +
        `🕗 Lần hoạt động gần nhất: ${userInfo.lastActive}\n` +
        `🏢 Doanh nghiệp: ${userInfo.businessAccount} (${userInfo.businessType})\n` +
        `📦 Gói doanh nghiệp: ${userInfo.bizPkg?.label || "Không có"} (ID: ${userInfo.bizPkg?.pkgId || "N/A"})\n` +
        `\n${userInfo.footer}`;
    
        await api.sendMessage({
          msg: logMessage,
          ttl: 360000,
          clientId: Math.floor(Date.now() / 1000) * 60
        }, threadId, message.type);

    } else {
      imagePath = await cv.createUserInfoImage(userInfo);
      await api.sendMessage(
        { msg: "", attachments: [imagePath], ttl: 360000 },
        threadId,
        message.type
      );
    }

  } catch (error) {
    console.error("Lỗi khi lấy thông tin người dùng:", error);
    await sendErrorMessage(
      api,
      message,
      threadId,
      "❌ Đã xảy ra lỗi khi lấy thông tin người dùng. Vui lòng thử lại sau."
    );
  } finally {
    if (imagePath) {
      await cv.clearImagePath(imagePath);
    }
  }
}
export async function getUserInfoData(api, userId) {
  const userInfoResponse = await api.getUserInfo(userId);
  const userInfo = userInfoResponse.unchanged_profiles?.[userId] || userInfoResponse.changed_profiles?.[userId];
  return getAllInfoUser(userInfo);
}

function getAllInfoUser(userInfo) {
  const currentTime = Date.now();
  const lastActionTime = userInfo.lastActionTime || 0;
  const isOnline = currentTime - lastActionTime <= 300000;

  return {
    title: "Thông Tin Người Dùng",
    uid: userInfo.userId || "Không xác định",
    name: formatName(userInfo.zaloName),
    avatar: userInfo.avatar,
    cover: userInfo.cover,
    gender: formatGender(userInfo.gender),
    genderId: userInfo.gender,
    businessAccount: userInfo.bizPkg?.label ? "Có" : "Không",
    businessType: getTextTypeBusiness(userInfo.bizPkg.pkgId),
    isActive: userInfo.isActive,
    isActivePC: userInfo.isActivePC,
    isActiveWeb: userInfo.isActiveWeb,
    isValid: userInfo.isValid,
    username: userInfo.username,
    bizPkg: userInfo.bizPkg,
    birthday: formatDate(userInfo.dob || userInfo.sdob) || "Ẩn",
    phone: userInfo.phone || "Ẩn",
    lastActive: formatTimestamp(userInfo.lastActionTime),
    createdDate: formatTimestamp(userInfo.createdTs),
    bio: userInfo.status || "Không có thông tin bio",
    isOnline: isOnline,
    footer: `${randomEmoji()} Chúc bạn một ngày tốt lành!`,
  };
}

function randomEmoji() {
  const emojis = ["😊", "🌟", "🎉", "🌈", "🌺", "🍀", "🌞", "🌸"];
  return emojis[Math.floor(Math.random() * emojis.length)];
}

function formatName(name) {
  return name.length > 30 ? name.slice(0, 27) + "..." : name;
}

function formatGender(gender) {
  return gender === 0 ? "Nam 👨" : gender === 1 ? "Nữ 👩" : "Không xác định 🤖";
}

function getTextTypeBusiness(type) {
  return type === 1 ? "Basic" : type === 3 ? "Pro" : type === 2 ? "Không xác định" : "Chưa Đăng Ký";
}

function formatTimestamp(timestamp) {
  if (typeof timestamp === "number") {
    timestamp = timestamp > 1e10 ? timestamp / 1000 : timestamp;
    const date = new Date(timestamp * 1000);
    return date.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
  return "Ẩn";
}

function formatDate(date) {
  if (typeof date === "number") {
    const dateObj = new Date(date * 1000);
    return dateObj.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
  return date || "Ẩn";
}

async function sendErrorMessage(api, message, threadId, errorMsg) {
  await api.sendMessage({ msg: errorMsg, quote: message }, threadId, message.type);
}
