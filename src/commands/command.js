import { handleCheckDomainCommand } from "./utilities-command/check-domain.js";
import { handleStkmemeCommand } from "../service-hahuyhoang/chat-zalo/chat-special/send-sticker/stkmeme-utils.js";

import { writeGroupSettings } from "../utils/io-json.js";
import { handleMuteList, handleMuteUser, handleUnmuteUser } from "../service-hahuyhoang/anti-service/mute-user.js";
import { handleWelcomeBye, handleApprove } from "./bot-manager/welcome-bye.js";
import { handleBlock, handleKick } from "./bot-manager/group-manage.js";
import { handleActiveBotUser, handleActiveGameUser, managerData } from "./bot-manager/active-bot.js";
import { helpCommand, adminCommand, gameInfoCommand } from "./instructions/help.js";

import { askGPTCommand } from "../service-hahuyhoang/api-crawl/content/gpt.js";
import { askGeminiCommand } from "../service-hahuyhoang/api-crawl/assistant-ai/gemini.js";
import { weatherCommand } from "../service-hahuyhoang/api-crawl/content/weather.js";

import { groupInfoCommand } from "../service-hahuyhoang/info-service/group-info.js";
import { userInfoCommand } from "../service-hahuyhoang/info-service/user-info.js";
import { handleRankCommand } from "../service-hahuyhoang/info-service/rank-chat.js";

import { chatAll } from "../service-hahuyhoang/chat-zalo/chat-all.js";
import { sendGifRemote } from "../service-hahuyhoang/chat-zalo/chat-special/send-gif/send-gif.js";
import { handleQrcodeCommand, handleScanQrcodeCommand } from "../service-hahuyhoang/tien-ich/send-qrcode.js";
import { handleCheckPhatNguoiCommand } from "../service-hahuyhoang/tien-ich/check-phat-nguoi.js";
import { handleCheckSimPhongThuyCommand } from "../service-hahuyhoang/tien-ich/phong-thuy-sim.js";

import { duyenphan , tamdauyhop, tuonglai } from "../service-hahuyhoang/tien-ich/boi-tinh-yeu.js";
import { handlejointagCommand } from "../service-hahuyhoang/tien-ich/jointag.js";
import { handleAttackboxCommand } from "../service-hahuyhoang/tien-ich/attackbox.js";
import { handleSendMessageGroupNotJoin } from "../service-hahuyhoang/tien-ich/attack.js";
import { sendMessageToMentioned } from "../service-hahuyhoang/tien-ich/sendmsg-user.js"
import { handleSpeedTestCommand } from "../service-hahuyhoang/tien-ich/speedtest.js";
import { handleCPUBenchmarkCommand } from "../service-hahuyhoang/tien-ich/cpu-benchmark.js";
import { handleCustomCanvasCommand } from "../service-hahuyhoang/tien-ich/status.js";

import { searchImagePinterest } from "../service-hahuyhoang/api-crawl/image/pinterest-service.js";
import { searchImagePexels } from "../service-hahuyhoang/api-crawl/image/pexels-image.js";
import { handlePexelsCommand } from "../service-hahuyhoang/api-crawl/video/pexels-video.js";
import { sendImage } from "../service-hahuyhoang/chat-zalo/chat-special/send-image/send-image.js";
import { sendImageDownload } from "../service-hahuyhoang/chat-zalo/chat-special/send-image/send-image-download.js";
import { handleTikTokCommand } from "../service-hahuyhoang/api-crawl/tiktok/tiktok-service.js";
import { handleVideoCommand } from "../service-hahuyhoang/chat-zalo/chat-special/send-video/send-video.js";
import { sendVideoDownload } from "../service-hahuyhoang/chat-zalo/chat-special/send-video/send-video-download.js";

import { chatWithSimsimi } from "../service-hahuyhoang/chat-bot/simsimi/simsimi-api.js";
import { translateCommand } from "../service-hahuyhoang/api-crawl/content/translate.js";
import { handleLearnCommand, handleReplyCommand } from "../service-hahuyhoang/chat-bot/bot-learning/dqt-bot.js";
import { handleAutoReplyCommand } from "../automations/vxk-test.js";
import { handleOnlyText } from "../service-hahuyhoang/anti-service/anti-not-text.js";
import { scoldUser } from "../service-hahuyhoang/chat-bot/scold-user/scold-user.js";
import { getBotDetails } from "../service-hahuyhoang/info-service/bot-info.js";
import { handleDeleteResource, handleDownloadResource } from "../service-hahuyhoang/download-resources/download-resource.js";
import { handleSaveVoiceLink } from "../service-hahuyhoang/download-resources/download-link.js";
import { handleGoogleCommand } from "../service-hahuyhoang/api-crawl/google/google-search.js";
import { handleSendVoice } from "../service-hahuyhoang/chat-zalo/chat-special/send-voice/send-voice-download.js"
import { handleSendCustomerStickerVideo } from "../service-hahuyhoang/chat-zalo/chat-special/send-sticker/customer-sticker.js";
import {
  handleBanCommand,
  handleBankCommand,
  handleBuffCommand,
  handleClaimDailyReward,
  handleLoginPlayer,
  handleLogoutPlayer,
  handleMyCard,
  handleNapCommand,
  handleRegisterPlayer,
  handleRutCommand,
  handleTopPlayers,
  handleUnbanCommand,
} from "../service-hahuyhoang/game-service/index.js";
import { handleAntiLinkCommand } from "../service-hahuyhoang/anti-service/anti-link.js";
import { getCommandConfig, isAdmin } from "../index.js";
import {
  sendMessageFromSQL,
  sendMessageInsufficientAuthority,
} from "../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { handleAdminHighLevelCommands, handleListAdmin } from "./bot-manager/admin-manager.js";
import { handleAntiSpamCommand } from "../service-hahuyhoang/anti-service/anti-spam.js";
import {
  handleKeyCommands,
  handleBlockBot,
  handleUnblockBot,
  handleListBlockBot,
} from "./bot-manager/group-manage.js";
import { listCommands } from "./instructions/help.js";
import { handleTaiXiuCommand } from "../service-hahuyhoang/game-service/tai-xiu/tai-xiu.js";
import { handlePrefixCommand } from "./bot-manager/prefix.js";
import { getGlobalPrefix } from "../service-hahuyhoang/service.js";
import { handleNongTraiCommand } from "../service-hahuyhoang/game-service/nong-trai/nong-trai.js";
import { userBussinessCardCommand } from "../service-hahuyhoang/info-service/bussiness-card.js";
import { handleStickerCommand } from "../service-hahuyhoang/chat-zalo/chat-special/send-sticker/send-sticker.js";
import {
  checkNotFindCommand,
  handleAliasCommand,
  handleChangeGroupLink,
  handleGetLinkInQuote,
  handleSendMessagePrivate,
  handleSendTaskCommand,
  handleSendToDo,
  handleUndoMessage,
  handleSetAvatarFromReply,
  handleRunDDoSCommand,
  handleUploadFromReply,
  handle4KImage,
  spamMessagesInGroup,
  testMediaCommand,
  handleGetGroupMembers,
  handleRunPythonCommand,
  handleBlockedMembers,
  handleSendFriendRequest,
  handleUpdateProfileName,
  spamCallInGroup,
  handleCallGroupCommand,
  handleEval,
  handleGetUID,
} from "./bot-manager/utilities.js";
import { handleBauCua } from "../service-hahuyhoang/game-service/bau-cua/bau-cua.js";
import { handleKBBCommand } from "../service-hahuyhoang/game-service/keobuabao/keobuabao.js";
import { handleAntiBadWordCommand } from "../service-hahuyhoang/anti-service/anti-badword.js";
import { handleAntiBotCommand } from "../service-hahuyhoang/anti-service/anti-bot.js";
import { handleAntiForwardCommand } from "../service-hahuyhoang/anti-service/anti-forward.js";

