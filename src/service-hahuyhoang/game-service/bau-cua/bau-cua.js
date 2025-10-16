import { createCanvas, loadImage } from "canvas";
import path from "path";
import fs from "fs";
import chalk from "chalk";
import Big from "big.js";
import { updatePlayerBalance, getPlayerBalance } from "../../../database/player.js";
import { nameServer } from "../../../database/index.js";
import { checkBeforeJoinGame } from "../index.js";
import { formatCurrency, normalizeSymbolName, parseGameAmount } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import { readFile, writeFile } from "fs/promises";
import { clearImagePath } from "../../../utils/canvas/index.js";
import { gameState } from "../game-manager.js";

const SYMBOLS = {
  BAU: {
    emoji: "🍐",
    name: "Bầu",
    key: "bau",
    icon: "bau",
  },
  CUA: {
    emoji: "🦀",
    name: "Cua",
    key: "cua",
    icon: "cua",
  },
  TOM: {
    emoji: "🦞",
    name: "Tôm",
    key: "tom",
    icon: "tom",
  },
  CA: {
    emoji: "🐟",
    name: "Cá",
    key: "ca",
    icon: "ca",
  },
  GA: {
    emoji: "🐓",
    name: "Gà",
    key: "ga",
    icon: "ga",
  },
  NAI: {
    emoji: "🦌",
    name: "Nai",
    key: "nai",
    icon: "nai",
  },
};

const TTL_IMAGE = 10800000;
const SYMBOL_LIST = Object.values(SYMBOLS).map((s) => s.emoji);
const SYMBOL_NAMES = Object.fromEntries(Object.values(SYMBOLS).map((s) => [s.emoji, s.name]));
const SYMBOL_EMOJIS = Object.fromEntries(Object.values(SYMBOLS).map((s) => [s.key, s.emoji]));
const SYMBOL_ICON_NAME = Object.fromEntries(Object.values(SYMBOLS).map((s) => [s.emoji, s.icon]));

const MAX_JACKPOT_MULTIPLIER = 1000;
const JACKPOT_CONTRIBUTION_PERCENT = 0.6;

// Thêm hàm khởi tạo dữ liệu
export async function initializeGameBauCua() {
  try {
    if (!gameState.data.baucua) gameState.data.baucua = {};
    if (!gameState.data.baucua.jackpot) gameState.data.baucua.jackpot = "1000000";
    gameState.data.baucua.jackpot = new Big(gameState.data.baucua.jackpot);
    if (!gameState.data.baucua.history) gameState.data.baucua.history = [];

    console.log(chalk.magentaBright("Khởi động và nạp dữ liệu minigame bầu cua hoàn tất"));
  } catch (error) {
    console.error("Lỗi khi khởi tạo dữ liệu bầu cua:", error);
  }
}

// Thêm hàm lưu dữ liệu
async function saveGameData() {
  gameState.changes.baucua = true;
}

// Thêm hàm kiểm tra nổ hũ
function checkJackpot(result) {
  return result[0] === result[1] && result[1] === result[2];
}

