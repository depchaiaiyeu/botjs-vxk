import jsQR from "jsqr";
import { createCanvas, loadImage } from "canvas";
import { imageBufferCache } from "../../utils/image-buffer-cache.js";
import { getGlobalPrefix } from "../service.js";
import { removeMention } from "../../utils/format-util.js";
import { checkExstentionFileRemote, checkLinkIsValid } from "../../utils/util.js";
import { sendMessageCompleteRequest, sendMessageWarningRequest } from "../chat-zalo/chat-style/chat-style.js";

const TIME_SHOW_SCAN_QR = 600000;
/**
 * Quét và phân tích nội dung QR code từ hình ảnh
 * @param {string} imageUrl Đường dẫn đến file ảnh
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function scanQRCode(imageUrl) {
  try {
    const imageBuffer = await imageBufferCache.getBuffer(imageUrl);
    const image = await loadImage(imageBuffer);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, image.width, image.height);

    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (!code) {
      return {
        success: false,
        error: "Không tìm thấy QRCode trong ảnh"
      };
    }

    const qrData = parseQRContent(code.data);

    return {
      success: true,
      data: qrData
    };

  } catch (error) {
    console.error("Lỗi khi quét mã QRCode:", error);
    return {
      success: false,
      error: "Lỗi khi xử lý ảnh QRCode"
    };
  }
}

/**
 * Phân tích nội dung trong mã QR
 */
function parseQRContent(content) {
  try {
    if (content.includes("bankid=")) {
      const params = new URLSearchParams(content);

      return {
        type: "bank_transfer",
        bankId: params.get("bankid"),
        accountNumber: params.get("account"),
        accountName: params.get("name")
      };
    }

    return {
      type: "text",
      content: content
    };

  } catch (error) {
    console.error("Lỗi khi phân tích nội dung QRCode:", error);
    return {
      type: "unknown",
      content: content
    };
  }
}
