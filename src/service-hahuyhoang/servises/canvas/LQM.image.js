import { createCanvas, loadImage } from "canvas";
import fs from "fs/promises";
import path from "path";
import { loadImageBuffer } from "../../../utils/util.js";

export async function createHeroFinalDetailImage(hero) {
  const canvasWidth = 1200;
  const baseCanvasHeight = 1000;

  // 👉 Ước lượng chiều cao cần thiết cho skill blocks
  const estimatedHeight = await estimateSkillBlockHeights(hero.skills);
  const canvasHeight = Math.max(baseCanvasHeight, estimatedHeight + 300);

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  const background = await loadImageBuffer(hero.backgroundUrl);
  const backgroundImg = background ? await loadImage(background) : null;
  if (backgroundImg) {
    ctx.drawImage(backgroundImg, 0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  try {
    const logo = await loadImage("https://lienquan.garena.vn/wp-content/uploads/2024/02/logo.png");
    ctx.drawImage(logo, canvasWidth - 200, 25, 160, 60);
  } catch (e) {}

  const avatarSize = 160;
  const avatarX = 60;
  const avatarY = 50;

  const avatar = await loadImageBuffer(hero.avatarUrl);
  const avatarImg = avatar ? await loadImage(avatar) : null;
  if (avatarImg) {
    const gradient = getSoftGradient(ctx, avatarX, avatarY, avatarSize, avatarSize);
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 6, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
  }

  const icon = await loadImageBuffer(hero.icon);
  const iconImg = icon ? await loadImage(icon) : null;
  if (iconImg) {
    const iconSize = 50;
    const iconX = avatarX + avatarSize / 2 - iconSize / 2;
    const iconY = avatarY + avatarSize + 10;
    ctx.save();
    ctx.beginPath();
    ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(iconImg, iconX, iconY, iconSize, iconSize);
    ctx.restore();
  }

  const textStartX = avatarX + avatarSize + 40;
  const centerY = avatarY + avatarSize / 2;

  ctx.font = "bold 42px BeVietnamPro";
  ctx.fillStyle = getBrightGradient(ctx, textStartX, centerY - 10, 600, 40);
  ctx.fillText(hero.name, textStartX, centerY - 10);

  ctx.font = "30px BeVietnamPro";
  ctx.fillStyle = getBrightGradient(ctx, textStartX, centerY + 30, 600, 30);
  ctx.fillText(`Trang phục: ${hero.skin}`, textStartX, centerY + 30);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px BeVietnamPro";
  ctx.fillText("Kỹ năng:", 60, avatarY + avatarSize + 100);

  let y = avatarY + avatarSize + 140;

  for (const [i, skill] of hero.skills.entries()) {
    const skillImgBuffer = await loadImageBuffer(skill.img);
    const skillImg = skillImgBuffer ? await loadImage(skillImgBuffer) : null;
    const skillIconSize = 60;
  
    const textX = 60 + skillIconSize + 20;
    const textWidth = canvasWidth - textX - 40;
    const maxLines = 25;
    const initialFontSize = 24;
    const minFontSize = 18;
  
    const { fontSize, lines } = calculateFontSize(skill.description, textWidth, maxLines, ctx, initialFontSize, minFontSize);
  
    const descLineHeight = fontSize + 5;
    const titleHeight = 30;
    const descOffsetFromTitle = 36;        // 👈 Giảm sát nhưng không bị đè
    const blockPadding = 10;
    const extraBottomSpacing = 10;         // 👈 Tránh chữ cuối bị cắt
  
    const totalTextHeight = titleHeight + descOffsetFromTitle + lines.length * descLineHeight;
    const blockHeight = Math.max(skillIconSize, totalTextHeight) + blockPadding + extraBottomSpacing;
  
    // Vẽ icon kỹ năng
    if (skillImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(60 + skillIconSize / 2, y + skillIconSize / 2, skillIconSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(skillImg, 60, y, skillIconSize, skillIconSize);
      ctx.restore();
    }
  
    // Tên kỹ năng
    ctx.font = "bold 24px BeVietnamPro";
    ctx.fillStyle = "#00ffcc";
    ctx.fillText(`${i + 1}. ${skill.name}`, textX, y + 22);
  
    // Mô tả kỹ năng
    ctx.font = `${fontSize}px BeVietnamPro`;
    ctx.fillStyle = "#ffffff";
    const textStartY = y + titleHeight + descOffsetFromTitle;
    lines.forEach((line, j) => {
      ctx.fillText(line, textX, textStartY + j * descLineHeight);
    });
  
    // Gạch phân cách
    y += blockHeight;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, y);
    ctx.lineTo(canvasWidth - 60, y);
    ctx.stroke();
  
    y += 15;
  }
  

  const filePath = path.resolve(`./assets/temp/hero_final_detail_${Date.now()}.png`);
  await fs.writeFile(filePath, canvas.toBuffer());
  return filePath;
}

// ===== UTILS =====

function getBrightGradient(ctx, x, y, width, height) {
  const gradient = ctx.createLinearGradient(x, y, x + width, y);
  gradient.addColorStop(0, "#00ffff");
  gradient.addColorStop(0.5, "#ffffff");
  gradient.addColorStop(1, "#00ffff");
  return gradient;
}

function getSoftGradient(ctx, x, y, width, height) {
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, getRandomPastelColor());
  gradient.addColorStop(1, getRandomPastelColor());
  return gradient;
}

function getRandomPastelColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 85%)`;
}

// Xử lý wrap text & xoá xuống dòng
function wrapText(ctx, text, maxWidth, fontSize) {
  ctx.font = `${fontSize}px BeVietnamPro`;
  const cleanText = text.replace(/[\r\n]+/g, " ").trim();
  const words = cleanText.split(" ");
  const lines = [];
  let currentLine = words[0] || "";

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine + " " + word;
    const width = ctx.measureText(testLine).width;
    if (width < maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function calculateFontSize(text, maxWidth, maxLines, ctx, initialFontSize = 22, minFontSize = 16) {
  let fontSize = initialFontSize;
  let lines = wrapText(ctx, text, maxWidth, fontSize);

  while (lines.length > maxLines && fontSize > minFontSize) {
    fontSize -= 2;
    lines = wrapText(ctx, text, maxWidth, fontSize);
  }

  return { fontSize, lines };
}

// Ước tính tổng chiều cao skill blocks
async function estimateSkillBlockHeights(skills) {
    const canvas = createCanvas(10, 10);
    const ctx = canvas.getContext("2d");
    let totalHeight = 0;
  
    for (const skill of skills) {
      const textWidth = 1200 - 60 - 60 - 40;
      const { fontSize, lines } = calculateFontSize(skill.description, textWidth, 25, ctx, 24, 18);
      const descLineHeight = fontSize + 5;
      const titleHeight = 30;
      const descOffsetFromTitle = 36;
      const blockPadding = 10;
      const extraBottomSpacing = 10;
  
      const blockHeight = Math.max(60, titleHeight + descOffsetFromTitle + lines.length * descLineHeight) + blockPadding + extraBottomSpacing;
      totalHeight += blockHeight + 15; // 👈 Cộng phần y += 15 giống bên render
    }
  
    return totalHeight + 100; // 👈 Cộng header/avatar/logo các kiểu
  }
  