// Sửa đổi hàm xử lý lệnh bầu cua
export async function handleBauCua(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  const senderId = message.data.uidFrom;
  const threadId = message.threadId;

  const prefix = getGlobalPrefix();
  const content = message.data.content.toLowerCase().replace(`${prefix}baucua`, "").trim();

  const senderName = message.data.dName;
  let bets = {};
  const requestBalance = await getPlayerBalance(senderId);
  if (requestBalance.success) {
    try {
      bets = await parseBets(content, requestBalance.balance);
    } catch (error) {
      await api.sendMessage({ msg: `${nameServer}: ❌ ${error.message}`, quote: message }, threadId, message.type);
      return;
    }
  } else {
    await api.sendMessage({ msg: `${nameServer}: ${requestBalance.message}`, quote: message }, threadId, message.type);
    return;
  }

  if (Object.keys(bets).length === 0) {
    await api.sendMessage(
      { msg: `${nameServer}: Vui lòng đặt cược theo định dạng: !baucua [loại] [số tiền]:[loại] [số tiền]...`, quote: message },
      threadId,
      message.type
    );
    return;
  }

  const totalBet = Object.values(bets).reduce((sum, bet) => sum.plus(new Big(bet)), new Big(0));
  if (totalBet.lt(new Big(1000))) {
    await api.sendMessage({ msg: `${nameServer}: ❌ Mỗi lần cược tối thiểu 1000 VNĐ.`, quote: message }, threadId, message.type);
    return;
  }

  const requestData = await getPlayerBalance(senderId);
  const status = requestData.success ? "✅" : "❌";

  if (requestData.success) {
    const bigNumBalance = new Big(requestData.balance);
    if (bigNumBalance.lt(totalBet)) {
      await api.sendMessage(
        { msg: `${nameServer}: ${status} Số dư không đủ. Bạn chỉ có ${formatCurrency(bigNumBalance)} VNĐ.`, quote: message },
        threadId,
        message.type
      );
      return;
    }
  } else {
    await api.sendMessage({ msg: `${nameServer}: ${status} ${requestData.message}`, quote: message }, threadId, message.type);
    return;
  }
  const currentBalance = new Big(requestData.balance);

  const result = rollDice(Object.keys(bets));

  const winnings = calculateWinnings(bets, result);
  let netWinnings = new Big(winnings).minus(totalBet);
  const isWin = netWinnings.gt(0);

  // Sau khi tính netWinnings, thêm xử lý hũ
  if (netWinnings.lt(0)) {
    // Góp 50% số tiền thua vào hũ
    const contribution = netWinnings.abs().mul(JACKPOT_CONTRIBUTION_PERCENT);
    gameState.data.baucua.jackpot = gameState.data.baucua.jackpot.plus(contribution);
  }

  // Kiểm tra nổ hũ
  let jackpotAmount = new Big(0);
  let isJackpot = checkJackpot(result);

  if (isJackpot) {
    // Giới hạn tiền thắng từ hũ (1000% tiền cược)
    const maxJackpotWin = totalBet.mul(MAX_JACKPOT_MULTIPLIER);
    jackpotAmount = gameState.data.baucua.jackpot;

    if (jackpotAmount.gt(maxJackpotWin)) {
      jackpotAmount = maxJackpotWin;
      gameState.data.baucua.jackpot = gameState.data.baucua.jackpot.minus(maxJackpotWin);
    } else {
      // Reset hũ về 1 triệu nếu ăn hết
      gameState.data.baucua.jackpot = new Big(1000000);
    }

    // Cộng tiền hũ vào tiền thắng
    netWinnings = netWinnings.plus(jackpotAmount);
  }

  // Cập nhật số dư người chơi với tổng tiền thắng/thua
  await updatePlayerBalance(senderId, netWinnings, isWin || isJackpot);

  // Lưu dữ liệu game
  await saveGameData();

  const currentBalanceTotal = currentBalance.plus(netWinnings);

  const resultMessage = formatResultMessage(
    senderName,
    result,
    bets,
    winnings,
    netWinnings,
    currentBalance,
    currentBalanceTotal,
    isJackpot,
    jackpotAmount,
    gameState.data.baucua.jackpot
  );

  // Tạo hình ảnh kết quả
  const resultImagePath = await createResultImage(result);

  // Gửi kết quả kèm hình ảnh
  await api.sendMessage(
    {
      msg: resultMessage,
      mentions: [{ pos: 2, uid: senderId, len: senderName.length }],
      attachments: [resultImagePath],
      isUseProphylactic: true,
      ttl: TTL_IMAGE,
    },
    threadId,
    message.type
  );

  // Xóa file ảnh tạm sau khi gửi
  await clearImagePath(resultImagePath);
}

