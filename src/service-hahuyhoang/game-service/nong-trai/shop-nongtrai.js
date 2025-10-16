import { SHOP_ITEMS, CROPS, SOIL_STATUS, PRODUCT_CODES } from "./data-nongtrai.js";
import { getPlayerBalance, updatePlayerBalance } from "../../../database/player.js";
import { checkItemQuantity, setHasChangeState, TIME_TO_LIVE, updatePlayerBagHasSetting } from "./nong-trai.js";
import { formatBigNumber } from "../../../utils/format-util.js";
import Big from "big.js";
import { getGlobalPrefix } from "../../service.js";
import { drawShopCanvas } from "./cv-shop.js";

// Thêm hàm tính giá đất dựa trên số lượng đất hiện tại
export function calculateLandPrice(currentPlots) {
  const basePrice = new Big(SHOP_ITEMS.LAND.price);
  if (currentPlots >= 4) {
    // Từ mảnh thứ 5 trở đi, giá tăng gấp đôi cho mỗi mảnh
    return basePrice.times(Big(2).pow(currentPlots - 4)).toNumber();
  }
  return basePrice.toNumber();
}

// Hiển thị shop
export function formatShopItems(landPrice) {
  let shopMsg = "🏪 NÔNG TRẠI SHOP 🏪\n\n";
  shopMsg += "📦 VẬT PHẨM:\n";

  Object.entries(SHOP_ITEMS).forEach(([key, item]) => {
    if (key === "LAND") {
      shopMsg += `${item.icon} [${item.code}] ${item.name}: ${landPrice.toLocaleString("vi-VN")} VNĐ\n`;
      shopMsg += `➥ ${item.description}\n\n`;
    } else {
      shopMsg += `${item.icon} [${item.code}] ${item.name}: ${item.price.toLocaleString("vi-VN")} VNĐ\n`;
      shopMsg += `➥ ${item.description}\n\n`;
    }
  });

  shopMsg += "🌱 HẠT GIỐNG:\n";
  Object.entries(CROPS).forEach(([key, crop]) => {
    shopMsg += `${crop.icon} [${crop.code}] ${crop.name}: ${crop.seedPrice.toLocaleString("vi-VN")} VNĐ\n`;
    shopMsg += `➥ Thu hoạch sau ${crop.growthTime / 60} phút\n`;
    shopMsg += `➥ Thu hoạch được ${crop.harvestValue.toLocaleString("vi-VN")} VNĐ\n\n`;
  });

  return shopMsg;
}

// Thêm hàm mở rộng đất
async function expandFarm(farm) {
  const newPlot = {
    crop: null,
    plantedAt: null,
    waterLevel: 100,
    lastWateredAt: Date.now(),
    status: SOIL_STATUS.GOOD,
    fertilized: null,
  };

  farm.plots.push(newPlot);
  setHasChangeState(true);

  return farm;
}

export async function handleBuyProduct(api, message, farm, buyProductCode, quantity) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;

  const product = PRODUCT_CODES[buyProductCode];
  if (!product) {
    await api.sendMessage(
      { msg: "Mã sản phẩm không tồn tại! Sử dụng lệnh !nongtrai shop để xem danh sách.", quote: message },
      threadId,
      message.type
    );
    return false;
  }

  if (product.type === "ITEM") {
    if (product.key === "LAND") {
      const buyResult = await buyItem(senderId, product.key, quantity, farm.plots.length);
      if (buyResult.success) {
        await expandFarm(farm);
        await api.sendMessage(
          {
            msg: `${buyResult.message}\nSố ô đất hiện tại: ${farm.plots.length}`,
            quote: message,
            ttl: TIME_TO_LIVE,
          },
          threadId,
          message.type
        );
      } else {
        await api.sendMessage({ msg: buyResult.message, quote: message, ttl: TIME_TO_LIVE }, threadId, message.type);
      }
      return true;
    } else {
      const buyResult = await buyItem(senderId, product.key, quantity);
      if (buyResult.success) {
        await updatePlayerBagHasSetting(farm, buyProductCode, quantity);
      }
      await api.sendMessage({ msg: buyResult.message, quote: message, ttl: TIME_TO_LIVE }, threadId, message.type);
    }
  } else if (product.type === "CROP") {
    const buyResult = await buySeed(senderId, product.key, quantity);
    if (buyResult.success) {
      await updatePlayerBagHasSetting(farm, buyProductCode, quantity);
    }
    await api.sendMessage({ msg: buyResult.message, quote: message, ttl: TIME_TO_LIVE }, threadId, message.type);
  }
  return true;
}

