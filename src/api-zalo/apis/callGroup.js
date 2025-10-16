import { appContext } from "../context.js";
import { ZaloApiError } from "../Errors/ZaloApiError.js";
import { encodeAES, handleZaloResponse, request } from "../utils.js";
import { Zalo } from "../index.js";

export function callGroupFactory(api) {
  return async function callGroup(groupId, userId, callId = Math.floor(Date.now() / 1000)) {
    if (!appContext.secretKey || !appContext.imei || !appContext.cookie || !appContext.userAgent)
      throw new ZaloApiError("Missing required app context fields");
    if (!groupId || !userId) throw new ZaloApiError("Missing groupId or userId");

    const baseParams = { zpw_ver: Zalo.API_VERSION, zpw_type: Zalo.API_TYPE };

    const firstPayload = {
      params: encodeAES(
        appContext.secretKey,
        JSON.stringify({
          groupId: String(groupId),
          callId,
          typeRequest: 1,
          data: JSON.stringify({
            extraData: "",
            groupAvatar: "",
            groupId: String(groupId),
            groupName: "VuXuanKienServiceBot",
            maxUsers: 8,
            noiseId: [userId],
          }),
          partners: [userId],
        })
      ),
    };

    const firstResponse = await request("https://voicecall-wpa.chat.zalo.me/api/voicecall/group/requestcall", {
      method: "POST",
      body: new URLSearchParams(firstPayload),
    });

    const firstResult = await handleZaloResponse(firstResponse);
    if (firstResult.error) throw new ZaloApiError(firstResult.error.message, firstResult.error.code);

    const decoded1 = firstResult.data?.data ? JSON.parse(firstResult.data.data) : firstResult.data;
    const paramsData = JSON.parse(decoded1?.params || "{}");
    const callSetting = paramsData.callSetting || {};
    const servers = callSetting.servers || [];
    const session = callSetting.session || "";
    const partnerIds = decoded1.partnerIds || [];
    const idCal = Array.isArray(partnerIds) && partnerIds.length ? partnerIds[0] : userId;

    let rtpaddr = "", rtcpaddr = "", rtpaddrIPv6 = "", rtcpaddrIPv6 = "";
    if (servers.length) {
      const srv = servers[0];
      rtpaddr = srv.rtpaddr || "";
      rtcpaddr = srv.rtcpaddr || "";
      rtpaddrIPv6 = srv.rtpaddrIPv6 || "";
      rtcpaddrIPv6 = srv.rtcpaddrIPv6 || "";
    }

    const innerData = `\n{\n\t"groupAvatar" : "",\n\t"groupName" : "VuXuanKienServiceBot",\n\t"hostCall" : ${paramsData.hostCall},\n\t"maxUsers" : ${paramsData.maxUsers || 8},\n\t"noiseId" : ["${idCal}"]\n}\n`;
    const escapedInner = innerData.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const outerData = `\n{\n\t"codec" : "",\n\t"data" : "${escapedInner}",\n\t"extendData" : "",\n\t"rtcpAddress" : "${rtcpaddr}",\n\t"rtcpAddressIPv6" : "${rtcpaddrIPv6}",\n\t"rtpAddress" : "${rtpaddr}",\n\t"rtpAddressIPv6" : "${rtpaddrIPv6}"\n}\n`;

    const secondPayload = {
      params: encodeAES(
        appContext.secretKey,
        JSON.stringify({
          callId: paramsData.callId || callId,
          callType: 1,
          data: outerData,
          session,
          partners: `[ "${idCal}" ]\n`,
          groupId: String(groupId),
        })
      ),
    };

    const secondResponse = await request("https://voicecall-wpa.chat.zalo.me/api/voicecall/group/request", {
      method: "POST",
      body: new URLSearchParams(secondPayload),
    });

    const secondResult = await handleZaloResponse(secondResponse);
    if (secondResult.error)
      throw new ZaloApiError(secondResult.error.message, secondResult.error.code);

    return secondResult.data;
  };
}
