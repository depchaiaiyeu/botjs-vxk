import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cs from "./index.js";

export const linkBackgroundDefault = "https://i.postimg.cc/tTwFPLV1/avt.jpg";
export const linkBackgroundDefaultZalo = "https://i.postimg.cc/tTwFPLV1/avt.jpg";

function toTitleCase(str) {
  return str.split(' ').map(word => {
    if (word.length === 0) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

export async function getLinkBackgroundDefault(userInfo) {
  let backgroundImage;
  try {
    if (userInfo.cover && userInfo.cover !== linkBackgroundDefaultZalo) {
      backgroundImage = await loadImage(userInfo.cover);
    } else {
      backgroundImage = await loadImage(linkBackgroundDefault);
    }
  } catch (error) {
    backgroundImage = await loadImage(linkBackgroundDefault);
  }
  return backgroundImage;
}

async function createImage(userInfo, message, fileName, typeImage = -1) {
  const width = 1000;
  const height = 300;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  let backgroundImage;
  let fluent = 0.8;
  if (fileName.includes("welcome")) {
    typeImage = 0;
    fluent = 0.6;
  } else if (fileName.includes("goodbye")) {
    typeImage = 1;
    fluent = 0.6;
  } else if (["blocked", "kicked", "kicked_spam"].some(keyword => fileName.includes(keyword))) {
    typeImage = 2;
    fluent = 0.85;
  } else if (["setting", "update", "link", "pin", "unpin", "board", "topic", "admin"].some(keyword => fileName.includes(keyword)) || fileName.includes("request")) {
    typeImage = 3;
    fluent = 0.7;
  }

  try {
    backgroundImage = await getLinkBackgroundDefault(userInfo);
    ctx.drawImage(backgroundImage, 0, 0, width, height);

    const overlay = ctx.createLinearGradient(0, 0, 0, height);
    overlay.addColorStop(0, `rgba(30, 30, 53, ${fluent})`);
    overlay.addColorStop(0.5, `rgba(26, 37, 71, ${fluent})`);
    overlay.addColorStop(1, `rgba(19, 27, 54, ${fluent})`);

    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, height);
  } catch (error) {
    const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
    backgroundGradient.addColorStop(0, "#1E1E35");
    backgroundGradient.addColorStop(0.5, "#1A2547");
    backgroundGradient.addColorStop(1, "#131B36");

    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, width, height);
  }

  let xAvatar = 120;
  let widthAvatar = 160;
  let heightAvatar = 160;
  let yAvatar = height / 2 - heightAvatar / 2;

  let gradientColors;
  if (typeImage === 0) {
    gradientColors = ["#00ffcc", "#00ff95", "#00ff80", "#1aff8c", "#33ff99"];
  } else if (typeImage === 1) {
    gradientColors = ["#FFFFFF", "#F0F0F0", "#FAFAFF", "#F8FBFF", "#EAEAFF", "#FFF5FA", "#FFFFFF"];
  } else if (typeImage === 2) {
    gradientColors = ["#ff0000", "#ff1111", "#ff2200", "#ff0022", "#ff3300"];
  } else if (typeImage === 3) {
    gradientColors = ["#FFD700", "#FFA500", "#FF8C00", "#FFB347", "#FFCC00", "#FFE066"];
  } else {
    gradientColors = ["#FF1493", "#FF69B4", "#FFD700", "#FFA500", "#FF8C00", "#00FF7F", "#40E0D0"];
  }

  const shuffledColors = [...gradientColors].sort(() => Math.random() - 0.5);

  const userAvatarUrl = userInfo.avatar;
  if (userAvatarUrl && cs.isValidUrl(userAvatarUrl)) {
    try {
      const avatar = await loadImage(userAvatarUrl);
      const borderWidth = 10;
      const gradient = ctx.createLinearGradient(
        xAvatar - widthAvatar / 2 - borderWidth,
        yAvatar - borderWidth,
        xAvatar + widthAvatar / 2 + borderWidth,
        yAvatar + heightAvatar + borderWidth
      );

      shuffledColors.forEach((color, index) => {
        gradient.addColorStop(index / (shuffledColors.length - 1), color);
      });

      ctx.save();
      ctx.beginPath();
      ctx.arc(xAvatar, height / 2, widthAvatar / 2 + borderWidth, 0, Math.PI * 2, true);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(xAvatar, height / 2, widthAvatar / 2, 0, Math.PI * 2, true);
      ctx.clip();
      ctx.drawImage(avatar, xAvatar - widthAvatar / 2, yAvatar, widthAvatar, heightAvatar);
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(xAvatar + widthAvatar / 2 + borderWidth + 30, yAvatar + 30);
      ctx.lineTo(xAvatar + widthAvatar / 2 + borderWidth + 30, yAvatar + heightAvatar - 30);
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();
    } catch (error) {
      console.error("Lỗi load avatar:", error);
    }
  }

  let x1 = xAvatar - widthAvatar / 2 + widthAvatar;
  let x2 = x1 + (width - x1) / 2 - 5;
  let y1 = 86;

  const titleGradient = ctx.createLinearGradient(x2 - 150, y1 - 30, x2 + 150, y1);
  shuffledColors.slice(0, 3).forEach((color, index) => {
    titleGradient.addColorStop(index / 2, color);
  });
  ctx.fillStyle = titleGradient;
  ctx.textAlign = "center";
  ctx.font = "bold 36px BeVietnamPro";
  ctx.fillText(message.title, x2, y1);

  let y2 = y1 + 50;
  const userNameGradient = ctx.createLinearGradient(x2 - 150, y2 - 30, x2 + 150, y2);
  shuffledColors.slice(2, 5).forEach((color, index) => {
    userNameGradient.addColorStop(index / 2, color);
  });
  ctx.fillStyle = userNameGradient;
  ctx.font = "bold 36px BeVietnamPro";
  ctx.fillText(message.userName, x2, y2);

  let y3 = y2 + 45;
  const subtitleGradient = ctx.createLinearGradient(x2 - 150, y3 - 30, x2 + 150, y3);
  shuffledColors.slice(1, 4).forEach((color, index) => {
    subtitleGradient.addColorStop(index / 2, color);
  });
  ctx.fillStyle = subtitleGradient;
  ctx.font = "32px BeVietnamPro";
  ctx.fillText(message.subtitle, x2, y3);

  let y4 = y3 + 45;
  const authorGradient = ctx.createLinearGradient(x2 - 150, y4 - 30, x2 + 150, y4);
  shuffledColors.slice(3, 6).forEach((color, index) => {
    authorGradient.addColorStop(index / 2, color);
  });
  ctx.fillStyle = authorGradient;
  ctx.font = "bold 32px BeVietnamPro";
  ctx.fillText(message.author, x2, y4);

  const filePath = path.resolve(`./assets/temp/${fileName}`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

export async function createJoinRequestImage(userInfo, groupName, groupType, userActionName, isAdmin) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  const userName = userInfo.name || "";
  return createImage(
    userInfo,
    {
      title: `Join Request ${groupTypeText}`,
      userName: toTitleCase(groupName),
      subtitle: toTitleCase(`${isAdmin ? "Sếp " : ""}${userName}`),
      author: toTitleCase(`Đã Gửi Yêu Cầu Tham Gia ${vnGroupType}`),
    },
    `join_request_${Date.now()}.png`
  );
}

export async function createWelcomeImage(userInfo, groupName, groupType, userActionName, isAdmin) {
  const userName = userInfo.name || "";
  const authorText = userActionName === userName ? "Tham Gia Trực Tiếp Hoặc Được Mời" : `Duyệt Bởi ${userActionName}`;
  return createImage(
    userInfo,
    {
      title: toTitleCase(groupName),
      userName: toTitleCase(`Chào Mừng ${isAdmin ? "Sếp " : ""}${userName}`),
      subtitle: toTitleCase(`Đã Tham Gia ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`),
      author: toTitleCase(authorText),
    },
    `welcome_${Date.now()}.png`
  );
}

export async function createGoodbyeImage(userInfo, groupName, groupType, isAdmin) {
  const userName = userInfo.name || "";
  return createImage(
    userInfo,
    {
      title: "Member Left The Group",
      userName: toTitleCase(`${isAdmin ? "Sếp " : ""}${userName}`),
      subtitle: toTitleCase(`Vừa Rời Khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`),
      author: toTitleCase(groupName)
    },
    `goodbye_${Date.now()}.png`
  );
}

export async function createKickImage(userInfo, groupName, groupType, gender, userActionName, isAdmin) {
  const userName = userInfo.name || "";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  let userNameText = isAdmin ? `Sếp ${userName}` : `${genderText} Oắt Con ${userName}`;
  return createImage(
    userInfo,
    {
      title: `Kicked Out Member`,
      userName: toTitleCase(userNameText),
      subtitle: toTitleCase(`Đã Bị ${userActionName} Sút Khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`),
      author: toTitleCase(groupName),
    },
    `kicked_${Date.now()}.png`
  );
}

export async function createBlockImage(userInfo, groupName, groupType, gender, userActionName, isAdmin) {
  const userName = userInfo.name || "";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  let userNameText = isAdmin ? `Sếp ${userName}` : `${genderText} Oắt Con ${userName}`;
  return createImage(
    userInfo,
    {
      title: `Blocked Out Member`,
      userName: toTitleCase(userNameText),
      subtitle: toTitleCase(`Đã Bị ${userActionName} Chặn Khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`),
      author: toTitleCase(groupName),
    },
    `blocked_${Date.now()}.png`
  );
}

export async function createBlockSpamImage(userInfo, groupName, groupType, gender) {
  const userName = userInfo.name || "";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  return createImage(
    userInfo,
    {
      title: `Blocked Out Spam Member`,
      userName: toTitleCase(`${genderText} Oắt Con ${userName}`),
      subtitle: toTitleCase(`Do Spam Đã Bị Chặn Khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`),
      author: toTitleCase(groupName),
    },
    `blocked_spam_${Date.now()}.png`
  );
}

export async function createBlockSpamLinkImage(userInfo, groupName, groupType, gender) {
  const userName = userInfo.name || "";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  return createImage(
    userInfo,
    {
      title: `Blocked Out Spam Link Member`,
      userName: toTitleCase(`${genderText} Oắt Con ${userName}`),
      subtitle: toTitleCase(`Do Spam Link Đã Bị Chặn Khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`),
      author: toTitleCase(groupName),
    },
    `blocked_spam_link_${Date.now()}.png`
  );
}

export async function createBlockAntiBotImage(userInfo, groupName, groupType, gender) {
  const userNames = userInfo.name || "";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  return createImage(
    userInfo,
    {
      title: `Blocked Out Anti Bot Member`,
      userName: toTitleCase(`${genderText} Oắt Con ${userNames}`),
      subtitle: toTitleCase(`Do Sử Dụng Bot Đã Bị Chặn Khỏi ${groupType ? (groupType === 2 ? "Cộng Đồng" : "Nhóm") : "Nhóm"}`),
      author: toTitleCase(groupName),
    },
    `blocked_anti_bot_${Date.now()}.png`
  );
}

export async function createUpdateSettingImage(actorInfo, actorName, groupName, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: `Update Setting ${groupTypeText}`,
      userName: toTitleCase(groupName),
      subtitle: toTitleCase(actorName),
      author: toTitleCase(`Đã Cập Nhật Cài Đặt ${vnGroupType}`),
    },
    `setting_${Date.now()}.png`,
    3
  );
}