// Sửa lại hàm tính bonus dựa trên số ô đất
function calculateBonus(plotCount) {
  // Bonus bắt đầu từ ô thứ 6 (thay vì ô thứ 8)
  if (plotCount < 6) return 0;

  // Tính số mốc đạt được (mỗi 6 ô tính là 1 mốc thay vì 4 ô)
  // Bắt đầu từ mốc 6, sau đó là 12, 18, 24, 30...
  let milestone = 0;

  if (plotCount >= 12) {
    // Từ ô 12 trở đi, cứ mỗi 6 ô tăng 1 mốc
    milestone = Math.floor((plotCount - 12) / 6) + 2; // +2 cho 2 mốc đầu (6 và 12)
  } else if (plotCount >= 6) {
    // Từ 6-11 ô tính là mốc đầu tiên
    milestone = 1;
  }

  // Mỗi mốc tăng 200% giá bán, tối đa 3000%
  const bonusPercent = Math.min(milestone * 2.0, 30.0);

  return bonusPercent;
}

// Sửa lại hàm sellProduct
async function sellProduct(farm, senderId, productCode, quantity = 1) {
  // Kiểm tra số lượng trong túi
  const currentQuantity = await checkItemQuantity(farm, productCode);
  if (currentQuantity <= 0) {
    return {
      success: false,
      message: `Bạn không có sản phẩm này trong túi!`,
    };
  }

  // Xử lý trường hợp bán hết
  const sellQuantity = quantity === "all" ? currentQuantity : quantity;

  // Lấy thông tin sản phẩm từ PRODUCT_CODES
  const productInfo = PRODUCT_CODES[productCode];
  if (!productInfo) {
    return { success: false, message: "Mã sản phẩm không hợp lệ!" };
  }

  let sellValue = 0;
  let itemName = "";
  let itemIcon = "";
  let bonusMsg = "";

  // Đọc dữ liệu nông trại để lấy số ô đất
  const plotCount = farm ? farm.plots.length : 4; // Mặc định 4 ô nếu chưa có farm

  switch (productInfo.type) {
    case "PRODUCT": // Thành phẩm thu hoạch
      const cropInfo = CROPS[productInfo.key];
      // Tính toán bonus dựa trên s ô đất
      const bonus = calculateBonus(plotCount);
      const baseValue = cropInfo.harvestValue * sellQuantity;
      sellValue = Math.floor(baseValue * (1 + bonus));

      if (bonus > 0) {
        bonusMsg = `\n\n💎 Tiền bán nông sản đã tăng thêm ${Math.floor(bonus * 100)}% nhờ có ${plotCount} ô đất!`;
      }

      itemName = cropInfo.name;
      itemIcon = cropInfo.icon;
      break;

    case "CROP": // Hạt giống
      const seedInfo = CROPS[productInfo.key];
      sellValue = Math.floor(seedInfo.seedPrice * 0.9) * sellQuantity; // Hoàn lại 90% giá mua
      itemName = `Hạt giống ${seedInfo.name}`;
      itemIcon = seedInfo.icon;
      break;

    case "ITEM": // Vật phẩm
      const itemInfo = SHOP_ITEMS[productInfo.key];
      sellValue = Math.floor(itemInfo.price * 0.9) * sellQuantity; // Hoàn lại 90% giá mua
      itemName = itemInfo.name;
      itemIcon = itemInfo.icon;
      break;

    default:
      return { success: false, message: "Loại sản phẩm không hợp lệ!" };
  }

  // Trừ sản phẩm khỏi túi
  await updatePlayerBagHasSetting(farm, productCode, -sellQuantity);

  // Cộng tiền vào tài khoản
  await updatePlayerBalance(senderId, sellValue);

  return {
    success: true,
    message: `Đã bán ${sellQuantity} ${itemIcon} ${itemName} với giá ${sellValue.toLocaleString("vi-VN")} VNĐ!${bonusMsg}`,
  };
}

