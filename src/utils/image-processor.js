import jsQR from "jsqr";
import { createCanvas, loadImage } from "canvas";

/**
 * Tìm tất cả các liên kết từ mã QR trong hình ảnh
 * @param {Image} image
 * @returns {string[]} Mảng chứa tất cả các liên kết được tìm thấy, hoặc mảng rỗng nếu không có.
 */
function detectQRLinks(image) {
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const qrCode = jsQR(imageData.data, canvas.width, canvas.height);
    const results = [];
    if (qrCode && qrCode.data) {
        console.log("Tìm thấy mã QR:", qrCode.data);
        results.push(qrCode.data);
    }
    return results;
}

/**
 * Trích xuất các liên kết từ một hình ảnh (đường dẫn)
 * @param {string} imagePath
 * @returns {Promise<string[]>} Promise trả về mảng các liên kết hoặc mảng rỗng nếu có lỗi.
 */
export async function extractLinksFromImage(imagePath) {
    try {
        const image = await loadImage(imagePath);
        if (!image || !image.width || !image.height) {
          throw new Error("Hình ảnh không hợp lệ hoặc không thể tải.");
        }
        const qrLinks = detectQRLinks(image);
        return qrLinks;
    } catch (error) {
        console.error(`Lỗi khi xử lý hình ảnh "${imagePath}":`, error.message);
        return [];
    }
}