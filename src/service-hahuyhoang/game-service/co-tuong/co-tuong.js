import { createCanvas, loadImage } from "canvas";
import path from "path";
import fs from "fs/promises";
import { nameServer } from "../../../database/index.js";
import { updatePlayerBalance, getPlayerBalance } from "../../../database/player.js";
import { formatCurrency, parseGameAmount } from "../../../utils/format-util.js";
import { checkBeforeJoinGame } from "../index.js";
import { clearImagePath } from "../../canvas/index.js";
import { convertSVGtoPNG } from "./svg-converter.js";

// Lưu trạng thái các ván cờ đang diễn ra
const activeGames = new Map();

// Lưu trạng thái các lời thách đấu đang chờ
const pendingChallenges = new Map();

const ACCEPT_TIMEOUT = 60000; // 1 phút chờ accept

// Thêm các hằng số cho quân cờ
const PIECES = {
  // Quân đỏ
  rK: { type: 'K', color: 'red', name: 'Tướng' },
  rA: { type: 'A', color: 'red', name: 'Sĩ' },
  rB: { type: 'B', color: 'red', name: 'Tượng' },
  rN: { type: 'N', color: 'red', name: 'Ngựa' },
  rR: { type: 'R', color: 'red', name: 'Xe' },
  rC: { type: 'C', color: 'red', name: 'Pháo' },
  rP: { type: 'P', color: 'red', name: 'Tốt' },

  // Quân đen  
  bK: { type: 'K', color: 'black', name: 'Tướng' },
  bA: { type: 'A', color: 'black', name: 'Sĩ' },
  bB: { type: 'B', color: 'black', name: 'Tượng' },
  bN: { type: 'N', color: 'black', name: 'Ngựa' },
  bR: { type: 'R', color: 'black', name: 'Xe' },
  bC: { type: 'C', color: 'black', name: 'Pháo' },
  bP: { type: 'P', color: 'black', name: 'Tốt' }
};

// Cache cho hình ảnh quân cờ
const pieceImageCache = new Map();

// Hàm load hình ảnh quân cờ
async function loadPieceImage(pieceCode) {
  if (pieceImageCache.has(pieceCode)) {
    return pieceImageCache.get(pieceCode);
  }

  try {
    const svgPath = path.join(
      process.cwd(),
      "src",
      "service-hahuyhoang",
      "game-service", 
      "co-tuong",
      "pieces",
      `${pieceCode}.svg`
    );

    const pngBuffer = await convertSVGtoPNG(svgPath);
    if (pngBuffer) {
      const image = await loadImage(pngBuffer);
      pieceImageCache.set(pieceCode, image);
      return image;
    }
  } catch (error) {
    console.error(`Lỗi load hình ảnh quân cờ ${pieceCode}:`, error);
  }
  return null;
}

// Hàm khởi tạo bàn cờ
function initializeBoard() {
  const board = Array(10).fill(null).map(() => Array(9).fill(null));
  
  // Đặt quân đỏ (phía dưới)
  board[9][0] = 'rR'; board[9][8] = 'rR'; // Xe
  board[9][1] = 'rN'; board[9][7] = 'rN'; // Ngựa
  board[9][2] = 'rB'; board[9][6] = 'rB'; // Tượng
  board[9][3] = 'rA'; board[9][5] = 'rA'; // Sĩ
  board[9][4] = 'rK'; // Tướng
  board[7][1] = 'rC'; board[7][7] = 'rC'; // Pháo
  board[6][0] = 'rP'; board[6][2] = 'rP'; board[6][4] = 'rP'; // Tốt
  board[6][6] = 'rP'; board[6][8] = 'rP';

  // Đặt quân đen (phía trên)
  board[0][0] = 'bR'; board[0][8] = 'bR'; // Xe
  board[0][1] = 'bN'; board[0][7] = 'bN'; // Ngựa  
  board[0][2] = 'bB'; board[0][6] = 'bB'; // Tượng
  board[0][3] = 'bA'; board[0][5] = 'bA'; // Sĩ
  board[0][4] = 'bK'; // Tướng
  board[2][1] = 'bC'; board[2][7] = 'bC'; // Pháo
  board[3][0] = 'bP'; board[3][2] = 'bP'; board[3][4] = 'bP'; // Tốt
  board[3][6] = 'bP'; board[3][8] = 'bP';

  return board;
}

