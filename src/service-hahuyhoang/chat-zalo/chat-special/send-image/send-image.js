import fs from "fs";
import path from "path";
import axios from "axios";
import { MessageMention } from "zlbotdqt";
import { tempDir } from "../../../../utils/io-json.js";
import { removeMention } from "../../../../utils/format-util.js";

// Cấu hình
const CONFIG = {
  saveDir: tempDir,
  baseDataPath: path.resolve(process.cwd(), "src", "service-hahuyhoang", "chat-zalo", "chat-special", "send-image", "data"),
  maxAttempts: 30,
  minImageSize: 10,
  downloadTimeout: 1000,
};

// Cấu hình loại ảnh
const IMAGE_TYPES = {
  girl: {
    variants: {
      default: { source: "girl.txt", ttl: 300000, downloadTimeout: 800 },
      sexy: { source: "girlsexy.txt", ttl: 180000, type: "Sexy" },
      nguc: { api: "https://api.sumiproject.net/images/du", ttl: 180000, type: "Ngực" },
      lon: { source: "girllon.txt", ttl: 30000, show: false, type: "Butterfly" },
      nude: { source: "girlnude.txt", ttl: 30000, type: "Khỏa Thân" },
      cosplay: { source: "cosplay.txt", ttl: 300000, type: "Cosplay" },
      anime: { source: "anime.txt", ttl: 300000, type: "Anime" },
    },
    text: "z_thinh_girl.txt",
  },
  boy: {
    variants: {
      default: { source: "boy.txt", ttl: 300000 },
      "6mui": { source: "boy6mui.txt", ttl: 300000, type: "6 Múi" },
    },
    text: "z_thinh_boy.txt",
  },
  cosplay: {
    variants: {
      default: { source: "cosplay.txt", ttl: 300000 },
    },
    text: "z_thinh_cosplay.txt",
  },
  anime: {
    variants: {
      default: { source: "anime.txt", ttl: 300000 },
    },
    text: "z_thinh_anime.txt",
  },
};

const KEYWORD_MAPPING = {
  girl: {
    sexy: ["sexy", "hot", "gợi cảm"],
    nguc: ["nguc", "ngực", "vú", "vu", "dú", "du", "zu", "zú"],
    lon: ["lonofes"],
    // nude: ["nude", "khỏa thân"],
    cosplay: ["cos", "cosplay", "phim ảnh"],
    anime: ["anime", "wibu", "anm"],
  },
  boy: {
    "6mui": ["6mui", "6 múi", "cơ bụng"],
  },
};

async function downloadImage(url, filePath, timeout) {
  try {
    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
      timeout: timeout,
    });

    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      writer.on("finish", () => {
        const fileSizeInKb = fs.statSync(filePath).size / 1024;
        if (fileSizeInKb < CONFIG.minImageSize) {
          fs.unlinkSync(filePath);
          reject(new Error("Kích thước ảnh quá nhỏ"));
        } else {
          resolve();
        }
      });

      writer.on("error", (err) => {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        reject(err);
      });
    });
  } catch (error) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    throw error.code === "ECONNABORTED" ? new Error("Hết thời gian chờ khi tải ảnh") : error;
  }
}

// Thêm hàm mới để lấy links ảnh
async function getImageLinks(config) {
  const variantConfig = config.variantConfig;

  if (variantConfig.source) {
    // Nếu là source, đọc từ file txt
    const imagePath = path.join(CONFIG.baseDataPath, "Image", variantConfig.source);
    return fs.readFileSync(imagePath, "utf-8").split("\n").filter(Boolean);
  } else if (variantConfig.api) {
    // Nếu là api, gọi API để lấy data
    try {
      const response = await axios.get(variantConfig.api);
      if (response.status === 200) {
        return response.data.url.trim();
      }
      throw new Error(`Lỗi khi tải ảnh từ nguồn: mã trạng thái ${response.status}`);
    } catch (error) {
      console.error("Lỗi khi lấy dữ liệu từ API:", error);
      throw error;
    }
  }
  throw new Error("Không tìm thấy nguồn ảnh");
}

function getImageConfig(type, content) {
  const typeConfig = IMAGE_TYPES[type];
  if (!typeConfig) return null;

  let variant = "default";

  const typeKeywords = KEYWORD_MAPPING[type];
  if (typeKeywords) {
    const normalizedContent = content.toLowerCase();
    for (const [variantName, keywords] of Object.entries(typeKeywords)) {
      if (keywords.some((keyword) => normalizedContent.includes(keyword))) {
        variant = variantName;
        break;
      }
    }
  }

  const variantConfig = typeConfig.variants[variant];
  return {
    variantConfig,
    textFile: typeConfig.text,
    ttl: variantConfig.ttl,
    downloadTimeout: variantConfig.downloadTimeout || CONFIG.downloadTimeout,
    variant: variantConfig.type ? variantConfig.type : variant,
  };
}

