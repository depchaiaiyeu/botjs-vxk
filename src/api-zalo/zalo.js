import { getOwnId } from "./apis/getOwnId.js";
import { Listener } from "./apis/listen.js";
import { getServerInfo, login } from "./apis/login.js";
import { appContext } from "./context.js";
import { logger, makeURL } from "./utils.js";
import { addReactionFactory } from "./apis/addReaction.js";
import { addUserToGroupFactory } from "./apis/addUserToGroup.js";
import { changeGroupAvatarFactory } from "./apis/changeGroupAvatar.js";
import { changeGroupNameFactory } from "./apis/changeGroupName.js";
import { createGroupFactory } from "./apis/createGroup.js";
import { findUserFactory } from "./apis/findUser.js";
import { getGroupInfoFactory } from "./apis/getGroupInfo.js";
import { getStickersFactory } from "./apis/getStickers.js";
import { getStickersDetailFactory } from "./apis/getStickersDetail.js";
import { removeUserFromGroupFactory } from "./apis/removeUserFromGroup.js";
import { sendStickerFactory } from "./apis/sendSticker.js";
import { undoMessageFactory } from "./apis/undoMessage.js";
import { uploadAttachmentFactory } from "./apis/uploadAttachment.js";
import { checkUpdate } from "./update.js";
import { sendMessageFactory } from "./apis/sendMessage.js";
import { sendMessageFactoryv1 } from "./apis/sendMessagebug.js";
import { getCookieFactory } from "./apis/getCookie.js";
import { removeMessageFactory } from "./apis/deleteMessage.js";
import { getUserInfoFactory } from "./apis/getUserInfo.js";
import { sendVideoFactory } from "./apis/sendVideo.js";
import { getAllFriendsFactory } from "./apis/fetchAllFriend.js";
import { getAllGroupsFactory } from "./apis/fetchAllGroups.js";
import { changeGroupSettingFactory } from "./apis/changeGroupSetting.js";
import { blockUsersInGroupFactory } from "./apis/blockUsersInGroup.js";
import { removeGroupBlockedMemberFactory } from "./apis/removeGroupBlockedMember.js";
import { addGroupAdminsFactory } from "./apis/addGroupAdmins.js";
import { removeGroupAdminsFactory } from "./apis/removeGroupAdmins.js";
import { getQRLinkFactory } from "./apis/getQRZalo.js";
import { sendBusinessCardFactory } from "./apis/sendBusinessCard.js";
import { sendFriendRequestFactory } from "./apis/sendFriendRequest.js";
import { setBotId } from "../index.js";
import { getGroupMembersJoinRequestFactory } from "./apis/getGroupMembersJoinRequest.js";
import { handleGroupPendingMembersFactory } from "./apis/handleGroupPendingMembers.js";
import { changeGroupOwnerFactory } from "./apis/changeGroupOwner.js";
import { leaveGroupFactory } from "./apis/leaveGroup.js";
import { sendCustomStickerFactory } from "./apis/sendCustomerSticker.js";
import { changeGroupLinkFactory } from "./apis/changeGroupLink.js";
import { sendToDoFactory } from "./apis/sendToDo.js";
import { getRecentMessageFactory } from "./apis/getRecentMessage.js";
import { parseLinkFactory } from "./apis/parseLink.js";
import { sendLinkFactory } from "./apis/sendLink.js";
import { sendVoiceFactory } from "./apis/sendVoice.js";
import { sendMessagePrivateFactory } from "./apis/sendMessagePrivate.js";
import { joinGroupByLinkFactory } from "./apis/joinGroupByLink.js";
import { getInfoGroupByLinkFactory } from "./apis/getGroupInfoByLink.js";
import { sendBankCardFactory } from "./apis/sendBankCard.js";
import { sendGifFactory } from "./apis/sendGif.js";
import { getGroupMembersFactory } from "./apis/getGroupMembers.js";
import { checkImageFactory } from "./apis/checkImage.js";
import { sendImageFactory } from "./apis/sendImage.js";
import { sendFileFactory } from "./apis/sendFile.js";
import { uploadThumbnailFactory } from "./apis/uploadThumbnail.js";
import { addFriendFactory } from "./apis/addFriend.js";
import { sendVideov2Factory } from "./apis/sendVideov2.js";
import { updateProfileAvatarFactory } from "./apis/updateProfileAvatarFactory.js";
import { getBlockedGroupMembersFactory } from "./apis/getBlockMemberList.js";
import { sendMessageForwardFactory } from "./apis/sendMessageForward.js";
import { updateZaloNameFactory } from "./apis/changProfileName.js";
import { sendCallVoiceFactory } from "./apis/sendCallVoice.js";
import { uploadToZCloudFactory } from "./apis/zcloudUploadFactory.js";
import { callGroupFactory } from "./apis/callGroup.js";

class Zalo {
  constructor(credentials, options) {
    this.enableEncryptParam = true;
    this.validateParams(credentials);
    appContext.imei = credentials.imei;
    appContext.cookie = this.parseCookies(credentials.cookie);
    appContext.userAgent = credentials.userAgent;
    appContext.language = credentials.language || "vi";
    appContext.timeMessage = credentials.timeMessage || 0;
    appContext.secretKey = null;
    if (options) Object.assign(appContext.options, options);
  }