// Hàm chuyển đổi tọa độ từ ký hiệu sang số
function parsePosition(pos) {
  const col = pos.charCodeAt(0) - 'a'.charCodeAt(0);
  const row = 9 - (parseInt(pos[1]) - 1);
  return { row, col };
}

// Hàm kiểm tra nước đi hợp lệ
function makeMove(game, fromPos, toPos, playerColor) {
  try {
    const from = parsePosition(fromPos);
    const to = parsePosition(toPos);

    // Kiểm tra tọa độ có hợp lệ
    if (!isValidPosition(from) || !isValidPosition(to)) {
      return { valid: false, message: "Tọa độ không hợp lệ" };
    }

    const piece = game.board[from.row][from.col];
    
    // Kiểm tra có quân cờ tại vị trí xuất phát
    if (!piece) {
      return { valid: false, message: "Không có quân cờ tại vị trí xuất phát" };
    }

    // Kiểm tra quân cờ có phải của người chơi không
    if (piece[0] !== playerColor[0]) {
      return { valid: false, message: "Đây không phải quân cờ của bạn" };
    }

    // Kiểm tra luật di chuyển của từng loại quân
    if (!isValidMove(game.board, from, to, piece)) {
      return { valid: false, message: "Nước đi không hợp lệ" };
    }

    // Thực hiện nước đi
    const capturedPiece = game.board[to.row][to.col];
    game.board[to.row][to.col] = piece;
    game.board[from.row][from.col] = null;

    // Kiểm tra tự chiếu
    if (isInCheck(game.board, playerColor)) {
      // Hoàn tác nước đi
      game.board[from.row][from.col] = piece;
      game.board[to.row][to.col] = capturedPiece;
      return { valid: false, message: "Nước đi này sẽ để tướng bị chiếu" };
    }

    return { valid: true };
  } catch (error) {
    console.error("Lỗi kiểm tra nước đi:", error);
    return { valid: false, message: "Có lỗi xảy ra khi kiểm tra nước đi" };
  }
}

// Hàm kiểm tra tọa độ có nằm trong bàn cờ
function isValidPosition({ row, col }) {
  return row >= 0 && row < 10 && col >= 0 && col < 9;
}

// Hàm tìm game theo người chơi
function findGameByPlayer(playerId) {
  for (const game of activeGames.values()) {
    if (game.players.red === playerId || game.players.black === playerId) {
      return game;
    }
  }
  return null;
}

// Hàm kiểm tra người chơi có đang trong game
function isPlayerInGame(playerId) {
  return findGameByPlayer(playerId) !== null;
}

// Hàm lấy tên người chơi
async function getPlayerName(api, playerId) {
  try {
    const userInfo = await api.getUserInfo(playerId);
    return userInfo?.name || playerId;
  } catch {
    return playerId;
  }
}