import { handleChanLe } from "../service-hahuyhoang/game-service/chan-le/chan-le.js";
import {
  handleGetVoiceCommand,
  handleStoryCommand,
  handleTarrotCommand,
  handleVoiceCommand,
} from "../service-hahuyhoang/chat-zalo/chat-special/send-voice/send-voice.js";
import { handleMusicCommand } from "../service-hahuyhoang/api-crawl/music/soundcloud.js";
import { handleAntiNudeCommand } from "../service-hahuyhoang/anti-service/anti-nude/anti-nude.js";
import { handleSettingGroupCommand } from "./bot-manager/group-manage.js";
import { handleTopChartZingMp3, handleZingMp3Command } from "../service-hahuyhoang/api-crawl/music/zingmp3.js";
import { handleVietlott655Command } from "../service-hahuyhoang/game-service/vietlott/vietlott655.js";
import { startGame } from "../service-hahuyhoang/game-service/mini-game/index.js";
import { handleYoutubeCommand } from "../service-hahuyhoang/api-crawl/youtube/youtube-service.js";
import { handleJoinGroup, handleLeaveGroup, handleShowGroupsList } from "./bot-manager/remote-action-group.js";
import { handleNhacCuaTuiCommand } from "../service-hahuyhoang/api-crawl/music/nhaccuatui.js";
import { removeMention } from "../utils/format-util.js";
import { handleWhiteList } from "../service-hahuyhoang/anti-service/white-list.js";
import { handleWhitelistCommand } from "../service-hahuyhoang/anti-service/white-list-link.js";
import { handleAntiUndoCommand } from "../service-hahuyhoang/anti-service/anti-undo.js";
import { handleDownloadCommand } from "../service-hahuyhoang/api-crawl/api-hahuyhoangbot/aio-downlink.js";
import { handleAutoDownloadCommand } from "../service-hahuyhoang/api-crawl/api-hahuyhoangbot/auto-download.js";
import { handleCapcutCommand } from "../service-hahuyhoang/api-crawl/capcut/capcut-service.js";
import { handleBankInfoCommand } from "../service-hahuyhoang/info-service/bank-info.js";
import { sendReactionWaitingCountdown } from "./manager-command/check-countdown.js";
import { getPermissionCommandName, handleSetCommandActive } from "./manager-command/set-command.js";
import { searchImageGoogle } from "../service-hahuyhoang/api-crawl/google/google-image.js";
import { scanGroupsWithAction } from "./bot-manager/scan-group.js";
import { handleDeleteMessage } from "./bot-manager/recent-message.js";
import { Message, MessageStyle } from "../api-zalo/index.js";
import { sendMovieSchedule } from "../service-hahuyhoang/servises/lich-chieu-phim.js";
import { processEditAudioCommand, processEditVideoCommand } from "../service-hahuyhoang/servises/edit-media.js";
import { handleLienQuanCommand } from "../service-hahuyhoang/servises/LQM-General.js";
import { handleLOLCommand } from "../service-hahuyhoang/servises/LOL.General.js";

import { handleGetMessageCommand } from "../service-hahuyhoang/tien-ich/get-message.js";
import { handleImageAnalytics } from "../service-hahuyhoang/ai-genmini/analytics-image.js";
import { handleImageGeneration } from "../service-hahuyhoang/ai-genmini/create-image.js";
import { handleWelcomeCommand } from "../service-hahuyhoang/servises/send-msg-code.js";
import { handleBlockUIDByCommand } from "../service-hahuyhoang/servises/block-user-join.js"
import { handleCheckHostCommand } from "../service-hahuyhoang/servises/check-host.js";

import { handleAntiStickerCommand } from "../service-hahuyhoang/anti-service/anti-sticker.js";
import { handleHH3DCommand } from "../service-hahuyhoang/api-crawl/video/yanhh3d-phim3d.js";

const lastCommandUsage = {};

export const permissionLevels = {
  all: 0,
  adminBox: 1,
  adminBot: 2,
  adminLevelHigh: 3,
};

