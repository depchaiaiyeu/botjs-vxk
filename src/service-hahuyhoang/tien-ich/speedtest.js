import speedTest from 'speedtest-net';
import { sendMessageCompleteRequest, sendMessageTag } from '../chat-zalo/chat-style/chat-style.js';
import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from "canvas";
import * as cv from "../../utils/canvas/index.js";
import { deleteFile, loadImageBuffer } from '../../utils/util.js';
import { formatDate } from '../../utils/format-util.js';

const TIME_TO_LIVE_MESSAGE = 600000;
const TEST_DURATION = 20000;

const FIXED_LOGO_URL = "https://i.pinimg.com/474x/d6/df/ed/d6dfedf59e840c71eab20e5f3e594450.jpg";

let isTestingSpeed = false;
let currentTester = {
    id: null,
    threadId: null,
    name: null
};
let otherThreadRequester = {};

function evaluateSpeed(speedInMBps) {
    if (speedInMBps < 0.625) return "Rất chậm";
    if (speedInMBps < 1.25) return "Chậm";
    if (speedInMBps < 3.75) return "Trung bình";
    if (speedInMBps < 6.25) return "Khá tốt";
    if (speedInMBps < 12.5) return "Tốt";
    if (speedInMBps < 62.5) return "Rất tốt";
    return "Siêu tốc";
}

