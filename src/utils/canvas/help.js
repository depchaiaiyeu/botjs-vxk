import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cv from "./index.js";

// Danh sách ảnh nền
const backgroundImages = [
  "https://files.catbox.moe/rus9f2.jpg" // ảnh nền sáng
];

// Hàm tạo gradient cầu vồng
function createRainbowGradient(ctx, width) {
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "red");
  gradient.addColorStop(0.2, "orange");
  gradient.addColorStop(0.4, "yellow");
  gradient.addColorStop(0.6, "green");
  gradient.addColorStop(0.8, "blue");
  gradient.addColorStop(1, "violet");
  return gradient;
}

// Tạo Hình Lệnh !Help
export async function createInstructionsImage(helpContent, isAdminBox, width = 800) {
  const ctxTemp = createCanvas(999, 999).getContext("2d");

  const space = 36;
  let yTemp = 60;

  ctxTemp.font = "bold 28px Tahoma";
  for (const key in helpContent.allMembers) {
    if (helpContent.allMembers.hasOwnProperty(key)) {
      const keyHelpContent = `${helpContent.allMembers[key].icon} ${helpContent.allMembers[key].command}`;
      const labelWidth = ctxTemp.measureText(keyHelpContent).width;
      const valueHelpContent = " -> " + helpContent.allMembers[key].description;
      const lineWidth = labelWidth + space + ctxTemp.measureText(valueHelpContent).width;
      if (lineWidth > width) {
        yTemp += 52;
      }
      yTemp += 52;
    }
  }

  yTemp += 60;

  if (isAdminBox) {
    for (const key in helpContent.admin) {
      if (helpContent.admin.hasOwnProperty(key)) {
        const keyHelpContent = `${helpContent.admin[key].icon} ${helpContent.admin[key].command}`;
        const labelWidth = ctxTemp.measureText(keyHelpContent).width;
        const valueHelpContent = " -> " + helpContent.admin[key].description;
        const lineWidth = labelWidth + space + ctxTemp.measureText(valueHelpContent).width;
        if (lineWidth > width) {
          yTemp += 52;
        }
        yTemp += 52;
      }
    }
    yTemp += 60;
  }

  const height = yTemp > 430 ? yTemp : 430;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // === Thêm ảnh nền ===
  const randomBg = backgroundImages[Math.floor(Math.random() * backgroundImages.length)];
  const bgImg = await loadImage(randomBg);
  ctx.drawImage(bgImg, 0, 0, width, height);

  // Overlay trắng mờ để nền dịu hơn
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.fillRect(0, 0, width, height);

  let y = 60;

  ctx.textAlign = "left";
  ctx.font = "bold 28px Tahoma";

  // === Tiêu đề chính ===
  ctx.fillStyle = "#00aa00";     // xanh lá dịu
  ctx.shadowColor = "#00cc66";   // neon dịu
  ctx.shadowBlur = 10;
  ctx.fillText(helpContent.title, space, y);

  // viền cầu vồng
  ctx.lineWidth = 2;
  ctx.strokeStyle = createRainbowGradient(ctx, width);
  ctx.strokeText(helpContent.title, space, y);

  ctx.shadowBlur = 0;
  y += 50;

  ctx.textAlign = "left";
  ctx.font = "bold 28px Tahoma";

  for (const key in helpContent.allMembers) {
    if (helpContent.allMembers.hasOwnProperty(key)) {
      // Neon + viền cầu vồng cho tên lệnh
      const keyHelpContent = `${helpContent.allMembers[key].icon} ${helpContent.allMembers[key].command}`;

      ctx.fillStyle = "#00aa00";
      ctx.shadowColor = "#00cc66";
      ctx.shadowBlur = 8;
      ctx.fillText(keyHelpContent, space, y);

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = createRainbowGradient(ctx, width);
      ctx.strokeText(keyHelpContent, space, y);

      ctx.shadowBlur = 0;

      // Mô tả màu trắng + neon dịu + viền cầu vồng
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "#00cc66";
      ctx.shadowBlur = 6;

      const labelWidth = ctx.measureText(keyHelpContent).width;
      const valueHelpContent = " -> " + helpContent.allMembers[key].description;
      const lineWidth = labelWidth + space + ctx.measureText(valueHelpContent).width;
      if (lineWidth > width) {
        y += 52;
        ctx.fillText(valueHelpContent, space + 20, y);
        ctx.lineWidth = 1;
        ctx.strokeStyle = createRainbowGradient(ctx, width);
        ctx.strokeText(valueHelpContent, space + 20, y);
      } else {
        ctx.fillText(valueHelpContent, space + labelWidth, y);
        ctx.lineWidth = 1;
        ctx.strokeStyle = createRainbowGradient(ctx, width);
        ctx.strokeText(valueHelpContent, space + labelWidth, y);
      }

      ctx.shadowBlur = 0;
      y += 52;
    }
  }

  if (isAdminBox) {
    if (Object.keys(helpContent.admin).length > 0) {
      y += 30;
      ctx.textAlign = "left";
      ctx.font = "bold 28px Tahoma";

      // Tiêu đề Admin
      ctx.fillStyle = "#00aa00";
      ctx.shadowColor = "#00cc66";
      ctx.shadowBlur = 10;
      ctx.fillText(helpContent.titleAdmin, space, y);

      ctx.lineWidth = 2;
      ctx.strokeStyle = createRainbowGradient(ctx, width);
      ctx.strokeText(helpContent.titleAdmin, space, y);

      ctx.shadowBlur = 0;
      y += 50;

      for (const key in helpContent.admin) {
        if (helpContent.admin.hasOwnProperty(key)) {
          // Lệnh Admin
          const keyHelpContent = `${helpContent.admin[key].icon} ${helpContent.admin[key].command}`;

          ctx.fillStyle = "#00aa00";
          ctx.shadowColor = "#00cc66";
          ctx.shadowBlur = 8;
          ctx.fillText(keyHelpContent, space, y);

          ctx.lineWidth = 1.5;
          ctx.strokeStyle = createRainbowGradient(ctx, width);
          ctx.strokeText(keyHelpContent, space, y);

          ctx.shadowBlur = 0;

          // Mô tả Admin màu trắng + neon dịu + viền cầu vồng
          ctx.fillStyle = "#FFFFFF";
          ctx.shadowColor = "#00cc66";
          ctx.shadowBlur = 6;

          const labelWidth = ctx.measureText(keyHelpContent).width;
          const valueHelpContent = " -> " + helpContent.admin[key].description;
          const lineWidth = labelWidth + space + ctx.measureText(valueHelpContent).width;
          if (lineWidth > width) {
            y += 52;
            ctx.fillText(valueHelpContent, space + 20, y);
            ctx.lineWidth = 1;
            ctx.strokeStyle = createRainbowGradient(ctx, width);
            ctx.strokeText(valueHelpContent, space + 20, y);
          } else {
            ctx.fillText(valueHelpContent, space + labelWidth, y);
            ctx.lineWidth = 1;
            ctx.strokeStyle = createRainbowGradient(ctx, width);
            ctx.strokeText(valueHelpContent, space + labelWidth, y);
          }

          ctx.shadowBlur = 0;
          y += 52;
        }
      }
    }
  }

  const filePath = path.resolve(`./assets/temp/help_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}