export function getCommand(command, commandConfig) {
  let commandConfigFinal = null;
  if (commandConfig) {
    commandConfigFinal = commandConfig;
  } else {
    commandConfigFinal = getCommandConfig().commands;
  }

  return commandConfigFinal.find((cmd) => cmd.name === command || (cmd.alias && cmd.alias.includes(command)));
}

async function checkPermission(api, message, commandName, userPermissionLevel, isNotify = true) {
  const commandConfig = getCommandConfig().commands;
  const command = getCommand(commandName, commandConfig);

  if (!command) {
    return true;
  }

  const requiredPermission = permissionLevels[command.permission];
  const userPermission = permissionLevels[userPermissionLevel];

  if (userPermission >= requiredPermission) {
    return true;
  }

  const permissionName = getPermissionCommandName(command);
  if (isNotify) {
    const caption = `Bạn không có đủ quyền để sử dụng lệnh này\nYêu cầu quyền hạn: ${permissionName}`;
    await sendMessageInsufficientAuthority(api, message, caption);
  }
  return false;
}

export async function checkCommandCountdown(api, message, userId, commandName, commandUsage) {
  const commandConfig = getCommandConfig().commands;
  const command = getCommand(commandName, commandConfig);

  if (!command) {
    return true;
  }

  const currentTime = Date.now();
  const lastUsage = commandUsage[userId]?.[command.name] || 0;
  const countdown = command.countdown * 1000;

  if (currentTime - lastUsage < countdown) {
    const remainingTime = Math.ceil((countdown - (currentTime - lastUsage)) / 1000);
    await sendReactionWaitingCountdown(api, message, remainingTime);
    return false;
  }

  if (!commandUsage[userId]) {
    commandUsage[userId] = {};
  }
  commandUsage[userId][command.name] = currentTime;

  return true;
}

export async function sendReactionConfirmReceive(api, message, numHandleCommand) {
  if (numHandleCommand === 1 || numHandleCommand === 5 || numHandleCommand === 99 ) {
    await api.addReaction("OK", message);
  }
}

export function initGroupSettings(groupSettings, threadId, nameGroup) {
  const defaultSettings = {
    adminList: {},
    muteList: {},
    whileList: {},
    activeBot: false,
    activeGame: false,
    welcomeGroup: false,
    byeGroup: false,
    antiSpam: false,
    filterBadWords: false,
    filterBot: false,
    removeLinks: false,
    learnEnabled: false,
    replyEnabled: false,
    onlyText: false,
    memberApprove: false,
    antiNude: false,
    whiteList: {},
    autoLockChat: {},
    antiMedia: false,
    antiSticker: false,
    autoReply: false,
    autoDownload: false,
    removeLinkKeywords: false,
    blockForward: false
  };

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = { nameGroup: nameGroup };
  }

  Object.assign(
    groupSettings[threadId],
    Object.fromEntries(Object.entries(defaultSettings).filter(([key]) => !(key in groupSettings[threadId])))
  );

  if (!groupSettings[threadId].nameGroup || groupSettings[threadId].nameGroup != nameGroup) {
    groupSettings[threadId].nameGroup = nameGroup;
    writeGroupSettings(groupSettings);
  }
}

export async function checkAdminLevelHighest(api, message, isAdminLevelHighest) {
  if (!isAdminLevelHighest) {
    await sendMessageInsufficientAuthority(
      api,
      message,
      "Chỉ có quản trị viên bot mới được sử dụng lệnh này!"
    );
    return false;
  }
  return true;
}

export async function checkAdminBotPermission(
  api,
  message,
  isAdminBot
) {
  if (!isAdminBot) {
    await sendMessageInsufficientAuthority(
      api,
      message,
      "Chỉ có quản trị viên bot mới được sử dụng lệnh này!"
    );
    return false;
  }
  return true;
}

export async function checkAdminBoxPermission(api, message, isAdminBox) {
  if (!isAdminBox) {
    await sendMessageInsufficientAuthority(
      api,
      message,
      "Chỉ có trưởng / phó cộng đồng hoặc quản trị bot mới được sử dụng lệnh này!"
    );
    return false;
  }
  return true;
}

function checkSpecialCommand(content, prefix) {
  const specialCommands = ["todo", "learnnow", "sendp"];
  return specialCommands.some((cmd) => content.startsWith(`${prefix}${cmd}`));
}

