import { createCanvas, loadImage } from "canvas";
import fs from "fs/promises";
import path from "path";
import { loadImageBuffer } from "../../../utils/util.js";

export async function createClipphotListImage(clips) {
  const canvasWidth = 1100;
  const itemHeight = 160;
  const canvasHeight = clips.length * itemHeight + 80;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.font = "bold 38px BeVietnamPro";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Clipphot - Danh sách kết quả:", 40, 50);

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const y = 70 + i * itemHeight;

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(30, y, canvasWidth - 60, itemHeight - 20);

    const thumbBuffer = await loadImageBuffer(clip.img);
    const thumbImg = thumbBuffer ? await loadImage(thumbBuffer) : null;
    if (thumbImg) {
      ctx.drawImage(thumbImg, 40, y + 10, 240, 135);
    }

    ctx.fillStyle = "#00e0ff";
    ctx.font = "bold 24px BeVietnamPro";
    const title = `${i + 1}. ${clip.title}`;
    drawWrappedText(ctx, title, 300, y + 30, canvasWidth - 340, 26);
  }

  const filePath = path.resolve(`./assets/temp/clipphot_list_${Date.now()}.png`);
  await fs.writeFile(filePath, canvas.toBuffer());
  return filePath;
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}
