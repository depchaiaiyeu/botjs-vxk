import { appContext } from "../context.js";
import { ZaloApiError } from "../Errors/ZaloApiError.js";
import { handleZaloResponse, request, makeURL } from "../utils.js";

export function updateZaloNameFactory(api) {
  const serviceURL = makeURL("https://tt-profile-wpa.chat.zalo.me/api/social/profile/update", {
    zpw_ver: "652",
    zpw_type: "30",
  });

  /**
   * Đổi tên profile trên Zalo
   *
   * @param {string} newName - Tên mới cần cập nhật
   * @throws {ZaloApiError}
   */
  return async function updateZaloName(newName) {
    if (!newName || typeof newName !== "string" || newName.length > 30) {
      throw new ZaloApiError("❌ Tên mới không hợp lệ hoặc quá dài.");
    }

    if (!appContext.cookie) throw new ZaloApiError("🍪 Cookie không hợp lệ hoặc đã hết hạn.");
    if (!appContext.userAgent) throw new ZaloApiError("🖥️ User-Agent không hợp lệ.");

    console.log(`🔄 Đang đổi tên Zalo thành: ${newName}`);

    // Gửi request đổi tên
    const response = await request(serviceURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": appContext.userAgent,
        "Accept": "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://chat.zalo.me",
        "Referer": "https://chat.zalo.me/",
        "Cookie": appContext.cookie,
      },
      body: new URLSearchParams({
        zpw_ver: "652",
        zpw_type: "30",
        displayName: newName, // 🛠 Gửi tên mới thẳng, không mã hóa!
      }).toString(),
    });

    console.log("📩 Phản hồi từ API:", response);

    // Xử lý phản hồi từ API
    const result = await handleZaloResponse(response);
    console.log("📌 Kết quả sau khi xử lý:", result);

    if (result.error) {
      console.error("❌ API báo lỗi:", result.error);
      throw new ZaloApiError(result.error.message, result.error.code);
    }

    return result.data;
  };
}
