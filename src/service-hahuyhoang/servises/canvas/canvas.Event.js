import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "canvas";

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * @param {Object} userInfo - Người thực hiện hành động
 * @param {Object} message - Nội dung thông báo gồm title, userName, subtitle, author
 * @param {string} fileName - Tên file lưu
 * @param {string} backgroundUrl - Ảnh nền nhóm (dùng avatar nhóm)
 * @param {string} rightAvatarUrl - Ảnh người bị ảnh hưởng (ví dụ người được thêm)
 */
export async function drawGroupEventCanvas(userInfo, message, fileName, backgroundUrl, rightAvatarUrl) {
  const baseWidth = 1000;
  const lineHeight = 60;
  const margin = 60;

  const lines = [message.title, message.userName, message.subtitle, message.author];
  const estimatedHeight = margin * 2 + lines.length * lineHeight + 100;

  const canvas = createCanvas(baseWidth, estimatedHeight);
  const ctx = canvas.getContext("2d");

  // ----- Nền ảnh từ avatar nhóm -----
  if (backgroundUrl && isValidUrl(backgroundUrl)) {
    try {
      const bg = await loadImage(backgroundUrl);
      ctx.drawImage(bg, 0, 0, baseWidth, estimatedHeight);
      const overlay = ctx.createLinearGradient(0, 0, 0, estimatedHeight);
      overlay.addColorStop(0, "rgba(0,0,0,0.6)");
      overlay.addColorStop(1, "rgba(0,0,0,0.8)");
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, baseWidth, estimatedHeight);
    } catch (e) {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, baseWidth, estimatedHeight);
    }
  } else {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, baseWidth, estimatedHeight);
  }

  // ----- Avatar trái: userInfo.avatar -----
  const avatarSize = 160;
  const xLeft = 120;
  const xRight = baseWidth - 120;
  const yAvatar = estimatedHeight / 2 - avatarSize / 2;

  if (userInfo.avatar && isValidUrl(userInfo.avatar)) {
    try {
      const avatar = await loadImage(userInfo.avatar);
      ctx.save();
      ctx.beginPath();
      ctx.arc(xLeft, estimatedHeight / 2, avatarSize / 2 + 10, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(xLeft, estimatedHeight / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, xLeft - avatarSize / 2, yAvatar, avatarSize, avatarSize);
      ctx.restore();
    } catch (err) {
      console.warn("Lỗi avatar người thực hiện:", err);
    }
  }

  // ----- Avatar phải: người bị ảnh hưởng (nếu có) -----
  if (rightAvatarUrl && isValidUrl(rightAvatarUrl)) {
    try {
      const avatar = await loadImage(rightAvatarUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(xRight, estimatedHeight / 2, avatarSize / 2 + 10, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(xRight, estimatedHeight / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, xRight - avatarSize / 2, yAvatar, avatarSize, avatarSize);
      ctx.restore();
    } catch (err) {
      console.warn("Lỗi avatar người bị ảnh hưởng:", err);
    }
  }

  // ----- Text ở giữa -----
  const xText = baseWidth / 2;
  let y = margin + 10;
  const texts = [
    { text: message.title, size: 36 },
    { text: message.userName, size: 34 },
    { text: message.subtitle, size: 32 },
    { text: message.author, size: 30 }
  ];

  ctx.textAlign = "center";
  for (const item of texts) {
    ctx.font = `bold ${item.size}px sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(item.text, xText, y);
    y += lineHeight;
  }

  const dirPath = path.resolve("./assets/temp");
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

  const filePath = path.join(dirPath, fileName);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}
