import { isAdmin } from "../../../index.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { handleGuessNumberCommand, handleGuessNumberGame } from "./guessNumber.js";
import { handleWordChainCommand, handleWordChainMessage } from "./wordChain.js";
import { handleWordGuessCommand, handleWordGuessGame } from "./wordGuess.js";
import { getGlobalPrefix } from "../../service.js";
import { checkHasActiveGame } from "./index.js";
const activeGames = new Map();

export function getActiveGames() {
  return activeGames;
}

export async function handleChatWithGame(api, message, isCallGame, groupSettings) {
  if (isCallGame) return;
  const threadId = message.threadId;
  const activeGame = groupSettings[threadId].activeGame;
  if (activeGame === false) return;

  let content = message.data.content;
  const senderId = message.data.uidFrom;

  if (typeof content === "string") {
    content = content.trim();
    const activeGame = activeGames.get(threadId);

    if (activeGame) {
      switch (activeGame.type) {
        case "guessNumber":
          await handleGuessNumberGame(api, message, threadId, senderId);
          break;
        case "wordChain":
          await handleWordChainMessage(api, message);
          break;
        case "wordGuess":
          await handleWordGuessGame(api, message, threadId);
          break;
      }
    }
  }
}

export async function startGame(api, message, groupSettings, gameType, args, isAdminBox) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const prefix = getGlobalPrefix();
  const activeGame = groupSettings[threadId].activeGame;
  if (activeGame === false) {
    if (isAdmin(senderId, threadId)) {
      const text =
        `Trò chơi hiện tại Không được bật trong nhóm này.\n\n` +
        `Quản trị viên hãy dùng lệnh ${prefix}gameactive để bật tương tác game cho nhóm!`;
      const result = {
        success: false,
        message: text,
      };
      await sendMessageFromSQL(api, message, result, true, 30000);
    }
    return;
  };

  if (await checkHasActiveGame(api, message, threadId)) return;

  switch (gameType) {
    case "guessNumber":
      await handleGuessNumberCommand(api, message, threadId, args);
      break;
    case "wordChain":
      await handleWordChainCommand(api, message, args);
      break;
    case "wordGuess":
      await handleWordGuessCommand(api, message, threadId, args);
      break;
  }
}