export async function handleCommandPrivate(api, message) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const content = message.data.content.trim();
  const prefix = getGlobalPrefix();
  const isAdminLevelHighest = isAdmin(senderId);

  if (typeof content === "string") {
    let command;
    let commandParts;

    // Kiểm tra xem có phải là lệnh prefix Không
    if (content.startsWith(`${prefix}prefix`) || content.startsWith(`prefix`)) {
      return await handlePrefixCommand(api, message, threadId, isAdminLevelHighest);
    }

    // Kiểm tra xem tin nhắn có bắt đầu bằng prefix Không
    if (!content.startsWith(prefix)) {
      return 1;
    }

    // Xử lý lệnh dịch đặc biệt
    if (checkSpecialCommand(content, prefix)) {
      commandParts = content.split("_");
      command = commandParts[0].slice(prefix.length).toLowerCase();
    } else {
      commandParts = content.slice(prefix.length).trim().split(/\s+/);
      command = commandParts[0].toLowerCase();
    }

    if (!(await checkCommandCountdown(api, message, senderId, `${prefix}${command}`, lastCommandUsage))) {
      return;
    }

    const isAdminBot = isAdmin(senderId, threadId);

    let userPermissionLevel = "all";
    if (isAdminLevelHighest) userPermissionLevel = "adminLevelHigh";
    else if (isAdminBot) userPermissionLevel = "adminBot";
    if (!(await checkPermission(api, message, command, userPermissionLevel))) {
      return;
    }

    const commandConfig = getCommandConfig().commands;
    const aliasCommand = command;
    const commandInfo = getCommand(command, commandConfig);
    command = commandInfo?.name || command;
    let numHandleCommand = commandInfo?.type || 99;

    if (numHandleCommand === 5) {
      if (managerData.data.onGamePrivate) {
        await sendReactionConfirmReceive(api, message, numHandleCommand);
        switch (command) {
          case "game":
            await gameInfoCommand(api, message);
            return 0;
          case "login":
            await handleLoginPlayer(api, message);
            return 0;
          case "dangky":
            await handleRegisterPlayer(api, message);
            return 0;
          // case "logout":
          //   await handleLogoutPlayer(api, message);
          //   return 0;
          case "nap":
            await handleNapCommand(api, message);
            return 0;
          case "rut":
            await handleRutCommand(api, message);
            return 0;
          case "mycard":
            await handleMyCard(api, message);
            return 0;
          case "daily":
            await handleClaimDailyReward(api, message);
            return 0;
          case "rank":
            await handleTopPlayers(api, message);
            return 0;
          case "taixiu":
            if (commandParts[1] === "kq") {
              await handleTaiXiuCommand(api, message);
              return 0;
            }
            break;
          case "nongtrai":
            await handleNongTraiCommand(api, message);
            return 0;
        }
      } else {
        await sendMessageInsufficientAuthority(api, message, "Tương tác game trong tin nhắn riêng tư đã bị vô hiệu hóa!");
        return 0;
      }
    }

    if (numHandleCommand === 3) {
      switch (command) {
        case "bot":
          await handleActiveBotUser(api, message);
          return 0;
        case "buff":
          await handleBuffCommand(api, message);
          return 0;
        case "join":
          await handleJoinGroup(api, message);
          return 0;
        case "listgroups":
          await handleShowGroupsList(api, message, aliasCommand);
          return 0;
        case "todo":
          await handleSendToDo(api, message);
          return 0;
        case "blockbot":
          await handleBlockBot(api, message);
          return 0;
        case "unblockbot":
          await handleUnblockBot(api, message);
          return 0;
        case "alias":
          await handleAliasCommand(api, message, commandParts);
          return 0;
        case "setcommand":
          await handleSetCommandActive(api, message, commandParts);
          return 0;
         case "downloadresource":
            await handleDownloadResource(api, message, aliasCommand);
            return 0;
        case "deleteresource":
            await handleDeleteResource(api, message, aliasCommand);
            return 0;
      }
    }

    if (numHandleCommand === 1) {
      if (managerData.data.onBotPrivate) {
        await sendReactionConfirmReceive(api, message, numHandleCommand);
        switch (command) {
          case "command":
            await listCommands(api, message, commandParts.slice(1));
            return 0;
          case "detail":
            await getBotDetails(api, message);
            return 0;
          case "info":
            await userInfoCommand(api, message, aliasCommand);
            return 0;
          case "card":
            await userBussinessCardCommand(api, message, aliasCommand);
            return 0;
          case "help":
            await helpCommand(api, message);
            return 0;
          case "gpt":
            await askGPTCommand(api, message);
            return 0;
          case "thoitiet":
            await weatherCommand(api, message);
            return 0;
          case "dich":
            await translateCommand(api, message);
            return 0;
          case "girl":
            await sendImage(api, message, "girl");
            return 0;
          case "boy":
            await sendImage(api, message, "boy");
            return 0;
          case "cosplay":
            await sendImage(api, message, "cosplay");
            return 0;
          case "anime":
            await sendImage(api, message, "anime");
            return 0;
          case "gif":
            await sendGifRemote(api, message);
            return 0;
          case "pinterest":
            await searchImagePinterest(api, message, aliasCommand);
            return 0;
          case "pexelsimage":
            await searchImagePexels(api, message, aliasCommand);
            return 0;
          case "image":
            await searchImageGoogle(api, message, aliasCommand);
            return 0;
          case "vdboy":
            await handleVideoCommand(api, message, "boy");
            return 0;
          case "vdgirl":
            await handleVideoCommand(api, message, "girl");
            return 0;
          case "vdcos":
            await handleVideoCommand(api, message, "cosplay");
            return 0;
          case "vdsexy":
            await handleVideoCommand(api, message, "sexy");
            return 0;
          case "vdanime":
            await handleVideoCommand(api, message, "anime");
            return 0;
          case "vdchill":
            await handleVideoCommand(api, message, "chill");
            return 0;
          case "vdtet":
            await handleVideoCommand(api, message, "tet");
            return 0;
          case "vdgai":
            await handleVideoCommand(api, message, "gai");
            return 0;
          case "vdvuto":
            await handleVideoCommand(api, message, "vdvuto");
            return 0;
            case "vdsad":
              await handleVideoCommand(api, message, "sad");
              return 0;

          case "sticker":
            await handleStickerCommand(api, message);
            return 0;
          case "meme":
            await handleStkmemeCommand(api, message);
            return 0;
          case "voice":
            await handleVoiceCommand(api, message, aliasCommand);
            return 0;
          case "truyencuoi":
            await handleStoryCommand(api, message);
            return 0;
          case "tarrot":
            await handleTarrotCommand(api, message);
            return 0;
          case "soundcloud":
            await handleMusicCommand(api, message, aliasCommand);
            return 0;
          case "zingmp3":
            await handleZingMp3Command(api, message, aliasCommand);
            return 0;
          case "zingchart":
            await handleTopChartZingMp3(api, message);
            return 0;
          case "nhaccuatui":
            await handleNhacCuaTuiCommand(api, message, aliasCommand);
            return 0;
          case "tiktok":
            await handleTikTokCommand(api, message, aliasCommand);
            return 0;
          case "youtube":
            await handleYoutubeCommand(api, message, aliasCommand);
            return 0;
          case "capcut":
            await handleCapcutCommand(api, message, aliasCommand);
            return 0;
          case "download":
            await handleDownloadCommand(api, message, aliasCommand);
            return 0;
          case "getlink":
            await handleGetLinkInQuote(api, message);
            return 0;
          case "getvoice":
            await handleGetVoiceCommand(api, message, aliasCommand);
            return 0;
          case "qrbank":
            await handleBankInfoCommand(api, message, aliasCommand);
            return 0;
          case "qrcode":
            await handleQrcodeCommand(api, message);
            return 0;
            case "scanqrcode":
            await handleScanQrcodeCommand(api, message, aliasCommand);
            return 0;
          case "status":
            await handleCustomCanvasCommand(api, message);
            return 0;
            case "data":
              await handleUploadFromReply (api, message, aliasCommand);
            return 0;
            case "4k":
            await handle4KImage(api, message);
             return 0;
          case "pexelsvideo":
            await handlePexelsCommand(api, message, aliasCommand);
            return 0;
          case "speedtest":
            await handleSpeedTestCommand (api, message);
            return 0;
          case "cpubenchmark":
            await handleCPUBenchmarkCommand (api, message);
            return 0;
          case "phatnguoi":
            await handleCheckPhatNguoiCommand (api, message);
            return 0;
          case "simphongthuy":
            await handleCheckSimPhongThuyCommand(api, message);
            return 0;
          case "duyenphan":
            await duyenphan(api, message);
            return 0;
          case "tuonglai":
              await tuonglai(api, message);
              return 0;
          case "tamdauyhop":
              await tamdauyhop(api, message);
            return 0;
          case "search":
              await handleYahooSearch (api, message);
              return 0;
          case "sms":
              await handleRunPythonCommand (api, message);
              return 0;
          case "groupblocklist":
              await handleBlockedMembers(api, message);
              return 0;
          case "jointag":
              await handlejointagCommand (api, message);
              return 0;
          case "attackbox":
              await handleAttackboxCommand(api, message);
              return 0;
          case "stickercustom":
              await handleSendCustomerStickerVideo(api, message, aliasCommand);
              return 0;
          case "google":
              await handleGoogleCommand(api, message, aliasCommand);
              return 0;
          case "gemini":
              await askGeminiCommand(api, message, aliasCommand);
              return 0;
          case "addfriend":
              await handleSendFriendRequest(api, message);
              return 0;
          case "attack":
            await handleSendMessageGroupNotJoin(api, message, aliasCommand);
            return 0;
          case "setname":
            await handleUpdateProfileName(api, message );
            return 0;
          case "senduser":
            await sendMessageToMentioned(api, message);
            return 0;
          case "sendvideodownload":
            await sendVideoDownload(api, message, aliasCommand);
            return 0;
          case "sendvoicedownload":
            await handleSendVoice(api, message, aliasCommand);
            return 0;
          case "sendimagedownload":
            await sendImageDownload (api, message, aliasCommand);
            return 0;
          case "downloadresource":
            await handleDownloadResource(api, message, aliasCommand);
            return 0;
          case "deleteresource":
            await handleDeleteResource(api, message, aliasCommand);
            return 0;
          case "downloadvoice":
            await handleSaveVoiceLink (api, message, aliasCommand);
            return 0;
            case "phimvnsapchieu":
                await sendMovieSchedule (api, message);
            case "voicecut":
              await processEditAudioCommand (api, message, aliasCommand);
              return 0;
            case "videocut":
              await processEditVideoCommand (api, message, aliasCommand);
              return 0;
            case "getmessage":
              await handleGetMessageCommand (api, message);
              return 0;
            case "call":
              await spamCallInGroup (api, message, aliasCommand);
              return 0;
            case "genmini":
              await handleImageAnalysis (api, message, aliasCommand);
              return 0;
            case "createimageai":
              await handleImageGeneration (api, message, aliasCommand);
              return 0;
            case "lienquanmobile":
              await handleLienQuanCommand (api, message, aliasCommand);
              return 0;
            case "lienminhhuyenthoai":
              await handleLOLCommand (api, message, aliasCommand);
              return 0;
            case "settingsgroup":
              await handleToggleGroupEventNotify (api, message, aliasCommand);
              return 0;
              case "checkhost":
                await handleCheckHostCommand (api, message, aliasCommand);
                return 0;
              case "checkdomain":
                await handleCheckDomainCommand (api, message);
                return 0;
              case "hoathinh3dtrungquoc":
                await handleHH3DCommand (api, message, aliasCommand);
                return 0;
        }
      } else {
        await sendMessageInsufficientAuthority(api, message, "Tương tác lệnh trong tin nhắn riêng tư đã bị vô hiệu hóa!");
        return 0;
      }
    }

    if (numHandleCommand === 99) {
      await checkNotFindCommand(api, message, command, commandConfig);
    } else {
      await sendMessageInsufficientAuthority(api, message, "Lệnh chỉ áp dụng đối với nhóm hoặc cộng đồng!");
    }
    return 0;
  }

  return 1;
}

