import { createCanvas } from "canvas";
import fs from "fs";
import path from "path";

function getRandomGradient(ctx, width) {
  const colors = [
    ['#60A5FA', '#3B82F6'],
    ['#34D399', '#10B981'],
    ['#F472B6', '#EC4899'],
    ['#FBBF24', '#F59E0B'],
    ['#A78BFA', '#8B5CF6'],
    ['#FB923C', '#F97316']
  ];
  const colorPair = colors[Math.floor(Math.random() * colors.length)];
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, colorPair[0]);
  gradient.addColorStop(1, colorPair[1]);
  return gradient;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCommandBox(ctx, x, y, width, height, cmd, isLeft) {
  ctx.fillStyle = isLeft ? "rgba(30, 58, 138, 0.5)" : "rgba(6, 78, 59, 0.5)";
  roundRect(ctx, x, y, width, height, 15);
  ctx.fill();
  
  ctx.strokeStyle = isLeft ? "rgba(59, 130, 246, 0.3)" : "rgba(16, 185, 129, 0.3)";
  ctx.lineWidth = 2;
  ctx.stroke();
  
  ctx.textAlign = "left";
  ctx.font = "bold 20px Tahoma, Arial";
  
  const iconGradient = ctx.createLinearGradient(x, y, x + width, y);
  if (isLeft) {
    iconGradient.addColorStop(0, "#60A5FA");
    iconGradient.addColorStop(1, "#3B82F6");
  } else {
    iconGradient.addColorStop(0, "#34D399");
    iconGradient.addColorStop(1, "#10B981");
  }
  
  ctx.fillStyle = iconGradient;
  ctx.fillText(`${cmd.icon || "📌"} ${cmd.command || ""}`, x + 20, y + 30);
  
  ctx.font = "18px Tahoma, Arial";
  ctx.fillStyle = "#E5E7EB";
  ctx.fillText(cmd.description || "", x + 20, y + height - 20);
}

export async function createInstructionsImage(helpContent, isAdminBox, width = 880) {
  const paddingX = 40;
  const paddingY = 50;
  const headerHeight = 100;
  const commandItemHeight = 80;
  const sectionSpacing = 60;
  
  let totalCommands = Object.keys(helpContent.allMembers || {}).length;
  if (isAdminBox && helpContent.admin) {
    totalCommands += Object.keys(helpContent.admin).length;
  }
  
  let height = headerHeight + paddingY * 2;
  height += totalCommands * commandItemHeight;
  if (isAdminBox && helpContent.admin && Object.keys(helpContent.admin).length > 0) {
    height += sectionSpacing;
  }
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  
  const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
  backgroundGradient.addColorStop(0, "#064E3B");
  backgroundGradient.addColorStop(1, "#022C22");
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, width, height);
  
  let y = paddingY;
  
  ctx.textAlign = "center";
  ctx.font = "bold 36px Tahoma, Arial";
  
  const titleGradient = ctx.createLinearGradient(0, 0, width, 0);
  titleGradient.addColorStop(0, "#60A5FA");
  titleGradient.addColorStop(0.5, "#34D399");
  titleGradient.addColorStop(1, "#60A5FA");
  ctx.fillStyle = titleGradient;
  
  const titleText = helpContent.title || "DANH SÁCH LỆNH";
  ctx.fillText(titleText, width / 2, y + 40);
  
  ctx.strokeStyle = "#60A5FA";
  ctx.lineWidth = 3;
  const titleWidth = ctx.measureText(titleText).width;
  ctx.beginPath();
  ctx.moveTo((width - titleWidth) / 2, y + 55);
  ctx.lineTo((width + titleWidth) / 2, y + 55);
  ctx.stroke();
  
  y += headerHeight;
  
  if (helpContent.allMembers) {
    const commandWidth = (width - paddingX * 3) / 2;
    const commands = Object.values(helpContent.allMembers);
    
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      const isLeft = i % 2 === 0;
      const x = isLeft ? paddingX : paddingX * 2 + commandWidth;
      const yPos = y + Math.floor(i / 2) * commandItemHeight;
      
      drawCommandBox(ctx, x, yPos, commandWidth, commandItemHeight - 10, cmd, isLeft);
    }
    
    y += Math.ceil(commands.length / 2) * commandItemHeight;
  }
  
  if (isAdminBox && helpContent.admin && Object.keys(helpContent.admin).length > 0) {
    y += sectionSpacing;
    
    ctx.textAlign = "center";
    ctx.font = "bold 32px Tahoma, Arial";
    const adminGradient = ctx.createLinearGradient(0, 0, width, 0);
    adminGradient.addColorStop(0, "#F472B6");
    adminGradient.addColorStop(1, "#FB923C");
    ctx.fillStyle = adminGradient;
    
    ctx.fillText(helpContent.titleAdmin || "LỆNH ADMIN", width / 2, y);
    
    y += 50;
    
    const commandWidth = (width - paddingX * 3) / 2;
    const adminCommands = Object.values(helpContent.admin);
    
    for (let i = 0; i < adminCommands.length; i++) {
      const cmd = adminCommands[i];
      const isLeft = i % 2 === 0;
      const x = isLeft ? paddingX : paddingX * 2 + commandWidth;
      const yPos = y + Math.floor(i / 2) * commandItemHeight;
      
      drawCommandBox(ctx, x, yPos, commandWidth, commandItemHeight - 10, cmd, isLeft);
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
