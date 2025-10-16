import { Zalo, ZaloApiError } from "../index.js";
import { appContext } from "../context.js";
import { encodeAES, handleZaloResponse, request, makeURL } from "../utils.js";

export function removeGroupBlockedMemberFactory(api) {
  const serviceURL = makeURL(`${api.zpwServiceMap.group[0]}/api/group/blockedmems/remove`, {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: Zalo.API_TYPE,
  });

  /**
   * Bỏ chặn thành viên trong nhóm theo ID.
   *
   * Client phải là chủ sở hữu của nhóm.
   *
   * @param {string|string[]} memberId - Một hoặc nhiều ID thành viên cần bỏ chặn
   * @param {string|number} groupId - ID của nhóm
   * @throws {ZaloApiError}
   */
  return async function removeGroupBlockedMember(memberId, groupId) {
    if (!appContext.secretKey) throw new ZaloApiError("Secret key is not available");
    if (!appContext.imei) throw new ZaloApiError("IMEI is not available");
    if (!appContext.cookie) throw new ZaloApiError("Cookie is not available");
    if (!appContext.userAgent) throw new ZaloApiError("User agent is not available");

    memberId = Array.isArray(memberId) ? memberId.map(String) : [String(memberId)];

    const params = {
      grid: String(groupId),
      members: memberId,
      imei: appContext.imei,
    };

    const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await request(
      makeURL(serviceURL, {
        params: encryptedParams,
      }),
      {
        method: "GET",
      }
    );

    const result = await handleZaloResponse(response);
    if (result.error) throw new ZaloApiError(result.error.message, result.error.code);

    return result.data;
  };
}