export async function createUpdateDescImage(actorInfo, actorName, groupName, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: `Update Desc ${groupTypeText}`,
      userName: toTitleCase(groupName),
      subtitle: toTitleCase(actorName),
      author: toTitleCase(`Đã Cập Nhật Mô Tả ${vnGroupType}`),
    },
    `update_${Date.now()}.png`,
    3
  );
}

export async function createNewLinkImage(actorInfo, actorName, groupName, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: `New Link ${groupTypeText}`,
      userName: toTitleCase(groupName),
      subtitle: toTitleCase(actorName),
      author: toTitleCase(`Đã Tạo Link ${vnGroupType} Mới`),
    },
    `link_${Date.now()}.png`,
    3
  );
}

export async function createPinTopicImage(actorInfo, actorName, groupName, topicTitle, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: `Pin Topic ${groupTypeText}`,
      userName: toTitleCase(groupName),
      subtitle: toTitleCase(actorName),
      author: toTitleCase(`Đã Ghim Chủ Đề: ${topicTitle}`),
    },
    `pin_${Date.now()}.png`,
    3
  );
}

export async function createUpdateTopicImage(actorInfo, actorName, groupName, topicTitle, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: `Update Topic ${groupTypeText}`,
      userName: toTitleCase(groupName),
      subtitle: toTitleCase(actorName),
      author: toTitleCase(`Đã Cập Nhật Chủ Đề: ${topicTitle}`),
    },
    `update_topic_${Date.now()}.png`,
    3
  );
}