  parseCookies(cookie) {
    if (typeof cookie === "string") return cookie;
    const cookieString = cookie.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    return cookieString;
  }

  validateParams(credentials) {
    if (!credentials.imei || !credentials.cookie || !credentials.userAgent) {
      throw new Error("Missing required params");
    }
  }

  async login() {
    await checkUpdate();
    const loginData = await login(this.enableEncryptParam);
    const serverInfo = await getServerInfo(this.enableEncryptParam);
    if (!loginData || !serverInfo) throw new Error("Failed to login");
    appContext.secretKey = loginData.data.zpw_enk;
    appContext.uid = loginData.data.uid;
    setBotId(loginData.data.uid);
    appContext.settings = serverInfo.setttings || serverInfo.settings;
    logger.info("Logged in as", loginData.data.uid);
    return new API(
      appContext.secretKey,
      loginData.data.zpw_service_map_v3,
      makeURL(`${loginData.data.zpw_ws[0]}`, {
        zpw_ver: Zalo.API_VERSION,
        zpw_type: Zalo.API_TYPE,
        t: Date.now(),
      })
    );
  }
}

Zalo.API_TYPE = 30;
Zalo.API_VERSION = 647;

class API {
  constructor(secretKey, zpwServiceMap, wsUrl) {
    this.secretKey = secretKey;
    this.zpwServiceMap = zpwServiceMap;
    this.listener = new Listener(wsUrl);
    this.getOwnId = getOwnId;
    this.getStickers = getStickersFactory(this);
    this.getStickersDetail = getStickersDetailFactory(this);
    this.findUser = findUserFactory(this);
    this.uploadAttachment = uploadAttachmentFactory(this);
    this.uploadThumbnail = uploadThumbnailFactory(this);
    this.getGroupInfo = getGroupInfoFactory(this);
    this.createGroup = createGroupFactory(this);
    this.changeGroupAvatar = changeGroupAvatarFactory(this);
    this.removeUserFromGroup = removeUserFromGroupFactory(this);
    this.addUserToGroup = addUserToGroupFactory(this);
    this.changeGroupName = changeGroupNameFactory(this);
    this.getUserInfo = getUserInfoFactory(this);
    this.addReaction = addReactionFactory(this);
    this.sendSticker = sendStickerFactory(this);
    this.undoMessage = undoMessageFactory(this);
    this.sendMessage = sendMessageFactory(this);
    this.sendMessagev1 = sendMessageFactoryv1(this);
    this.getCookie = getCookieFactory();
    this.deleteMessage = removeMessageFactory(this);
    this.sendVideo = sendVideoFactory(this);
    this.getAllFriends = getAllFriendsFactory(this);
    this.getAllGroups = getAllGroupsFactory(this);
    this.changeGroupSetting = changeGroupSettingFactory(this);
    this.blockUsers = blockUsersInGroupFactory(this);
    this.unblockUsers = removeGroupBlockedMemberFactory(this);
    this.addGroupAdmins = addGroupAdminsFactory(this);
    this.removeGroupAdmins = removeGroupAdminsFactory(this);
    this.getQRLink = getQRLinkFactory(this);
    this.sendBusinessCard = sendBusinessCardFactory(this);
    this.sendFriendRequest = sendFriendRequestFactory(this);
    this.getGroupPendingMembers = getGroupMembersJoinRequestFactory(this);
    this.handleGroupPendingMembers = handleGroupPendingMembersFactory(this);
    this.changeGroupOwner = changeGroupOwnerFactory(this);
    this.leaveGroup = leaveGroupFactory(this);
    this.sendCustomSticker = sendCustomStickerFactory(this);
    this.changeGroupLink = changeGroupLinkFactory(this);
    this.sendTodo = sendToDoFactory(this);
    this.getRecentMessages = getRecentMessageFactory(this);
    this.parseLink = parseLinkFactory(this);
    this.sendLink = sendLinkFactory(this);
    this.sendVoice = sendVoiceFactory(this);
    this.sendPrivate = sendMessagePrivateFactory(this);
    this.getGroupInfoByLink = getInfoGroupByLinkFactory(this);
    this.joinGroup = joinGroupByLinkFactory(this);
    this.sendBankCard = sendBankCardFactory(this);
    this.sendGif = sendGifFactory(this);
    this.getGroupMembers = getGroupMembersFactory(this);
    this.checkImage = checkImageFactory();
    this.sendImage = sendImageFactory(this);
    this.sendFile = sendFileFactory(this);
    this.addFriend = addFriendFactory(this);
    this.sendVideov2 = sendVideov2Factory(this);
    this.updateProfileAvatar = updateProfileAvatarFactory(this);
    this.getBlockedGroupMembers = getBlockedGroupMembersFactory(this);
    this.sendMessageForward = sendMessageForwardFactory(this);
    this.updateZaloName = updateZaloNameFactory(this);
    this.sendCallVoice = sendCallVoiceFactory(this);
    this.uploadToZCloud = uploadToZCloudFactory(this);
    this.callGroup = callGroupFactory(this);
  }
}

export { Zalo, API };