export async function createSpeedTestImage(result) {
    const width = 1000;
    const height = 430;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    try {
        const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
        backgroundGradient.addColorStop(0, "#3B82F6");
        backgroundGradient.addColorStop(1, "#111827");
        ctx.fillStyle = backgroundGradient;
        ctx.fillRect(0, 0, width, height);
    } catch (error) {
        console.error("Lỗi khi vẽ background gradient:", error);
        ctx.fillStyle = "#111827";
        ctx.fillRect(0, 0, width, height);
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, width, height);

    let yTitleTop = 60;
    ctx.textAlign = "center";
    ctx.font = "bold 48px BeVietnamPro";
    ctx.fillStyle = cv.getRandomGradient(ctx, width);
    ctx.fillText("Kết Quả SpeedTest", width / 2, yTitleTop);

    let xLogo = 170;
    let widthLogo = 180;
    let heightLogo = 180;
    let yLogo = 100;

    const borderWidth = 10;
    const gradient = ctx.createLinearGradient(
        xLogo - widthLogo / 2 - borderWidth,
        yLogo - borderWidth,
        xLogo + widthLogo / 2 + borderWidth,
        yLogo + heightLogo + borderWidth
    );

    const rainbowColors = [
        "#FF0000", "#FF7F00", "#FFFF00", "#00FF00",
        "#0000FF", "#4B0082", "#9400D3"
    ];
    const shuffledColors = [...rainbowColors].sort(() => Math.random() - 0.5);
    shuffledColors.forEach((color, index) => {
        gradient.addColorStop(index / (shuffledColors.length - 1), color);
    });

    ctx.save();
    ctx.beginPath();
    ctx.arc(
        xLogo,
        yLogo + heightLogo / 2,
        widthLogo / 2 + borderWidth,
        0,
        Math.PI * 2,
        true
    );
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(
        xLogo,
        yLogo + heightLogo / 2,
        widthLogo / 2,
        0,
        Math.PI * 2,
        true
    );
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.restore();

    try {
        const imageBuffer = await loadImageBuffer(FIXED_LOGO_URL);
        const image = await loadImage(imageBuffer);

        ctx.save();
        ctx.beginPath();
        ctx.arc(
            xLogo,
            yLogo + heightLogo / 2,
            widthLogo / 2,
            0,
            Math.PI * 2,
            true
        );
        ctx.clip();

        const diameter = widthLogo;
        const squareSize = Math.min(image.width, image.height);
        const cropX = (image.width - squareSize) / 2;
        const cropY = (image.height - squareSize) / 2;
        
        ctx.drawImage(
            image,
            cropX, cropY, squareSize, squareSize,
            xLogo - diameter / 2,
            yLogo + heightLogo / 2 - diameter / 2,
            diameter,
            diameter
        );
        ctx.restore();
    } catch (error) {
        console.error("Lỗi khi vẽ logo cố định:", error);
        ctx.fillStyle = "#CCCCCC";
        ctx.font = "bold 20px Arial";
        ctx.textAlign = "center";
        ctx.fillText("Logo Error", xLogo, yLogo + heightLogo / 2);
    }

    const ispName = result.isp || "Unknown ISP";
    const [nameLine1, nameLine2] = cv.hanldeNameUser(ispName);
    const nameY = yLogo + heightLogo + 54;
    ctx.font = "bold 32px Tahoma";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    if (nameLine2) {
        ctx.font = "bold 24px Tahoma";
        ctx.fillText(nameLine1, xLogo, nameY);
        ctx.font = "bold 24px Tahoma";
        ctx.fillText(nameLine2, xLogo, nameY + 28);
    } else {
        ctx.fillText(nameLine1, xLogo, nameY);
    }

    const infoStartX = xLogo + widthLogo / 2 + 86;
    let y = 110;

    const downloadBandwidthBytes = result.download.bandwidth || 0;
    const uploadBandwidthBytes = result.upload.bandwidth || 0;
    const downloadSpeedMbps = (downloadBandwidthBytes / 125000).toFixed(2);
    const uploadSpeedMbps = (uploadBandwidthBytes / 125000).toFixed(2);
    const downloadSpeedMBps = (downloadBandwidthBytes / 1000000).toFixed(2);
    const uploadSpeedMBps = (uploadBandwidthBytes / 1000000).toFixed(2);
    const ping = Math.round(result.ping?.latency || 0);

    const fields = [
        { label: "📥 Download", value: `${downloadSpeedMbps} MB/s (${evaluateSpeed(parseFloat(downloadSpeedMBps))} 🚀)` },
        { label: "📤 Upload", value: `${uploadSpeedMbps} MB/s (${evaluateSpeed(parseFloat(uploadSpeedMBps))} 🚀)` },
        { label: "💬 Ping", value: `${ping}ms` },
        { label: "🌐 Server", value: `${result.server?.name || 'N/A'}` },
        { label: "🌍 Location", value: `${result.server?.location || 'N/A'} (${result.server?.country || 'N/A'})` },
        { label: "💻 VPN", value: `${result.interface?.isVpn ? "Có VPN" : "Không VPN"}` },
        { label: "🕐 Time", value: `${formatDate(new Date(result.timestamp || Date.now()))}` },
    ];

    ctx.textAlign = "left";
    ctx.font = "bold 26px BeVietnamPro";
    const lineHeight = 42;

    for (const field of fields) {
        ctx.fillStyle = cv.getRandomGradient(ctx, width);
        ctx.fillText(field.label + ": " + field.value, infoStartX, y);
        y += lineHeight;
    }

    const filePath = path.resolve(`./assets/temp/speedtest_${Date.now()}.png`);
    const out = fs.createWriteStream(filePath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    return new Promise((resolve, reject) => {
        out.on("finish", () => resolve(filePath));
        out.on("error", reject);
    });
}

export async function handleSpeedTestCommand(api, message) {
    const senderId = message.data.uidFrom;
    const senderName = message.data.dName;
    const threadId = message.threadId;

    if (isTestingSpeed) {
        await sendMessageCompleteRequest(api, message, {
            caption: `Hiện tại bot đang thực hiện kiểm tra tốc độ mạng theo yêu cầu của ${currentTester.name}. Vui lòng đợi kết quả.`,
        }, 30000);
        if (threadId !== currentTester.threadId && !otherThreadRequester[threadId]) {
            otherThreadRequester[threadId] = {
                name: senderName,
                id: senderId,
                type: message.type
            };
        }
        return;
    }

    let imagePath = null;

    try {
        isTestingSpeed = true;
        currentTester = {
            id: senderId,
            name: senderName,
            threadId: threadId
        };

        await sendMessageCompleteRequest(api, message, {
            caption: `Bắt đầu kiểm tra tốc độ mạng, vui lòng chờ...`,
        }, TEST_DURATION);

        const result = await speedTest({
            acceptLicense: true,
            acceptGdpr: true
        });

        imagePath = await createSpeedTestImage(result);

        await sendMessageTag(api, message, {
            caption: `Kết quả kiểm tra tốc độ mạng của bot !`,
            imagePath
        }, TIME_TO_LIVE_MESSAGE);

        for (const threadId in otherThreadRequester) {
            if (threadId !== currentTester.threadId) {
                await sendMessageTag(api, {
                    threadId,
                    type: otherThreadRequester[threadId].type,
                    data: {
                        uidFrom: otherThreadRequester[threadId].id,
                        dName: otherThreadRequester[threadId].name
                    }
                }, {
                    caption: `Đây là kết quả kiểm tra tốc độ mạng của bot!`,
                    imagePath
                }, TIME_TO_LIVE_MESSAGE);
            }
        }

    } catch (error) {
        console.error('Lỗi khi test tốc độ mạng:', error);

        await sendMessageCompleteRequest(api, message, {
            caption: `Đã xảy ra lỗi khi kiểm tra tốc độ mạng. Vui lòng thử lại sau.`
        }, 30000);
    } finally {
        isTestingSpeed = false;
        currentTester = {
            id: null,
            name: null,
            threadId: null
        };
        otherThreadRequester = {};
        if (imagePath) {
             deleteFile(imagePath);
        }
    }
}
