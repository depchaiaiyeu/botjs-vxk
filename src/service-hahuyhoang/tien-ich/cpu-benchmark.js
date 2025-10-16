import si from 'systeminformation';
import { sendMessageCompleteRequest, sendMessageTag } from '../chat-zalo/chat-style/chat-style.js';
import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from "canvas";
import * as cv from "../../utils/canvas/index.js";
import { deleteFile, loadImageBuffer } from '../../utils/util.js';
import { formatDate } from '../../utils/format-util.js';
import os from 'os';

const TIME_TO_LIVE_MESSAGE = 600000;
const CPU_TEST_DURATION = 3000;

const CPU_LOGOS = {
    "Intel": "https://upload.wikimedia.org/wikipedia/commons/7/7d/Intel_logo_%282006-2020%29.svg",
    "AMD": "https://upload.wikimedia.org/wikipedia/commons/7/7c/AMD_Logo.svg",
    "Apple": "https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg",
    "ARM": "https://upload.wikimedia.org/wikipedia/commons/0/02/Arm_logo_2017.svg",
    "Qualcomm": "https://upload.wikimedia.org/wikipedia/commons/f/f8/Qualcomm-Logo.svg"
};

let isTestingCPU = false;
let currentTester = {
    id: null,
    threadId: null,
    name: null
};
let otherThreadRequester = {};

function getCPULogo(cpuBrand) {
    const brand = cpuBrand.toUpperCase();
    if (brand.includes('INTEL')) return CPU_LOGOS.Intel;
    if (brand.includes('AMD')) return CPU_LOGOS.AMD;
    if (brand.includes('APPLE')) return CPU_LOGOS.Apple;
    if (brand.includes('ARM')) return CPU_LOGOS.ARM;
    if (brand.includes('QUALCOMM')) return CPU_LOGOS.Qualcomm;
    return null;
}

async function performCPUBenchmark() {
    const startTime = Date.now();
    let operations = 0;
    
    while (Date.now() - startTime < CPU_TEST_DURATION) {
        let result = 0;
        for (let i = 0; i < 1000; i++) {
            result += Math.sqrt(i) * Math.sin(i) * Math.cos(i);
        }
        operations++;
    }
    
    const singleThreadScore = operations;
    
    const cpuCount = os.cpus().length;
    const promises = [];
    
    for (let i = 0; i < cpuCount; i++) {
        promises.push(new Promise((resolve) => {
            const startTime = Date.now();
            let ops = 0;
            
            while (Date.now() - startTime < CPU_TEST_DURATION) {
                let result = 0;
                for (let j = 0; j < 1000; j++) {
                    result += Math.sqrt(j) * Math.sin(j) * Math.cos(j);
                }
                ops++;
            }
            resolve(ops);
        }));
    }
    
    const results = await Promise.all(promises);
    const multiThreadScore = results.reduce((a, b) => a + b, 0);
    
    return {
        singleThread: singleThreadScore,
        multiThread: multiThreadScore
    };
}

