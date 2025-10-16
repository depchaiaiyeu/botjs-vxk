import { appContext } from "../context.js";
import { ZaloApiError } from "../Errors/ZaloApiError.js";
import { encodeAES, handleZaloResponse, request, makeURL } from "../utils.js";
import { Zalo } from "../index.js";

export function getBlockedGroupMembersFactory(api) {
  const serviceURL = makeURL("https://tt-group-wpa.chat.zalo.me/api/group/blockedmems/list", {
    zpw_ver: "650",
    zpw_type: "30",
  });

  /**
   * Lấy danh sách thành viên bị chặn trong nhóm
   *
   * @param {string|number} threadId - ID của nhóm cần lấy danh sách thành viên bị chặn
   * @throws {ZaloApiError}
   */
  return async function getBlockedGroupMembers(threadId) {
    if (!threadId || typeof threadId !== "string") {
        throw new ZaloApiError("❌ Tham số threadId không hợp lệ.");
    }
    if (!appContext.secretKey) throw new ZaloApiError("Secret key is not available");
    if (!appContext.imei) throw new ZaloApiError("IMEI is not available");
    if (!appContext.cookie) throw new ZaloApiError("Cookie is not available");
    if (!appContext.userAgent) throw new ZaloApiError("User agent is not available");

    const params = {
      grid: String(threadId),
      imei: appContext.imei,
    };
    const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");
    const response = await request(`${serviceURL}&params=${encodeURIComponent(encryptedParams)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": appContext.userAgent,
        Cookie: appContext.cookie,
      },
    });

    const result = await handleZaloResponse(response);
    if (result.error) throw new ZaloApiError(result.error.message, result.error.code);

    return result.data;
  };
}