export async function handleCoTuongCommand(api, message, groupSettings, commandMain) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings))) return;
  const { threadId, senderId, type } = message;
  const prefix = groupSettings?.prefix || getGlobalPrefix();
  const parts = message.body.slice(prefix.length).trim().split(" ");
  const command = parts[1].toLowerCase();

  switch (command) {
    case "invite":
    case "thachdau":
      if (parts.length < 3) {
        await api.sendMessage(
          {
            msg: `${nameServer}: Sử dụng: ${prefix}${commandMain} ${command} <số tiền> @tag
Ví dụ: ${prefix}${commandMain} ${command} 10000 @nguoichoi`,
            quote: message,
          },
          threadId,
          type
        );
        return;
      }
      await handleChallenge(api, message, parts);
      break;

    case "move":
    case "datco":
      if (parts.length < 3) {
        await api.sendMessage(
          {
            msg: `${nameServer}: Sử dụng: ${prefix}${commandMain} ${command} <tọa độ gốc> <tọa độ đích>
Ví dụ: ${prefix}${commandMain} ${command} e2 e4`,
            quote: message,
          },
          threadId,
          type
        );
        return;
      }
      await handleMove(api, message, parts);
      break;

    case "surrender":
    case "dauhang":
      await handleSurrender(api, message);
      break;
  }
}

async function handleChallenge(api, message, parts) {
  const { threadId, senderId, type } = message;
  const mentions = message.mentions;

  // Kiểm tra mention
  if (!mentions || Object.keys(mentions).length !== 1) {
    await api.sendMessage({ msg: `${nameServer}: Vui lòng chỉ thách đấu 1 người chơi`, quote: message }, threadId, type);
    return;
  }

  const opponentId = Object.keys(mentions)[0];

  // Kiểm tra không thách đấu chính mình
  if (opponentId === senderId) {
    await api.sendMessage({ msg: `${nameServer}: Bạn không thể thách đấu chính mình`, quote: message }, threadId, type);
    return;
  }

  // Kiểm tra người chơi không trong game khác
  if (isPlayerInGame(senderId) || isPlayerInGame(opponentId)) {
    await api.sendMessage({ msg: `${nameServer}: Một trong hai người chơi đang trong ván cờ khác`, quote: message }, threadId, type);
    return;
  }

  // Parse và kiểm tra số tiền cược
  const balance = await getPlayerBalance(senderId);
  let betAmount;
  try {
    betAmount = parseGameAmount(parts[2], balance.balance);
    if (betAmount.lt(1000)) {
      await api.sendMessage({ msg: `${nameServer}: Số tiền cược tối thiểu là 1,000 VNĐ`, quote: message }, threadId, type);
      return;
    }
  } catch (error) {
    await api.sendMessage({ msg: `${nameServer}: ${error.message}`, quote: message }, threadId, type);
    return;
  }

  // Kiểm tra số dư
  if (new Big(balance.balance).lt(betAmount)) {
    await api.sendMessage(
      { msg: `${nameServer}: Số dư không đủ. Bạn chỉ có ${formatCurrency(balance.balance)} VNĐ`, quote: message },
      threadId,
      type
    );
    return;
  }

  // Tạo challenge mới
  const challenge = {
    challenger: senderId,
    opponent: opponentId,
    betAmount,
    threadId,
    timestamp: Date.now(),
    messageId: null,
  };

  // Gửi thông báo thách đấu
  const challengeMsg = await api.sendMessage(
    {
      msg: `${nameServer}: 🎮 Thách đấu cờ tướng!
👤 ${message.data.dName} thách đấu ${mentions[opponentId]}
💰 Tiền cược: ${formatCurrency(betAmount)} VNĐ
⏳ Thời gian chấp nhận: 60 giây
👉 Thả reaction bất kỳ để chấp nhận!`,
      mentions: [
        { pos: 2, uid: senderId, len: message.data.dName.length },
        { pos: message.data.dName.length + 13, uid: opponentId, len: mentions[opponentId].length },
      ],
    },
    threadId,
    type
  );

  challenge.messageId = challengeMsg.messageID;
  pendingChallenges.set(challengeMsg.messageID, challenge);

  // Set timeout để xóa challenge nếu không được chấp nhận
  setTimeout(() => {
    if (pendingChallenges.has(challengeMsg.messageID)) {
      pendingChallenges.delete(challengeMsg.messageID);
      api.sendMessage({ msg: `${nameServer}: ⌛ Hết thời gian chấp nhận thách đấu` }, threadId, type);
    }
  }, ACCEPT_TIMEOUT);
}