export async function handleSellProduct(api, message, farm, args) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix();

  if (args.length < 2) {
    await api.sendMessage(
      {
        msg: `Vui lòng nhập mã sản phẩm cần bán. Ví dụ:\n${prefix}nongtrai sell L1_TP 5\n${prefix}nongtrai sell L1_TP all`,
        quote: message,
      },
      threadId,
      message.type
    );
    return;
  }

  const sellProductCode = args[1].toUpperCase();
  const sellQuantity = args[2] ? (args[2].toLowerCase() === "all" ? "all" : parseInt(args[2])) : 1;

  if (sellQuantity !== "all" && (isNaN(sellQuantity) || sellQuantity <= 0)) {
    await api.sendMessage({ msg: "Số lượng không hợp lệ!", quote: message, ttl: TIME_TO_LIVE }, threadId, message.type);
    return;
  }

  const sellResult = await sellProduct(farm, senderId, sellProductCode, sellQuantity);
  await api.sendMessage({ msg: sellResult.message, quote: message, ttl: TIME_TO_LIVE }, threadId, message.type);
}

export function formatCropsList() {
  let msg = "🌱 DANH SÁCH HẠT GIỐNG 🌱\n\n";
  Object.entries(CROPS).forEach(([key, crop]) => {
    msg += `${crop.icon} [${crop.code}] ${crop.name} - ${crop.seedPrice.toLocaleString("vi-VN")} VNĐ\n`;
  });
  return msg;
}

export async function buyItem(senderId, itemType, quantity = 1, currentPlots = 4) {
  const item = SHOP_ITEMS[itemType];
  if (!item) {
    return { success: false, message: "Vật phẩm không tồn tại!" };
  }

  let totalCost;
  if (itemType === "LAND") {
    if (quantity > 1) {
      return { success: false, message: "Chỉ có thể mua 1 mảnh đất mỗi lần!" };
    }
    totalCost = new Big(calculateLandPrice(currentPlots));
  } else {
    try {
      totalCost = new Big(item.price).times(quantity);
    } catch (error) {
      return { success: false, message: "Số lượng không hợp lệ! Vui lòng nhập số nguyên lớn hơn 0." };
    }
  }

  const balance = await getPlayerBalance(senderId);
  if (!balance.success || new Big(balance.balance).lt(totalCost)) {
    return {
      success: false,
      message: `Bạn không đủ tiền! Cần ${totalCost.toNumber().toLocaleString("vi-VN")} VNĐ, bạn chỉ có ${formatBigNumber(
        balance.balance
      )} VNĐ`,
    };
  }

  await updatePlayerBalance(senderId, totalCost.neg().toNumber());
  return {
    success: true,
    message: `Đã mua thành công ${quantity} ${item.name} với giá ${totalCost.toNumber().toLocaleString("vi-VN")} VNĐ!`,
    item: item,
  };
}

// Mua hạt giống
export async function buySeed(senderId, cropType, quantity = 1) {
  const crop = CROPS[cropType];
  if (!crop) {
    return { success: false, message: "Loại cây không tồn tại!" };
  }

  let totalCost;
  try {
    totalCost = new Big(crop.seedPrice).times(quantity);
  } catch (error) {
    return { success: false, message: "Số lượng không hợp lệ! Vui lòng nhập số nguyên lớn hơn 0." };
  }

  const balance = await getPlayerBalance(senderId);
  if (!balance.success || new Big(balance.balance).lt(totalCost)) {
    return {
      success: false,
      message: `Bạn không đủ tiền! Cần ${totalCost.toNumber().toLocaleString("vi-VN")} VNĐ, bạn chỉ có ${formatBigNumber(
        balance.balance
      )} VNĐ`,
    };
  }

  await updatePlayerBalance(senderId, totalCost.neg().toNumber());
  return {
    success: true,
    message: `Đã mua thành công ${quantity} hạt giống ${crop.name} với giá ${totalCost.toNumber().toLocaleString("vi-VN")} VNĐ!`,
    crop: crop,
  };
}

async function handleShopCommand(api, message, farm, args) {
  const threadId = message.threadId;
  if (args.length >= 2) {
    const buyProductCode = args[1].toUpperCase();
    const quantity = args[2] ? parseInt(args[2]) : 1;
    await handleBuyProduct(api, message, farm, buyProductCode, quantity);
  } else {
    // Vẽ shop canvas thay vì gửi text
    const shopImage = await drawShopCanvas();
    await api.sendMessage(
      {
        msg: "🏪 NÔNG TRẠI SHOP 🏪\nSử dụng !nongtrai buy [mã] [số lượng] để mua hàng",
        attachments: [shopImage],
        quote: message,
        isUseProphylactic: true,
        ttl: TIME_TO_LIVE,
      },
      threadId,
      message.type
    );
  }
}