export async function createUpdateBoardImage(actorInfo, actorName, groupName, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: `Update Board ${groupTypeText}`,
      userName: toTitleCase(groupName),
      subtitle: toTitleCase(actorName),
      author: toTitleCase(`Đã Cập Nhật Bảng Thông Tin ${vnGroupType}`),
    },
    `board_${Date.now()}.png`,
    3
  );
}

export async function createReorderPinImage(actorInfo, actorName, groupName, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  return createImage(
    actorInfo,
    {
      title: `Reorder Pin ${groupTypeText}`,
      userName: toTitleCase(groupName),
      subtitle: toTitleCase(actorName),
      author: toTitleCase(`Đã Thay Đổi Thứ Tự Ghim Chủ Đề`),
    },
    `reorder_pin_${Date.now()}.png`,
    3
  );
}

export async function createUnpinTopicImage(actorInfo, actorName, groupName, topicTitle, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  return createImage(
    actorInfo,
    {
      title: `Unpin Topic ${groupTypeText}`,
      userName: toTitleCase(groupName),
      subtitle: toTitleCase(actorName),
      author: toTitleCase(`Đã Gỡ Ghim Chủ Đề: ${topicTitle}`),
    },
    `unpin_${Date.now()}.png`,
    3
  );
}

export async function createRemoveTopicImage(actorInfo, actorName, groupName, topicTitle, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  return createImage(
    actorInfo,
    {
      title: `Remove Topic ${groupTypeText}`,
      userName: toTitleCase(groupName),
      subtitle: toTitleCase(actorName),
      author: toTitleCase(`Đã Xóa Chủ Đề: ${topicTitle}`),
    },
    `remove_topic_${Date.now()}.png`,
    3
  );
}

export async function createAdminChangeImage(actorInfo, targetName, groupName, isAdd, groupType) {
  const groupTypeText = groupType === 2 ? "Community" : "Group";
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  const actorName = actorInfo.name || "";
  return createImage(
    actorInfo,
    {
      title: `${isAdd ? "Add Admin" : "Remove Admin"} ${groupTypeText}`,
      userName: toTitleCase(groupName),
      subtitle: toTitleCase(actorName),
      author: toTitleCase(`${isAdd ? "Đã Thêm" : "Đã Gỡ"} ${targetName} Làm Phó ${vnGroupType}`),
    },
    `${isAdd ? "add" : "remove"}_admin_${Date.now()}.png`,
    3
  );
}