// Xử lý khi có người reaction để accept
export async function handleReaction(api, reaction) {
  const { messageID, threadID, userID } = reaction;

  // Kiểm tra có phải tin nhắn thách đấu không
  const challenge = pendingChallenges.get(messageID);
  if (!challenge) return;

  // Kiểm tra người react có phải người được thách đấu không
  if (userID !== challenge.opponent) return;

  // Kiểm tra thời gian còn hiệu lực
  if (Date.now() - challenge.timestamp > ACCEPT_TIMEOUT) {
    pendingChallenges.delete(messageID);
    await api.sendMessage({ msg: `${nameServer}: ⌛ Thách đấu đã hết hạn` }, threadID, "message");
    return;
  }

  // Kiểm tra số dư của người được thách đấu
  const opponentBalance = await getPlayerBalance(challenge.opponent);
  if (new Big(opponentBalance.balance).lt(challenge.betAmount)) {
    await api.sendMessage({ msg: `${nameServer}: Số dư của đối thủ không đủ để chấp nhận thách đấu` }, threadID, "message");
    return;
  }

  // Xóa challenge khỏi danh sách chờ
  pendingChallenges.delete(messageID);

  // Tạo ván cờ mới
  const gameId = `${threadID}_${Date.now()}`;
  const game = {
    id: gameId,
    threadId: threadID,
    players: {
      red: challenge.challenger,
      black: challenge.opponent,
    },
    betAmount: challenge.betAmount,
    board: initializeBoard(),
    currentTurn: "red", // Quân đỏ đi trước
    moveHistory: [],
    lastMoveTime: Date.now(),
  };

  activeGames.set(gameId, game);

  // Vẽ và gửi bàn cờ
  const boardImage = await drawBoard(game);
  await api.sendMessage(
    {
      msg: `${nameServer}: 🎮 Ván cờ bắt đầu!
🔴 Quân đỏ: ${await getPlayerName(api, challenge.challenger)}
⚫ Quân đen: ${await getPlayerName(api, challenge.opponent)}
💰 Tiền cược: ${formatCurrency(challenge.betAmount)} VNĐ
⏳ Lượt đi: Quân đỏ`,
      attachments: [boardImage],
    },
    threadID,
    "message"
  );

  await clearImagePath(boardImage);
}

async function handleMove(api, message, parts) {
  const { threadId, senderId, type } = message;

  // Kiểm tra người chơi có đang trong game không
  const game = findGameByPlayer(senderId);
  if (!game) {
    await api.sendMessage({ msg: `${nameServer}: Bạn không trong ván cờ nào`, quote: message }, threadId, type);
    return;
  }

  // Kiểm tra có phải lượt của người chơi không
  const playerColor = game.players.red === senderId ? "red" : "black";
  if (game.currentTurn !== playerColor) {
    await api.sendMessage({ msg: `${nameServer}: Chưa đến lượt của bạn`, quote: message }, threadId, type);
    return;
  }

  const [fromPos, toPos] = [parts[1].toLowerCase(), parts[2].toLowerCase()];

  // Validate và thực hiện nước đi
  try {
    const moveResult = makeMove(game, fromPos, toPos, playerColor);
    if (!moveResult.valid) {
      await api.sendMessage({ msg: `${nameServer}: ${moveResult.message}`, quote: message }, threadId, type);
      return;
    }

    // Cập nhật game state
    game.currentTurn = game.currentTurn === "red" ? "black" : "red";
    game.lastMoveTime = Date.now();
    game.moveHistory.push({ from: fromPos, to: toPos, player: playerColor });

    // Kiểm tra chiếu tướng/hết cờ
    const gameStatus = checkGameStatus(game);

    // Vẽ và gửi bàn cờ mới
    const boardImage = await drawBoard(game);
    let statusMsg = `${nameServer}: 🎮 Nước đi: ${fromPos} → ${toPos}
⏳ Lượt đi: ${game.currentTurn === "red" ? "Quân đỏ" : "Quân đen"}`;

    if (gameStatus.isCheck) {
      statusMsg += "\n⚠️ CHIẾU TƯỚNG!";
    }

    if (gameStatus.isCheckmate) {
      // Kết thúc game
      const winner = playerColor;
      await endGame(api, game, winner);
      statusMsg += `\n🎉 CHIẾU BÍ! ${await getPlayerName(api, game.players[winner])} thắng!`;
    }

    await api.sendMessage(
      {
        msg: statusMsg,
        attachments: [boardImage],
      },
      threadId,
      type
    );

    await clearImagePath(boardImage);
  } catch (error) {
    console.error("Lỗi xử lý nước đi:", error);
    await api.sendMessage({ msg: `${nameServer}: Có lỗi xảy ra khi thực hiện nước đi`, quote: message }, threadId, type);
  }
}

