import { Zalo, ZaloApiError } from "../index.js";

import { appContext } from "../context.js";

import { encodeAES, handleZaloResponse, request, makeURL } from "../utils.js";



export function addFriendFactory(api) {

  const serviceURL = makeURL(`${api.zpwServiceMap.friend[0]}/api/friend/add`, {

    zpw_ver: Zalo.API_VERSION,

    zpw_type: Zalo.API_TYPE,

  });



  return async function addFriend(userId, message = "") {

    if (!appContext.secretKey) throw new ZaloApiError("Secret key is not available");

    if (!appContext.imei) throw new ZaloApiError("IMEI is not available");

    if (!appContext.cookie) throw new ZaloApiError("Cookie is not available");

    if (!appContext.userAgent) throw new ZaloApiError("User agent is not available");



    const params = {

      user_id: String(userId),

      message: message,

      imei: appContext.imei,

    };



    const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));

    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");



    const response = await request(serviceURL, {

      method: "POST",

      body: new URLSearchParams({

        params: encryptedParams,

      }),

    });



    const result = await handleZaloResponse(response);

    if (result.error) throw new ZaloApiError(result.error.message, result.error.code);



    return result.data;

  };

}