// Sửa đổi hàm parseBets
async function parseBets(content, currentBalance) {
  const bets = {};
  const allInBets = [];
  const betPairs = content.split(":");
  let remainingBalance = new Big(currentBalance);
  let insufficientFunds = false;

  for (const pair of betPairs) {
    const [type, amountBet] = pair.trim().split(" ");
    let emoji = null;
    let normalizedType = null;
    let amount = null;

    if (!amountBet) {
      const match = pair.trim().match(/^([a-zà-ỹ]+)(\d+%|\d+k|\d+m|\d+b|\d+|all|allin)$/i);
      if (!match) continue;

      const [, type, amountBet] = match;
      normalizedType = normalizeSymbolName(type);
      emoji = SYMBOL_EMOJIS[normalizedType];
      amount = amountBet;
    } else {
      normalizedType = normalizeSymbolName(type);
      emoji = SYMBOL_EMOJIS[normalizedType];
      amount = amountBet;
    }

    if (emoji) {
      try {
        const parsedAmount = parseGameAmount(amount, currentBalance);

        if (parsedAmount === "allin") {
          allInBets.push(emoji);
        } else {
          if (parsedAmount.gt(remainingBalance)) {
            insufficientFunds = true;
            break;
          }
          bets[emoji] = parsedAmount;
          remainingBalance = remainingBalance.minus(parsedAmount);
        }
      } catch (error) {
        throw new Error(error.message);
      }
    }
  }

  if (insufficientFunds) {
    throw new Error(`Số dư không đủ. Bạn chỉ có ${formatCurrency(new Big(currentBalance))} VNĐ.`);
  }

  if (allInBets.length > 0) {
    const allInAmount = remainingBalance.div(allInBets.length).round(0, Big.roundDown);
    for (const emoji of allInBets) {
      bets[emoji] = (bets[emoji] || new Big(0)).plus(allInAmount);
      remainingBalance = remainingBalance.minus(allInAmount);
    }

    if (remainingBalance.gt(0) && allInBets.length > 0) {
      bets[allInBets[0]] = bets[allInBets[0]].plus(remainingBalance);
    }
  }

  return bets;
}

function rollDice(playerBets) {
  const result = [];
  const availableSymbols = [...SYMBOL_LIST];

  // Điền các symbol còn lại
  while (result.length < 3) {
    const randomIndex = Math.floor(Math.random() * availableSymbols.length);
    const randomSymbol = availableSymbols[randomIndex];
    result.push(randomSymbol);
  }

  return result;
}

function calculateWinnings(bets, result) {
  let winnings = new Big(0);
  for (const [symbol, amount] of Object.entries(bets)) {
    const count = result.filter((s) => s === symbol).length;
    if (count > 0) {
      winnings = winnings.plus(new Big(amount).mul(new Big(1).plus(new Big(0.95).mul(count))));
    }
  }
  return winnings.round(0, Big.roundDown);
}

function formatResultMessage(
  senderName,
  result,
  bets,
  winnings,
  netWinnings,
  currentBalance,
  currentBalanceTotal,
  isJackpot,
  jackpotAmount,
  currentJackpot
) {
  let message = "";
  message += `[ ${senderName} ] đã đặt:\n`;
  for (const [symbol, amount] of Object.entries(bets)) {
    const isWin = result.includes(symbol);
    message += `${SYMBOL_NAMES[symbol]}: ${formatCurrency(new Big(amount))} VNĐ (${isWin ? "Win" : "Lose"})\n`;
  }

  message += `Tổng thắng: ${formatCurrency(new Big(winnings))} VNĐ\n`;

  if (isJackpot) {
    message += `🎉 NỔ HŨ 🎉\n`;
    message += `Tiền trúng hũ: +${formatCurrency(jackpotAmount)} VNĐ\n`;
  }

  if (netWinnings.gt(0)) {
    message += `Lợi nhuận: +${formatCurrency(netWinnings)} VNĐ 🎉`;
  } else {
    message += `Thua lỗ: ${formatCurrency(netWinnings)} VNĐ 😢`;
  }
  if (!isJackpot) {
    message += `\nHũ hiện tại: ${formatCurrency(currentJackpot)} VNĐ 💰`;
  }
  message += `\n\nSố dư biến động: ${formatCurrency(currentBalance)} -> ${formatCurrency(currentBalanceTotal)} VNĐ`;

  return message;
}

async function createResultImage(result) {
  const imageWidth = 400;
  const imageHeight = 400;
  const canvasWidth = imageWidth * 3;
  const canvasHeight = imageHeight;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  // Vẽ nền
  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  for (let i = 0; i < result.length; i++) {
    const symbol = result[i];
    const imagePath = path.join(
      process.cwd(),
      "src",
      "service-hahuyhoang",
      "game-service",
      "bau-cua",
      "image",
      `${SYMBOL_ICON_NAME[symbol].toLowerCase()}.png`
    );

    if (fs.existsSync(imagePath)) {
      const img = await loadImage(imagePath);
      ctx.drawImage(img, i * imageWidth, 0, imageWidth, imageHeight);
    } else {
      console.error(`Không tìm thấy hình ảnh cho ${SYMBOL_NAMES[symbol]}`);
    }
  }

  // Lưu canvas thành file ảnh
  const filePath = path.resolve(`./assets/temp/baucua_result_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

// Thêm hàm để lấy giá trị hũ hiện tại
export function getJackpot() {
  return gameState.data.baucua.jackpot;
}
