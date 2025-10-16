import { Zalo, ZaloApiError } from "../index.js";
import { appContext } from "../context.js"; 
import { encodeAES, handleZaloResponse, makeURL, request } from "../utils.js";

export function sendCallVoiceFactory(api) {
  const callURL1 = makeURL(`${api.zpwServiceMap.voice_call[0]}/api/voicecall/requestcall`, {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: 24,
  });

  const callURL2 = makeURL(`${api.zpwServiceMap.voice_call[0]}/api/voicecall/request`, {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: 24,
  });

  return async function sendCallVoice(targetId) {
    if (!appContext.imei || !appContext.secretKey) {
      throw new ZaloApiError("Missing required app context fields");
    }
    const randomId = Math.floor(Date.now() / 1000);
    const params1 = {
      calleeId: targetId,
      callId: randomId,
      codec: "[]\n",
      typeRequest: 1,
      imei: appContext.imei,
    };
    const encryptedParams1 = encodeAES(appContext.secretKey, JSON.stringify(params1));
    if (!encryptedParams1) throw new ZaloApiError("Failed to encrypt params");
    const response1 = await request(callURL1, {
      method: "POST",
      body: new URLSearchParams({ params: encryptedParams1 }),
    });

    const result1 = await handleZaloResponse(response1, appContext);
    if (result1.error) throw new ZaloApiError(result1.error.message, result1.error.code);

    const params2 = {
      calleeId: targetId,
      rtcpAddress: result1.data.rtcpIP,
      rtpAddress: result1.data.rtpIP,
      codec: JSON.stringify([
        {
          dynamicFptime: 0,
          frmPtime: 20,
          name: "opus/16000/1",
          payload: 112,
        },
      ]),
      session: result1.data.sessId,
      callId: randomId,
      imei: appContext.imei,
      subCommand: 3,
    };

    const encryptedParams2 = encodeAES(appContext.secretKey, JSON.stringify(params2));
    if (!encryptedParams2) throw new ZaloApiError("Failed to encrypt call params");

    const response2 = await request(callURL2, {
      method: "POST",
      body: new URLSearchParams({ params: encryptedParams2 }),
    });

    const result2 = await handleZaloResponse(response2, appContext);
    if (result2.error) throw new ZaloApiError(result2.error.message, result2.error.code);

    return result2.data;
  };
}