async function tryDownloadImage(imageLinks, type, downloadTimeout, isApiSource) {
  let attempts = 0;

  if (isApiSource) {
    // Xử lý cho source (từ file txt)
    let currentLinks = [...imageLinks];
    while (attempts < CONFIG.maxAttempts && currentLinks.length > 0) {
      const randomIndex = Math.floor(Math.random() * currentLinks.length);
      const imageUrl = currentLinks[randomIndex];
      const imagePath = path.join(CONFIG.saveDir, `${type}_${Date.now()}.jpg`);

      try {
        await downloadImage(imageUrl, imagePath, downloadTimeout);
        return {
          success: true,
          path: imagePath,
          remainingLinks: imageLinks.filter((_, i) => i !== randomIndex),
          hadDieLinks: attempts > 0,
        };
      } catch (error) {
        console.error(`Lỗi tải ảnh: ${error.message}`);
        currentLinks.splice(randomIndex, 1);
        attempts++;
      }
    }
    return {
      success: false,
      remainingLinks: currentLinks,
      hadDieLinks: attempts > 0,
    };
  } else {
    // Xử lý cho api source (từ file txt)
    while (attempts < CONFIG.maxAttempts) {
      const imagePath = path.join(CONFIG.saveDir, `${type}_${Date.now()}.jpg`);
      try {
        await downloadImage(imageLinks, imagePath, downloadTimeout);
        return {
          success: true,
          path: imagePath,
        };
      } catch (error) {
        console.error(`Lỗi tải ảnh: ${error.message}`);
        attempts++;
      }
    }
    return {
      success: false,
    };
  }
}

// Thêm hàm mới để lấy danh sách đối số
function getArgumentList(type) {
  const typeConfig = IMAGE_TYPES[type];
  const typeKeywords = KEYWORD_MAPPING[type];
  if (!typeConfig || !typeKeywords) return null;

  // Tạo danh sách mô tả chi tiết cho từng biến thể
  const descriptions = Object.entries(typeKeywords)
    .filter(([variant]) => {
      const variantConfig = typeConfig.variants[variant];
      const isShow = variantConfig?.show ?? true;
      return isShow;
    })
    .map(([variant, keywords]) => {
      return `${typeConfig.variants[variant].type ? `${typeConfig.variants[variant].type}` : "Default"}: ${keywords.join(", ")}`;
    })
    .join("\n");

  return descriptions || null;
}

export async function sendImage(api, message, type) {
  const { dName: senderName, uidFrom: senderId } = message.data;
  const content = removeMention(message);
  const commandParts = content.split(" ");

  if (commandParts.length > 1 && commandParts[1] === "map") {
    const argList = getArgumentList(type);
    if (argList) {
      await api.sendMessage(
        {
          msg: `Các đối số có thể dùng cho lệnh ${type}:\n${argList}`,
          quote: message,
          ttl: 30000,
        },
        message.threadId,
        message.type
      );
    }
    return;
  }

  const config = getImageConfig(type, content);
  if (!config) return;
  const isApiSource = !!config.variantConfig.source;
  let isDieLinks = false;
  let remainingLinks = [];

  try {
    const thinhPath = path.join(CONFIG.baseDataPath, "Text", config.textFile);
    const thinhList = fs.readFileSync(thinhPath, "utf-8").split("\n").filter(Boolean);
    const randomThing = thinhList[Math.floor(Math.random() * thinhList.length)];

    const imageLinks = await getImageLinks(config);
    const downloadTimeout = config.downloadTimeout;

    const downloadResult = await tryDownloadImage(imageLinks, type, downloadTimeout, isApiSource);
    remainingLinks = downloadResult.remainingLinks ? [...downloadResult.remainingLinks] : [...imageLinks];
    isDieLinks = downloadResult.hadDieLinks ? true : false;
    if (downloadResult.success) {
      await api.sendMessage(
        {
          msg: `[ ${senderName} ] ${config.variant != "default" ? `( ${config.variant} )` : ""}\n${randomThing.replaceAll("\\n", "\n")}`,
          mentions: [MessageMention(senderId, senderName.length, 2, false)],
          attachments: [downloadResult.path],
          ttl: config.ttl,
        },
        message.threadId,
        message.type
      );

      fs.unlinkSync(downloadResult.path);
    } else {
      await api.sendMessage(
        {
          msg: "Xin lỗi, không thể tải ảnh. Vui lòng thử lại sau.",
          quote: message,
          ttl: 30000,
        },
        message.threadId,
        message.type
      );
    }
  } catch (error) {
    console.error(`Lỗi trong quá trình xử lý: ${error.message}`);
    await api.sendMessage(
      {
        msg: "Gãy API mẹ òi, bảo mấy sếp lấp api khác cho bé!",
        quote: message,
        ttl: 30000,
      },
      message.threadId,
      message.type
    );
  }

  // Chỉ cập nhật file txt
  if (isApiSource && isDieLinks) {
    const imagePath = path.join(CONFIG.baseDataPath, "Image", config.variantConfig.source);
    fs.writeFileSync(imagePath, remainingLinks.join("\n"));
  }
}