export async function createCPUBenchmarkImage(result) {
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
    ctx.fillText("Kết Quả Benchmark CPU", width / 2, yTitleTop);

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

    const cpuLogoUrl = getCPULogo(result.cpuBrand);
    
    try {
        const imageBuffer = await loadImageBuffer(cpuLogoUrl || result.cpuLogo);
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
        console.error("Lỗi khi vẽ logo CPU:", error);
        ctx.fillStyle = "#CCCCCC";
        ctx.font = "bold 20px Arial";
        ctx.textAlign = "center";
        ctx.fillText("CPU", xLogo, yLogo + heightLogo / 2);
    }

    const cpuName = result.cpuModel || "Unknown CPU";
    const [nameLine1, nameLine2] = cv.hanldeNameUser(cpuName);
    const nameY = yLogo + heightLogo + 54;
    ctx.font = "bold 36px Tahoma";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    if (nameLine2) {
        ctx.font = "bold 28px Tahoma";
        ctx.fillText(nameLine1, xLogo, nameY);
        ctx.font = "bold 28px Tahoma";
        ctx.fillText(nameLine2, xLogo, nameY + 32);
    } else {
        ctx.fillText(nameLine1, xLogo, nameY);
    }

    const infoStartX = xLogo + widthLogo / 2 + 86;
    let y = 130;

    const fields = [
        { label: "⚙️ Số Lõi CPU Hiện Có", value: `${result.cores}` },
        { label: "💡 Tốc Độ CPU", value: `${result.speed} GHz` },
        { label: "💡 CPU Công Suất Test", value: `${result.usage}%` },
        { label: "🎮💻 Đơn luồng", value: `${result.singleThread.toLocaleString()} ops` },
        { label: "🎮💻 Đa luồng", value: `${result.multiThread.toLocaleString()} ops` },
        { label: "💡 Số Lõi Hiệu Quả Ước Tính", value: `${result.effectiveCores}` },
        { label: "⏱️ Thời Gian Test", value: `${result.testDuration}ms` },
    ];

    ctx.textAlign = "left";
    ctx.font = "bold 28px BeVietnamPro";
    const lineHeight = 42;

    for (const field of fields) {
        ctx.fillStyle = cv.getRandomGradient(ctx, width);
        ctx.fillText(field.label + ": " + field.value, infoStartX, y);
        y += lineHeight;
    }

    const filePath = path.resolve(`./assets/temp/cpubenchmark_${Date.now()}.png`);
    const out = fs.createWriteStream(filePath);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    return new Promise((resolve, reject) => {
        out.on("finish", () => resolve(filePath));
        out.on("error", reject);
    });
}

export async function handleCPUBenchmarkCommand(api, message) {
    const senderId = message.data.uidFrom;
    const senderName = message.data.dName;
    const threadId = message.threadId;

    if (isTestingCPU) {
        await sendMessageCompleteRequest(api, message, {
            caption: `Hiện tại bot đang thực hiện benchmark CPU theo yêu cầu của ${currentTester.name}. Vui lòng đợi kết quả.`,
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
        isTestingCPU = true;
        currentTester = {
            id: senderId,
            name: senderName,
            threadId: threadId
        };

        await sendMessageCompleteRequest(api, message, {
            caption: `Bắt đầu benchmark CPU, vui lòng chờ...`,
        }, CPU_TEST_DURATION + 5000);

        const cpuInfo = await si.cpu();
        const cpuSpeed = await si.cpuCurrentSpeed();
        const cpuLoad = await si.currentLoad();
        
        const benchmarkResult = await performCPUBenchmark();

        const result = {
            cpuModel: cpuInfo.brand,
            cpuBrand: cpuInfo.manufacturer,
            cpuLogo: getCPULogo(cpuInfo.manufacturer),
            cores: cpuInfo.cores,
            speed: cpuSpeed.max ? (cpuSpeed.max / 1000).toFixed(2) : (cpuSpeed.avg / 1000).toFixed(2),
            usage: cpuLoad.currentLoad.toFixed(2),
            singleThread: Math.round(benchmarkResult.singleThread),
            multiThread: Math.round(benchmarkResult.multiThread),
            effectiveCores: (benchmarkResult.multiThread / benchmarkResult.singleThread).toFixed(2),
            testDuration: CPU_TEST_DURATION,
            timestamp: Date.now()
        };

        imagePath = await createCPUBenchmarkImage(result);

        await sendMessageTag(api, message, {
            caption: `Kết quả benchmark CPU của bot!`,
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
                    caption: `Đây là kết quả benchmark CPU của bot!`,
                    imagePath
                }, TIME_TO_LIVE_MESSAGE);
            }
        }

    } catch (error) {
        console.error('Lỗi khi benchmark CPU:', error);

        await sendMessageCompleteRequest(api, message, {
            caption: `Đã xảy ra lỗi khi benchmark CPU. Vui lòng thử lại sau.`
        }, 30000);
    } finally {
        isTestingCPU = false;
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
