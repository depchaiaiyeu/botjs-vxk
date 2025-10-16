import FormData from "form-data";
import fs from "node:fs";
import { appContext } from "../context.js";
import { ZaloApiError } from "../Errors/ZaloApiError.js";
import { encodeAES, getFullTimeFromMilisecond, getImageMetaData, handleZaloResponse, request, makeURL } from "../utils.js";
import { Zalo } from "../index.js";

export function updateProfileAvatarFactory() {
  return async function updateProfileAvatar(avatarPath) {
    if (!appContext.secretKey) throw new ZaloApiError("Secret key is not available");
    if (!appContext.imei) throw new ZaloApiError("IMEI is not available");
    if (!appContext.cookie) throw new ZaloApiError("Cookie is not available");
    if (!appContext.userAgent) throw new ZaloApiError("User agent is not available");

    if (!avatarPath) throw new ZaloApiError("Missing avatarPath");

    const imageMetaData = await getImageMetaData(avatarPath);
    const params = {
      head: 0, // Giá trị này có thể cần thay đổi tùy theo API
      c: 0,     // Giá trị này có thể cần thay đổi tùy theo API
      clientId: `u${appContext.userId || ''}${getFullTimeFromMilisecond(new Date().getTime())}`, // Giả sử bạn lưu userId trong appContext
      width: imageMetaData.width || 1080, // Kích thước mặc định
      height: imageMetaData.height || 1080, // Kích thước mặc định
      imei: appContext.imei,
    };

    const formData = new FormData();
    formData.append("fileContent", fs.readFileSync(avatarPath), {
      filename: "avatar.jpg", // Tên file, bạn có thể thay đổi
      contentType: "image/jpeg", // Hoặc image/png tùy vào định dạng ảnh
    });

    const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    // Sử dụng makeURL ở đây
    const serviceURL = makeURL("https://tt-profile-wpa.chat.zalo.me/api/profile/upload/avatar", {
      zpw_ver: Zalo.API_VERSION,
      zpw_type: Zalo.API_TYPE,
      params: encryptedParams
    });

    const response = await request(serviceURL, {
      method: "POST",
      headers: {
        ...formData.getHeaders(),
        "Content-Type": "multipart/form-data", // Quan trọng
        "Cookie": appContext.cookie,
      },
      body: formData,
      duplex: 'half',
    });

    console.log("Response từ API:", await response.clone().text());

    const result = await handleZaloResponse(response);

    if (result.error_code !== 0) {
        throw new ZaloApiError(result.error_message, result.error_code);
      }
  
      // GIẢI MÃ VÀ TRẢ VỀ DỮ LIỆU (NẾU CÓ)
      try {
        if (result.data) {
          const decryptedData = decodeAES(appContext.secretKey, result.data);
          console.log("Dữ liệu đã giải mã:", decryptedData);
          result.data = JSON.parse(decryptedData);
        }
      } catch (error) {
        console.error("Lỗi giải mã data:", error);
        throw new ZaloApiError("Failed to decrypt data", 1);
      }
  
      return result.data; // HOẶC return result (nếu bạn không cần giải mã data)
    };
}