async function handleSurrender(api, message) {
  const { threadId, senderId, type } = message;

  const game = findGameByPlayer(senderId);
  if (!game) {
    await api.sendMessage({ msg: `${nameServer}: Bạn không trong ván cờ nào`, quote: message }, threadId, type);
    return;
  }

  const winner = game.players.red === senderId ? "black" : "red";
  await endGame(api, game, winner);

  await api.sendMessage(
    {
      msg: `${nameServer}: 🏳️ ${await getPlayerName(api, senderId)} đã đầu hàng!
🎉 ${await getPlayerName(api, game.players[winner])} thắng!`,
    },
    threadId,
    type
  );
}

async function endGame(api, game, winner) {
  // Xử lý tiền cược
  const loser = winner === "red" ? "black" : "red";
  await updatePlayerBalance(game.players[winner], game.betAmount, true);
  await updatePlayerBalance(game.players[loser], game.betAmount.neg(), false);

  // Xóa game khỏi danh sách active
  activeGames.delete(game.id);
}

async function drawBoard(game) {
  const canvas = createCanvas(800, 900);
  const ctx = canvas.getContext("2d");

  // Vẽ background
  ctx.fillStyle = "#f0d9b5";
  ctx.fillRect(0, 0, 800, 900);

  // Vẽ lưới bàn cờ
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;

  // Vẽ các đường ngang và dọc
  for (let i = 0; i < 10; i++) {
    // Đường ngang
    ctx.beginPath();
    ctx.moveTo(100, 100 + i * 80);
    ctx.lineTo(700, 100 + i * 80);
    ctx.stroke();

    // Đường dọc
    if (i < 9) {
      ctx.beginPath();
      ctx.moveTo(100 + i * 75, 100);
      ctx.lineTo(100 + i * 75, 820);
      ctx.stroke();
    }
  }

  // Vẽ các quân cờ
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      const piece = game.board[row][col];
      if (piece) {
        const x = 100 + col * 75;
        const y = 100 + row * 80;

        // Load và vẽ hình ảnh quân cờ
        const pieceImage = await loadPieceImage(piece);
        if (pieceImage) {
          ctx.drawImage(pieceImage, x - 25, y - 25, 50, 50);
        }
      }
    }
  }

  // Lưu canvas thành file ảnh
  const filePath = path.resolve(`./assets/temp/cotuong_${game.id}_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

// Thêm các hàm kiểm tra luật đi

function isValidMove(board, from, to, piece) {
  // Không thể ăn quân cùng màu
  const targetPiece = board[to.row][to.col];
  if (targetPiece && targetPiece[0] === piece[0]) {
    return false;
  }

  const pieceType = piece[1];
  switch (pieceType) {
    case 'K': return isValidKingMove(board, from, to, piece[0]);
    case 'A': return isValidAdvisorMove(board, from, to, piece[0]);
    case 'B': return isValidBishopMove(board, from, to, piece[0]);
    case 'N': return isValidKnightMove(board, from, to);
    case 'R': return isValidRookMove(board, from, to);
    case 'C': return isValidCannonMove(board, from, to);
    case 'P': return isValidPawnMove(board, from, to, piece[0]);
    default: return false;
  }
}

// Kiểm tra nước đi của Tướng
function isValidKingMove(board, from, to, color) {
  // Tướng chỉ được đi trong cung
  const isRedKing = color === 'r';
  const palace = isRedKing ? 
    { minRow: 7, maxRow: 9, minCol: 3, maxCol: 5 } :
    { minRow: 0, maxRow: 2, minCol: 3, maxCol: 5 };

  if (to.row < palace.minRow || to.row > palace.maxRow ||
      to.col < palace.minCol || to.col > palace.maxCol) {
    return false;
  }

  // Tướng chỉ được đi 1 bước theo chiều ngang hoặc dọc
  const rowDiff = Math.abs(to.row - from.row);
  const colDiff = Math.abs(to.col - from.col);
  return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
}

// Kiểm tra nước đi của Sĩ
function isValidAdvisorMove(board, from, to, color) {
  // Sĩ chỉ được đi trong cung
  const isRedAdvisor = color === 'r';
  const palace = isRedAdvisor ? 
    { minRow: 7, maxRow: 9, minCol: 3, maxCol: 5 } :
    { minRow: 0, maxRow: 2, minCol: 3, maxCol: 5 };

  if (to.row < palace.minRow || to.row > palace.maxRow ||
      to.col < palace.minCol || to.col > palace.maxCol) {
    return false;
  }

  // Sĩ chỉ được đi chéo 1 bước
  const rowDiff = Math.abs(to.row - from.row);
  const colDiff = Math.abs(to.col - from.col);
  return rowDiff === 1 && colDiff === 1;
}

// Kiểm tra nước đi của Tượng
function isValidBishopMove(board, from, to, color) {
  // Tượng không được qua sông
  const isRedBishop = color === 'r';
  if (isRedBishop && to.row < 5) return false;
  if (!isRedBishop && to.row > 4) return false;

  // Tượng đi chéo 2 bước
  const rowDiff = Math.abs(to.row - from.row);
  const colDiff = Math.abs(to.col - from.col);
  if (rowDiff !== 2 || colDiff !== 2) return false;

  // Kiểm tra có bị chặn ở giữa không
  const midRow = (from.row + to.row) / 2;
  const midCol = (from.col + to.col) / 2;
  return !board[midRow][midCol]; // Không có quân cản giữa
}

// Kiểm tra nước đi của Ngựa
function isValidKnightMove(board, from, to) {
  const rowDiff = Math.abs(to.row - from.row);
  const colDiff = Math.abs(to.col - from.col);
  
  // Ngựa đi hình chữ L (2-1)
  if (!((rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2))) {
    return false;
  }

  // Kiểm tra chân ngựa có bị cản không
  let midRow = from.row;
  let midCol = from.col;

  if (rowDiff === 2) {
    midRow = from.row + (to.row > from.row ? 1 : -1);
  } else {
    midCol = from.col + (to.col > from.col ? 1 : -1);
  }

  return !board[midRow][midCol]; // Không có quân cản chân ngựa
}

// Kiểm tra nước đi của Xe
function isValidRookMove(board, from, to) {
  const rowDiff = Math.abs(to.row - from.row);
  const colDiff = Math.abs(to.col - from.col);

  // Xe chỉ được đi thẳng
  if (rowDiff !== 0 && colDiff !== 0) return false;

  // Kiểm tra có quân cản đường không
  const minRow = Math.min(from.row, to.row);
  const maxRow = Math.max(from.row, to.row);
  const minCol = Math.min(from.col, to.col);
  const maxCol = Math.max(from.col, to.col);

  if (rowDiff === 0) {
    // Đi ngang
    for (let col = minCol + 1; col < maxCol; col++) {
      if (board[from.row][col]) return false;
    }
  } else {
    // Đi dọc
    for (let row = minRow + 1; row < maxRow; row++) {
      if (board[row][from.col]) return false;
    }
  }

  return true;
}

// Kiểm tra nước đi của Pháo
function isValidCannonMove(board, from, to) {
  const rowDiff = Math.abs(to.row - from.row);
  const colDiff = Math.abs(to.col - from.col);

  // Pháo chỉ được đi thẳng
  if (rowDiff !== 0 && colDiff !== 0) return false;

  let pieceCount = 0;
  const targetPiece = board[to.row][to.col];

  // Đếm số quân cờ trên đường đi
  if (rowDiff === 0) {
    // Đi ngang
    const minCol = Math.min(from.col, to.col);
    const maxCol = Math.max(from.col, to.col);
    for (let col = minCol + 1; col < maxCol; col++) {
      if (board[from.row][col]) pieceCount++;
    }
  } else {
    // Đi dọc
    const minRow = Math.min(from.row, to.row);
    const maxRow = Math.max(from.row, to.row);
    for (let row = minRow + 1; row < maxRow; row++) {
      if (board[row][from.col]) pieceCount++;
    }
  }

  // Pháo có thể đi thẳng khi không có quân cản
  // hoặc ăn quân khi có đúng 1 quân làm bàn đạp
  return (pieceCount === 0 && !targetPiece) || 
         (pieceCount === 1 && targetPiece);
}

// Kiểm tra nước đi của Tốt
function isValidPawnMove(board, from, to, color) {
  const isRedPawn = color === 'r';
  const forward = isRedPawn ? -1 : 1;
  const rowDiff = to.row - from.row;
  const colDiff = Math.abs(to.col - from.col);

  // Tốt chỉ được đi 1 bước
  if (Math.abs(rowDiff) > 1 || colDiff > 1) return false;
  if (rowDiff === 0 && colDiff !== 1) return false;

  // Trước khi qua sông chỉ được đi thẳng
  const hasCrossedRiver = isRedPawn ? from.row <= 4 : from.row >= 5;
  if (!hasCrossedRiver) {
    return rowDiff === forward && colDiff === 0;
  }

  // Sau khi qua sông được đi ngang
  return (rowDiff === forward && colDiff === 0) || 
         (rowDiff === 0 && colDiff === 1);
}

// Kiểm tra tình trạng chiếu tướng
function checkGameStatus(game) {
  const status = {
    isCheck: false,
    isCheckmate: false
  };

  // Tìm vị trí 2 quân tướng
  let redKingPos, blackKingPos;
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      const piece = game.board[row][col];
      if (piece === 'rK') redKingPos = { row, col };
      if (piece === 'bK') blackKingPos = { row, col };
    }
  }

  // Kiểm tra tướng đối mặt
  if (redKingPos.col === blackKingPos.col) {
    let hasBlockingPiece = false;
    for (let row = redKingPos.row - 1; row > blackKingPos.row; row--) {
      if (game.board[row][redKingPos.col]) {
        hasBlockingPiece = true;
        break;
      }
    }
    if (!hasBlockingPiece) {
      status.isCheck = true;
      status.isCheckmate = true; // Tướng đối mặt là chiếu bí
      return status;
    }
  }

  // Kiểm tra chiếu tướng từ các quân khác
  const kingPos = game.currentTurn === 'red' ? redKingPos : blackKingPos;
  const opponentColor = game.currentTurn === 'red' ? 'b' : 'r';

  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      const piece = game.board[row][col];
      if (piece && piece[0] === opponentColor) {
        if (isValidMove(game.board, { row, col }, kingPos, piece)) {
          status.isCheck = true;
          break;
        }
      }
    }
  }

  return status;
}
