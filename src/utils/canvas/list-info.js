import { createCanvas } from 'canvas';
import fs from 'fs/promises';

export async function createAdminListImage(highLevelAdminList, groupAdminList, imagePath) {
  const width = 930;
  let yTemp = 300;
  const lineHeight = 40;

  yTemp += (highLevelAdminList.length + groupAdminList.length) * lineHeight + 100;

  const height = yTemp > 300 ? yTemp : 300;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
  backgroundGradient.addColorStop(0, '#3B82F6');
  backgroundGradient.addColorStop(1, '#111827');
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  const titleY = 50;
  ctx.fillText("Danh sách Quản trị Cấp Cao của Bot", width / 2, titleY);

  let yPosition = titleY + 50;
  ctx.font = '24px Arial';
  ctx.textAlign = 'left';

  if (highLevelAdminList.length === 0) {
    ctx.fillStyle = '#FFDD57';
    ctx.fillText("Không có quản trị viên cấp cao", 40, yPosition);
    yPosition += lineHeight;
  } else {
    highLevelAdminList.forEach((line, index) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`${index + 1}. ${line}`, 40, yPosition);
      yPosition += lineHeight;
    });
  }

  yPosition += 30;
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText("Danh sách Quản trị viên của Nhóm", width / 2, yPosition);

  yPosition += 50;
  ctx.font = '24px Arial';
  ctx.textAlign = 'left';

  if (groupAdminList.length === 0) {
    ctx.fillStyle = '#FFDD57';
    ctx.fillText("Không có quản trị viên nhóm", 40, yPosition);
  } else {
    groupAdminList.forEach((line, index) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`${index + 1}. ${line}`, 40, yPosition);
      yPosition += lineHeight;
    });
  }

  const buffer = canvas.toBuffer('image/png');
  await fs.writeFile(imagePath, buffer);
}