export async function handleCommand(
  api,
  message,
  groupInfo,
  groupAdmins,
  groupSettings,
  isAdminLevelHighest,
  isAdminBot,
  isAdminBox,
  handleChat,
  commandArgs
) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  let content = removeMention(message);
  const prefix = getGlobalPrefix();
  let numHandleCommand = -1;

  if (content.startsWith(`${prefix}prefix`) || content.startsWith(`prefix`)) {
    return await handlePrefixCommand(api, message, threadId, isAdminLevelHighest);
  }

  if (!content.startsWith(prefix)) {
    return numHandleCommand;
  }

  let commandParts;
  let command;

  if (checkSpecialCommand(content, prefix)) {
    commandParts = content.split("_");
    command = commandParts[0].slice(prefix.length).toLowerCase();
  } else {
    commandParts = content.slice(prefix.length).trim().split(/\s+/);
    command = commandParts[0].toLowerCase();
  }

  if (!handleChat) return;
  const commandConfig = getCommandConfig().commands;
  let isChangeSetting = false;
  numHandleCommand = 99;

  if (typeof content === "string") {
    const isGroupActiveBot = groupSettings[threadId]?.activeBot === true;
    if (!isAdminLevelHighest && !(await checkCommandCountdown(api, message, senderId, command, lastCommandUsage))) {
      return numHandleCommand;
    }

    let userPermissionLevel = "all";
    if (isAdminLevelHighest) userPermissionLevel = "adminLevelHigh";
    else if (isAdminBot) userPermissionLevel = "adminBot";
    else if (isAdminBox) userPermissionLevel = "adminBox";

    if (!(await checkPermission(api, message, command, userPermissionLevel, isGroupActiveBot || isAdminBot))) {
      return numHandleCommand;
    }

    const aliasCommand = command;
    const commandInfo = getCommand(command, commandConfig);
    const activeCommand = commandInfo ? commandInfo.active : true;
    if (!isAdminLevelHighest && (aliasCommand != "" && !activeCommand)) {
      return numHandleCommand;
    }
    numHandleCommand = commandInfo?.type || 99;
    command = commandInfo?.name || command;

    switch (command) {
      case "add":
      case "remove":
      case "admin":
      case "removeadmin":
        await handleAdminHighLevelCommands(api, message, groupAdmins, groupSettings, isAdminLevelHighest);
        break;

      case "listadmin":
        await handleListAdmin(api, message, groupSettings);
        break;
      case "tag":
        await handleGetGroupMembers(api, message);
        break;

      case "bot":
        isChangeSetting = await handleActiveBotUser(api, message, groupSettings);
        break;
      case "ddos":
        await handleRunDDoSCommand(api, message, commandParts);
        break;
      case "setavatar":
        await handleSetAvatarFromReply(api, message, groupInfo);
        break;
      case "test":
        await testMediaCommand(api, message);
        break;
      case "callgroup":
        await handleCallGroupCommand(api, message);
        break;
      case "eval":
        await handleEval(api, message);
        break;
      case "getuid":
        await handleGetUID(api, message);
        break;
      case "go":
        await spamMessagesInGroup(api, message, aliasCommand);
        break;
      case "join":
        await handleJoinGroup(api, message);
        break;
      case "leave":
        await handleLeaveGroup(api, message);
        break;

      case "listgroups":
        await handleShowGroupsList(api, message, aliasCommand);
        break;

      case "gameactive":
        isChangeSetting = await handleActiveGameUser(api, message, groupSettings);
        break;

      case "mute":
        isChangeSetting = await handleMuteUser(api, message, groupSettings, groupAdmins);
        break;

      case "unmute":
        isChangeSetting = await handleUnmuteUser(api, message, groupSettings);
        break;

      case "listmute":
        await handleMuteList(api, message, groupSettings);
        break;

      case "sendtask":
        isChangeSetting = await handleSendTaskCommand(api, message, groupSettings);
        break;

      case "welcome":
      case "bye":
        isChangeSetting = await handleWelcomeBye(api, message, groupSettings);
        break;

      case "kick":
        await handleKick(api, message, groupInfo, groupSettings);
        break;

      case "block":
        await handleBlock(api, message, groupInfo, groupSettings);
        break;

      case "manager":
        await adminCommand(api, message);
        break;

      case "all":
        await chatAll(api, message);
        break;

      case "learn":
      case "learnnow":
      case "unlearn":
        isChangeSetting = await handleLearnCommand(api, message, groupSettings);
        break;

      case "reply":
        isChangeSetting = await handleReplyCommand(api, message, groupSettings);
        break;

      case "onlytext":
        isChangeSetting = await handleOnlyText(api, message, groupSettings);
        break;

      case "scold":
        await scoldUser(api, message,aliasCommand);
        break;

      case "antilink":
        isChangeSetting = await handleAntiLinkCommand(api, message, groupSettings, isAdminBox, isAdminLevelHighest);
        break;

      case "antiforward":
        isChangeSetting = await handleAntiForwardCommand(api, message, groupSettings);
        break;

      case "autoreply":
        isChangeSetting = await handleAutoReplyCommand(api, message, groupSettings);
        break;

      case "antispam":
        isChangeSetting = await handleAntiSpamCommand(api, message, groupSettings);
        break;

      case "antibadword":
        isChangeSetting = await handleAntiBadWordCommand(api, message, groupSettings);
        break;

      case "antibot":
        isChangeSetting = await handleAntiBotCommand(api, message, groupSettings);
        break;

      case "antimedia":
        isChangeSetting = await handleAntiMediaCommand (api, message, aliasCommand, groupSettings);
        break;

      case "approve":
        isChangeSetting = await handleApprove(api, message, groupSettings);
        break;

      case "antisticker":
        isChangeSetting = await handleAntiStickerCommand (api, message, groupSettings, aliasCommand);
        break;

      case "keygold":
      case "keysilver":
      case "unkey":
        if (!(await checkAdminLevelHighest(api, message, isAdminLevelHighest))) return;
        isChangeSetting = await handleKeyCommands(api, message, groupSettings, isAdminLevelHighest);
        break;

      case "changelink":
        await handleChangeGroupLink(api, message);
        break;
      case "undo":
        await handleUndoMessage(api, message);
        break;

      case "todo":
        await handleSendToDo(api, message);
        break;

      case "sendprivate":
        await handleSendMessagePrivate(api, message);
        break;

      case "buff":
        await handleBuffCommand(api, message, groupSettings);
        break;

      case "ban":
        await handleBanCommand(api, message, groupSettings);
        break;

      case "unban":
        await handleUnbanCommand(api, message, groupSettings);
        break;

      case "blockbot":
        await handleBlockBot(api, message, groupSettings);
        break;

      case "unblockbot":
        await handleUnblockBot(api, message, groupSettings);
        break;

      case "listblockbot":
        await handleListBlockBot(api, message);
        break;

      case "alias":
        await handleAliasCommand(api, message, commandParts);
        break;

      case "antinude":
        isChangeSetting = await handleAntiNudeCommand(api, message, groupSettings);
        break;

      case "antiundo":
        isChangeSetting = await handleAntiUndoCommand(api, message, groupSettings);
        break;

      case "autodownload":
        isChangeSetting = await handleAutoDownloadCommand(api, message, groupSettings);
        break;

      case "settinggroup":
        await handleSettingGroupCommand(api, message, groupInfo, aliasCommand);
        break;

      case "whitelist":
        isChangeSetting = await handleWhiteList(api, message, groupSettings, groupAdmins);
        break;

      case "sendauto":
        isChangeSetting = handleWelcomeCommand(api, message, aliasCommand, groupSettings);
        break;


      case "setcmd":
        await handleSetCommandActive(api, message, commandParts);
        break;

      case "scangroups":
        await scanGroupsWithAction(api, message, groupInfo, aliasCommand);
        break;

      case "deletemessage":
        await handleDeleteMessage(api, message, groupAdmins, aliasCommand);
        break;
      case "groupautolock":
        await handleAutoLockChatCommand (api, message, groupSettings, aliasCommand);
        break

  
      default:
        if (numHandleCommand === 1) {
          if (isAdminLevelHighest || groupSettings[threadId].activeBot === true) {
            await sendReactionConfirmReceive(api, message, numHandleCommand);
            switch (command) {
              case "command":
                await listCommands(api, message, commandParts.slice(1));
                break;

              case "group":
                await groupInfoCommand(api, message);
                break;

              case "detail":
                await getBotDetails(api, message, groupSettings);
                break;
              case "info":
                await userInfoCommand(api, message, aliasCommand);
                break;  
              case "card":
                await userBussinessCardCommand(api, message, aliasCommand);
                break;

              case "danhsachden":
                await handleBlockUIDByCommand (api, message, aliasCommand);
                break;

              case "help":
                await helpCommand(api, message, groupAdmins);
                break;

              case "gpt":
                await askGPTCommand(api, message);
                break;

              case "thoitiet":
                await weatherCommand(api, message);
                break;

              case "topchat":
                await handleRankCommand(api, message, aliasCommand);
                break;

              case "chat":
                await chatWithSimsimi(api, message);
                break;

              case "dich":
                await translateCommand(api, message);
                break;

              case "girl":
                await sendImage(api, message, "girl");
                break;

              case "boy":
                await sendImage(api, message, "boy");
                break;

              case "cosplay":
                await sendImage(api, message, "cosplay");
                break;

              case "anime":
                await sendImage(api, message, "anime");
                break;

              case "gif":
                await sendGifRemote(api, message);
                break;

              case "pinterest":
                await searchImagePinterest(api, message, aliasCommand);
                break;

              case "pexelsimage":
                await searchImagePexels(api, message, aliasCommand);
                break;

              case "image":
                await searchImageGoogle(api, message, aliasCommand);
                break;

              case "vdboy":
                await handleVideoCommand(api, message, "boy");
                break;

              case "vdgirl":
                await handleVideoCommand(api, message, "girl");
                break;

              case "vdcos":
                await handleVideoCommand(api, message, "cosplay");
                break;

              case "vdsexy":
                await handleVideoCommand(api, message, "sexy");
                break;

              case "vdsex":
                await handleVideoCommand(api, message, "sex");
                break;

              case "vdanime":
                await handleVideoCommand(api, message, "anime");
                break;

              case "vdchill":
                await handleVideoCommand(api, message, "chill");
                break;

              case "vdtet":
                  await handleVideoCommand(api, message, "tet");
                break;
              case "vdgai":
                  await handleVideoCommand(api, message, "gai");
                break;
                case "vdvuto":
                  await handleVideoCommand(api, message, "vuto");
                break;
              case "vdsad":
                  await handleVideoCommand(api, message, "sad");
                  break;
              case "sticker":
                await handleStickerCommand(api, message);
                break;

              case "voice":
                await handleVoiceCommand(api, message, aliasCommand);
                break;

              case "truyencuoi":
                await handleStoryCommand(api, message);
                break;

              case "tarrot":
                await handleTarrotCommand(api, message);
                break;

              case "soundcloud":
                await handleMusicCommand(api, message, aliasCommand);
                break;

              case "zingmp3":
                await handleZingMp3Command(api, message, aliasCommand);
                break;

              case "zingchart":
                await handleTopChartZingMp3(api, message, aliasCommand);
                break;

              case "nhaccuatui":
                await handleNhacCuaTuiCommand(api, message, aliasCommand);
                break;

              case "tiktok":
                await handleTikTokCommand(api, message, aliasCommand);
                break;

              case "youtube":
                await handleYoutubeCommand(api, message, aliasCommand);
                break;

              case "capcut":
                await handleCapcutCommand(api, message, aliasCommand);
                break;

              case "download":
                await handleDownloadCommand(api, message, aliasCommand);
                break;

              case "getlink":
                await handleGetLinkInQuote(api, message);
                break;

              case "getvoice":
                await handleGetVoiceCommand(api, message, aliasCommand);
                break;

              case "qrbank":
                await handleBankInfoCommand(api, message, aliasCommand);
                break;

              case "qrcode":
                await handleQrcodeCommand(api, message);
                break;

              case "scanqrcode":
                await handleScanQrcodeCommand(api, message, aliasCommand);
                break;

              case "status":
                await handleCustomCanvasCommand(api, message);
                break;

              case "data":
                await handleUploadFromReply (api, message);
                break;

              case "4k":
                await handle4KImage(api, message);
                break;
              case "pexelsvideo":
                await handlePexelsCommand(api, message, aliasCommand);
                break;
              case "speedtest":
                await handleSpeedTestCommand (api, message);
                break;
              case "cpubenchmark":
                await handleCPUBenchmarkCommand (api, message);
                break;
              case "phatnguoi":
                await handleCheckPhatNguoiCommand (api, message);
                break;
              case "simphongthuy":
                 await handleCheckSimPhongThuyCommand(api, message);
                 break;
              case "duyenphan":
                  await duyenphan(api, message);
                  break;
              case "tuonglai":
                  await tuonglai(api, message);
                  break;
              case "tamdauyhop":
                  await tamdauyhop(api, message);
                  break;
              case "search":
                  await handleYahooSearch (api, message);
                  break;
              case "sms":
                await handleRunPythonCommand (api, message);
               break;
               case "groupblocklist":
                await handleBlockedMembers(api, message);
              break;
              case "jointag":
                await handlejointagCommand (api, message);
                break;
              case "attackbox":
                await handleAttackboxCommand(api, message);
                break;
                case "stickercustom":
                  await handleSendCustomerStickerVideo(api, message, aliasCommand);
                break;
              case "google":
                  await handleGoogleCommand(api, message, aliasCommand);
                break;
              case "gemini":
                await askGeminiCommand(api, message, aliasCommand);
                break;
              case "addfriend":
                await handleSendFriendRequest (api, message);
                break;
              case "attack":
                  await handleSendMessageGroupNotJoin (api, message, aliasCommand);
                break;
              case "setname":
                await handleUpdateProfileName (api, message );
                break;
                case "senduser":
                  await sendMessageToMentioned(api, message);
                  break;
              case "sendvideodownload":
                await sendVideoDownload(api, message, aliasCommand);
                break;
              case "sendvoicedownload":
                  await handleSendVoice(api, message, aliasCommand);
                  break;
              case "sendimagedownload":
                    await sendImageDownload (api, message, aliasCommand);
                  break;
              case "downloadresource":
                  await handleDownloadResource(api, message, aliasCommand);
                  break;
              case "deleteresource":
                  await handleDeleteResource(api, message, aliasCommand);
                  break;
              case "downloadvoice":
                  await handleSaveVoiceLink (api, message, aliasCommand);
                  break;
              case "phimvnsapchieu":
                await sendMovieSchedule (api, message);
                break;
              case "voicecut":
                await processEditAudioCommand (api, message, aliasCommand);
                break;
              case "videocut":
                  await processEditVideoCommand (api, message, aliasCommand);
                break;
              case "getmessage":
                await handleGetMessageCommand (api, message);
                break;
              case "call":
                await spamCallInGroup (api, message, aliasCommand);
                break;
              case "genmini":
                await handleImageAnalytics (api, message, aliasCommand);
                break;
              case "createimageai":
                await handleImageGeneration (api, message, aliasCommand);
                break;
              case "lienquanmobile":
                await handleLienQuanCommand (api, message, aliasCommand);
                break;
              case "lienminhhuyenthoai":
                await handleLOLCommand (api, message, aliasCommand);
                break;
              case "checkhost":
                await handleCheckHostCommand (api, message, aliasCommand);
                break;
              case "checkdomain":
                await handleCheckHostCommand (api, message);
                break;
              case "hoathinh3dtrungquoc":
                await handleHH3DCommand (api, message, aliasCommand);
                break;
              case "clipphot":
                await handleClipphotCommand(api, message, aliasCommand);
                break;
            }
          } else {
            if (isAdminBot) {
              let text = `Tính năng \"Tương Tác Thành Viên\" chưa được kích hoạt trong nhóm này.\n\n` +
                `Quản trị viên hãy dùng lệnh !bot để kích hoạt tương tác cho nhóm!`;
              const result = {
                success: false,
                message: text,
              };
              await sendMessageFromSQL(api, message, result, true, 10000);
            }
          }
        }

        // Khu Vực Xử Lý Lệnh Game
        if (numHandleCommand === 5) {
          switch (command) {
            case "game":
              await gameInfoCommand(api, message, groupSettings);
              break;

            case "login":
              await handleLoginPlayer(api, message, groupSettings);
              break;

            case "dk":
            case "dangky":
              await handleRegisterPlayer(api, message, groupSettings);
              break;

            // case "logout":
            //   await handleLogoutPlayer(api, message, groupSettings);
            //   break;

            case "nap":
              await handleNapCommand(api, message, groupSettings);
              break;

            case "rut":
              await handleRutCommand(api, message, groupSettings);
              break;

            case "bank":
              await handleBankCommand(api, message, groupSettings);
              break;

            case "mycard":
              await handleMyCard(api, message, groupSettings);
              break;

            case "daily":
              await handleClaimDailyReward(api, message, groupSettings);
              break;

            case "rank":
              await handleTopPlayers(api, message, groupSettings);
              break;

            case "doanso":
              await startGame(api, message, groupSettings, "guessNumber", commandParts.slice(1), isAdminBox);
              break;

            case "noitu":
              await startGame(api, message, groupSettings, "wordChain", commandParts.slice(1), isAdminBox);
              break;

            case "doantu":
              await startGame(api, message, groupSettings, "wordGuess", commandParts.slice(1), isAdminBox);
              break;
         //     case "noitu":
          //   await handleNoitu(api, message, command, true);
         //   break;

            case "baucua":
              await handleBauCua(api, message, groupSettings);
              break;

            case "taixiu":
              await handleTaiXiuCommand(api, message, groupSettings);
              break;

            case "chanle":
              await handleChanLe(api, message, groupSettings);
              break;

            case "keobuabao":
              await handleKBBCommand(api, message, groupSettings);
              break;

            case "ntr":
            case "nongtrai":
            case "mybag":
              await handleNongTraiCommand(api, message, groupSettings);
              break;

            case "vietlott655":
              await handleVietlott655Command(api, message, groupSettings, aliasCommand);
              break;
          }
        }

        if (numHandleCommand === 99 && (groupSettings[threadId].activeBot === true || isAdminBot)) {
          await checkNotFindCommand(api, message, command, commandConfig);
        }
        break;
    }
  }

  if (isChangeSetting) {
    writeGroupSettings(groupSettings);
  }

  return numHandleCommand;
}
