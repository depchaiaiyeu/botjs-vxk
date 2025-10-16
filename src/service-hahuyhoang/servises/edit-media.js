import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { sendMessageWarningRequest, sendMessageCompleteRequest } from "../chat-zalo/chat-style/chat-style.js";
import { checkExstentionFileRemote, downloadFile, deleteFile } from "../../utils/util.js";
import { getGlobalPrefix } from "../service.js";
import { removeMention } from "../../utils/format-util.js";
import { uploadAudioFile } from "../chat-zalo/chat-special/send-voice/process-audio.js";
import { sendVoiceMusic } from "../chat-zalo/chat-special/send-voice/send-voice.js";

const RESOURCE_BASE_PATH = path.join(process.cwd(), "assets", "resources", "editcut");
if (!fs.existsSync(RESOURCE_BASE_PATH)) {
    fs.mkdirSync(RESOURCE_BASE_PATH, { recursive: true });
}

function isValidMediaUrl(url) {
    return url && (url.startsWith("http://") || url.startsWith("https://"));
}

function extractFileUrl(message) {
    const quote = message.data?.quote || message.reply_message;
    if (!quote) return null;
    
    try {
        const attachData = JSON.parse(quote.attach);
        return attachData?.href?.trim() || null;
    } catch (error) {
        console.error("Lỗi khi parse dữ liệu attach:", error);
        return null;
    }
}

async function cutAudio(inputPath, outputPath, startTime, endTime, fadeDuration, speed) {
    return new Promise((resolve, reject) => {
        let fadeIn = fadeDuration ? `afade=t=in:ss=0:d=${fadeDuration}` : "";
        let fadeOut = fadeDuration ? `afade=t=out:st=${parseFloat(endTime) - fadeDuration}:d=${fadeDuration}` : "";
        let fadeFilter = [fadeIn, fadeOut].filter(Boolean).join(",");
        let speedFilter = speed ? `atempo=${speed}` : "";
        let filter = [fadeFilter, speedFilter].filter(Boolean).join(",");
        let command = `ffmpeg -i "${inputPath}" -ss ${startTime} -to ${endTime} ${filter ? `-af "${filter}"` : ""} "${outputPath}"`;
        
        exec(command, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve(outputPath);
            }
        });
    });
}

async function cutVideo(inputPath, outputPath, startTime, endTime, speed) {
    return new Promise((resolve, reject) => {
        let speedFilter = speed ? `setpts=${1 / speed}*PTS` : "";
        let command = `ffmpeg -i "${inputPath}" -ss ${startTime} -to ${endTime} ${speedFilter ? `-vf "${speedFilter}"` : "-c copy"} "${outputPath}"`;
        
        exec(command, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve(outputPath);
            }
        });
    });
}

export async function processEditAudioCommand(api, message, aliasCommand) {
    try {
        const prefix = getGlobalPrefix();
        const content = removeMention(message).replace(`${prefix}${aliasCommand}`, "").trim();
        const fileUrl = extractFileUrl(message);
        
        if (!fileUrl || !(await checkExstentionFileRemote(fileUrl, [".mp3", ".wav", ".aac"]))) {
            await sendMessageWarningRequest(api, message, { caption: "Bạn cần reply vào một file audio hợp lệ để cắt!" }, 30000);
            return;
        }

        const match = content.match(/(\d{1,2}:\d{2}) (\d{1,2}:\d{2})(?: -v (\d+))?(?: x([0-9.]+))?/);
        if (!match) {
            await sendMessageWarningRequest(api, message, { caption: `Sai cú pháp! Vui lòng dùng: ${prefix}${aliasCommand} <bắt đầu> <kết thúc> [-v giây] [x tốc độ]` }, 30000);
            return;
        }
        const startTime = match[1];
        const endTime = match[2];
        const fadeDuration = match[3] ? parseInt(match[3]) : null;
        const speed = match[4] ? parseFloat(match[4]) : null;

        const inputPath = path.join(RESOURCE_BASE_PATH, "temp_audio.mp3");
        const outputPath = path.join(RESOURCE_BASE_PATH, "cut_audio.mp3");
        await downloadFile(fileUrl, inputPath);
        await cutAudio(inputPath, outputPath, startTime, endTime, fadeDuration, speed);
        
        const uploadedFileUrl = await uploadAudioFile(outputPath, api, message);
        if (uploadedFileUrl) {
            await sendVoiceMusic(api, message, { voiceUrl: uploadedFileUrl, caption: `Đây là voice sau khi cắt từ đoạn ${startTime} tới ${endTime}` }, 1800000);
        } else {
            throw new Error("Upload audio thất bại.");
        }
        deleteFile(inputPath);
        deleteFile(outputPath);
    } catch (error) {
        console.error("Lỗi xử lý lệnh edit audio:", error);
    }
}

export async function processEditVideoCommand(api, message, aliasCommand) {
    try {
        const prefix = getGlobalPrefix();
        const content = removeMention(message).replace(`${prefix}${aliasCommand}`, "").trim();
        const fileUrl = extractFileUrl(message);
        
        if (!fileUrl || !(await checkExstentionFileRemote(fileUrl, [".mp4", ".mkv", ".avi"]))) {
            await sendMessageWarningRequest(api, message, { caption: "Bạn cần reply vào một video hợp lệ để cắt!" }, 30000);
            return;
        }

        const match = content.match(/(\d{1,2}:\d{2}) (\d{1,2}:\d{2})(?: x([0-9.]+))?/);
        if (!match) {
            await sendMessageWarningRequest(api, message, { caption: `Sai cú pháp! Vui lòng dùng: ${prefix}${aliasCommand} <bắt đầu> <kết thúc> [x tốc độ]` }, 30000);
            return;
        }
        const startTime = match[1];
        const endTime = match[2];
        const speed = match[3] ? parseFloat(match[3]) : null;

        const inputPath = path.join(RESOURCE_BASE_PATH, "temp_video.mp4");
        const outputPath = path.join(RESOURCE_BASE_PATH, "cut_video.mp4");
        await downloadFile(fileUrl, inputPath);
        await cutVideo(inputPath, outputPath, startTime, endTime, speed);
        
        const uploadResult = await api.uploadAttachment([outputPath], message.threadId, message.type);
        if (uploadResult && uploadResult.length > 0) {
            const videoUrl = uploadResult[0].fileUrl;
            await api.sendVideo({
                videoUrl,
                threadId: message.threadId,
                threadType: message.type,
                message: { text: `Đây là video sau khi cắt từ đoạn ${startTime} tới ${endTime}` },
                ttl: 600000
            });
        } else {
            throw new Error("Upload video thất bại.");
        }
        deleteFile(inputPath);
        deleteFile(outputPath);
    } catch (error) {
        console.error("Lỗi xử lý lệnh edit video:", error);
    }
}
