import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { createCanvas, loadImage, registerFont } from "canvas";
import axios from "axios";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontPath = path.join(__dirname, "..", "..", "..", "..", "assets", "fonts", "BeVietnamPro-Bold.ttf");

try {
    if (!fs.existsSync(fontPath)) throw new Error(`Font không tồn tại tại đường dẫn: ${fontPath}`);
    registerFont(fontPath, { family: "BeVietnamPro" });
} catch (error) {
    console.error(error.message);
    process.exit(1);
}

export async function createCustomCanvas(senderName, coverUrl, avatarUrl, text) {
    const baseWidth = 1000;
    const headerHeight = 150;
    const minHeight = 700;

    const cacheDir = path.resolve(__dirname, "./cache");
    await fsp.mkdir(cacheDir, { recursive: true });

    const uniqueId = uuidv4();
    const backgroundPath = path.resolve(`${cacheDir}/cover_${uniqueId}.jpg`);
    const avatarPath = path.resolve(`${cacheDir}/avatar_${uniqueId}.jpg`);
    const outputPath = path.resolve(`${cacheDir}/canvas_${uniqueId}.png`);

    try {
        const fontSize = 48;
        const lineHeight = fontSize * 1.5; // Increase line spacing to prevent overlap
        const textMaxWidth = baseWidth - 100;

        const { lines: textLines, totalLines: textTotalLines } = handleTextWrapping(text, textMaxWidth, fontSize);

        let contentHeight = headerHeight + textTotalLines * lineHeight + 100;
        const canvasHeight = contentHeight > minHeight ? contentHeight : minHeight;

        const canvas = createCanvas(baseWidth, canvasHeight);
        const ctx = canvas.getContext("2d");

        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, baseWidth, headerHeight);

        if (coverUrl) {
            await downloadImage(coverUrl, backgroundPath);
            const background = await loadImage(backgroundPath);
            ctx.drawImage(background, 0, headerHeight - 5, baseWidth, canvasHeight - headerHeight + 5);
        } else {
            ctx.fillStyle = "#CCCCCC";
            ctx.fillRect(0, headerHeight - 2, baseWidth, canvasHeight - headerHeight + 2);
        }

        if (avatarUrl) {
            await downloadImage(avatarUrl, avatarPath);
            const avatar = await loadImage(avatarPath);
            const avatarSize = 100;
            const avatarX = 20;
            const avatarY = (headerHeight - avatarSize) / 2;

            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 5, 0, Math.PI * 2);
            ctx.fillStyle = "#87CEEB";
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.beginPath();
            ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
            ctx.restore();
        }

        ctx.font = 'bold 28px "BeVietnamPro"';
        ctx.fillStyle = "#000000";
        ctx.textAlign = "left";
        ctx.fillText(senderName, 140, headerHeight / 2 - 10);

        const currentDateTime = new Date();
        const dateTimeString = currentDateTime.toLocaleString("vi-VN");
        ctx.font = '16px "BeVietnamPro"';
        ctx.fillStyle = "#555555";
        ctx.fillText(`${dateTimeString} 🌏`, 140, headerHeight / 2 + 20);

        const verticalOffset = 50;
        const textStartY = headerHeight + (canvasHeight - headerHeight - textTotalLines * lineHeight) / 2 + verticalOffset;
        textLines.forEach((line, index) => {
            const yPosition = textStartY + index * lineHeight;
        
            if (line.trim() !== "") { // Chỉ vẽ dòng có nội dung
                ctx.fillText(line, baseWidth / 2, yPosition);
            }
        });

        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, headerHeight - 5, baseWidth, canvasHeight - headerHeight + 5);

        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.font = `${fontSize}px "BeVietnamPro"`;
        textLines.forEach((line, index) => {
            ctx.fillText(line, baseWidth / 2, textStartY + index * lineHeight);
        });

        const buffer = canvas.toBuffer("image/png");
        await fsp.writeFile(outputPath, buffer);

        return outputPath;
    } catch (error) {
        console.error(`Lỗi khi tạo canvas tùy chỉnh: ${error}`);
        throw error;
    } finally {
        await cleanupTempFiles([backgroundPath, avatarPath]);
    }
}

async function downloadImage(url, filePath) {
    try {
        const response = await axios.get(url, { responseType: "arraybuffer" });
        await fsp.writeFile(filePath, response.data);
    } catch (error) {
        console.error(`Không thể tải ảnh từ ${url}: ${error}`);
        throw error;
    }
}
function handleTextWrapping(text, maxWidth, fontSize) {
    const canvas = createCanvas(1, 1);
    const ctx = canvas.getContext("2d");
    ctx.font = `${fontSize}px "BeVietnamPro"`;
    const lines = [];
    const paragraphs = text.split("\n");
    paragraphs.forEach((paragraph) => {
        if (paragraph.trim() === "") {
            lines.push(" ");
            return;
        }
        const words = paragraph.split(/\s+/);
        let line = "";

        words.forEach((word) => {
            const testLine = line + word + " ";
            const testWidth = ctx.measureText(testLine.trim()).width;

            if (testWidth > maxWidth && line !== "") {
                lines.push(line.trim());
                line = word + " ";
            } else if (testWidth > maxWidth) {
                const splitWord = splitLongWord(word, maxWidth, ctx);
                lines.push(...splitWord);
                line = "";
            } else {
                line = testLine;
            }
        });

        if (line.trim() !== "") {
            lines.push(line.trim());
        }
    });

    return { lines, totalLines: lines.length };
}

function splitLongWord(word, maxWidth, ctx) {
    const result = [];
    let currentWord = "";

    for (let i = 0; i < word.length; i++) {
        currentWord += word[i];
        if (ctx.measureText(currentWord).width > maxWidth) {
            result.push(currentWord.slice(0, -1));
            currentWord = word[i];
        }
    }

    if (currentWord) {
        result.push(currentWord);
    }

    return result;
}

async function cleanupTempFiles(filePaths) {
    for (const filePath of filePaths) {
        if (fs.existsSync(filePath)) {
            await fsp.unlink(filePath).catch((err) => {
                console.error(`Không thể xóa tệp tạm: ${err}`);
            });
        }
    }
}
