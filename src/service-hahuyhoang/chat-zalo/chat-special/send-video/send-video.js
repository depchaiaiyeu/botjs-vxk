import axios from "axios";
import { MessageMention } from "zlbotdqt";
import fs from "fs";
import path from "path";
import { removeMention } from "../../../../utils/format-util.js";

// Cấu hình chung
const CONFIG = {
  baseDataPath: path.resolve(process.cwd(), "src", "service-hahuyhoang", "chat-zalo", "chat-special", "send-video", "data-api"),
  maxRetries: 10,
  checkTimeout: 3000,
  retryDelay: 1000,
};

// Cấu hình video
const VIDEO_TYPES = {
  girl: {
    variants: {
      default: { source: "vdgirl.txt", ttl: 300000 },
      sexy: { source: "vdsexy.txt", ttl: 60000, type: "Sexy" },
    },
  },
  sexy: {
    variants: {
      default: { source: "vdsexy.txt", ttl: 60000 },
    },
  },
  anime: {
    variants: {
      default: { source: "vdanime.txt", ttl: 300000 },
    },
    },
  tet: {
      variants: {
        default: { source: "vdtet.txt", ttl: 300000 },
      },
  },
  cosplay: {
    variants: {
      default: { source: "vdcos.txt", ttl: 300000 },
    },
    },
  gai: {
      variants: {
        default: { source: "vdgai.txt", ttl: 300000 },
      },
  },
  boy: {
    variants: {
      default: { source: "vdboy.txt", ttl: 300000 },
    },
  },
  chill: {
    variants: {
      default: { source: "vdchill.txt", ttl: 300000 },
    },
  },
  vuto: {
    variants: {
      default: { source: "vdvuto.txt", ttl: 300000 },
    },
  },
  sad: {
    variants: {
      default: { source: "vdsad.txt", ttl: 300000 },
    },
  },
  sex: {
    variants: {
      default: { source: "vdsex.txt", ttl: 60000 },
    },
  },
};

const KEYWORD_MAPPING = {
  girl: {
    sexy: ["sexy", "hot", "gợi cảm"]
  },
};

// Các hàm utility
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const checkVideoUrl = async (url) => {
  try {
    await Promise.race([
      axios.head(url),
      delay(CONFIG.checkTimeout).then(() => {
        throw new Error("Timeout khi kiểm tra URL -> Chuyển qua link khác");
      }),
    ]);
    return true;
  } catch (error) {
    return false;
  }
};

// Xử lý video từ file API
async function handleApiSourceVideo(api, message, config, senderName, senderId) {
  const filePath = path.join(CONFIG.baseDataPath, config.variantConfig.source);
  let videoLinks = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
  let isDieLink = false;
  
  while (videoLinks.length > 0) {
    const randomIndex = Math.floor(Math.random() * videoLinks.length);
    const videoUrl = videoLinks[randomIndex].trim();
    
    // Kiểm tra URL có hợp lệ Không
    const isValid = await checkVideoUrl(videoUrl);
    
    if (isValid) {
      try {
        await api.sendVideov2({
          videoUrl,
          threadId: message.threadId,
          threadType: message.type,
          message: {
            text: `[ ${senderName} ] ${config.variant != "default" ? `( ${config.variant} )` : ""}`,
            mentions: [MessageMention(senderId, senderName.length, 2, false)],
          },
          ttl: config.ttl,
        });
        if (isDieLink) {
          fs.writeFileSync(filePath, videoLinks.join("\n"));
        }
        return true;
      } catch (error) {
        console.error("Lỗi khi gửi video:", error);
      }
    } else {
      videoLinks.splice(randomIndex, 1);
      isDieLink = true;
    }
  }
  
  return false;
}

// Xử lý video từ source API
async function handleApiExternalVideo(api, message, config, senderName, senderId) {
  let retryCount = 0;
  
  while (retryCount < CONFIG.maxRetries) {
    try {
      const response = await axios.get(config.variantConfig.api);
      if (response.status !== 200) throw new Error("Không thể lấy dữ liệu từ source");
      
      let videoUrl = response.data.data || response.data.url;
      videoUrl = videoUrl.trim();
      const isValid = await checkVideoUrl(videoUrl);
      
      if (isValid) {
        await api.sendVideov2({
          videoUrl,
          threadId: message.threadId,
          threadType: message.type,
          message: {
            text: `[ ${senderName} ] ${config.variant != "default" ? `( ${config.variant} )` : ""}`,
            mentions: [MessageMention(senderId, senderName.length, 2, false)],
          },
          ttl: config.ttl,
        });
        return true;
      }
    } catch (error) {
      console.error(`Lỗi lần ${retryCount + 1}:`, error);
    }
    
    retryCount++;
    await delay(CONFIG.retryDelay);
  }
  
  return false;
}

// Hàm chính xử lý video command
export const handleVideoCommand = async (api, message, type) => {
  const { dName: senderName, uidFrom: senderId } = message.data;
  const content = removeMention(message);

  // Lấy config cho loại video
  const config = (() => {
    const typeConfig = VIDEO_TYPES[type];
    if (!typeConfig) return null;

    let variant = "default";
    const typeKeywords = KEYWORD_MAPPING[type];
    
    if (typeKeywords && content) {
      const normalizedContent = content.toLowerCase();
      for (const [variantName, keywords] of Object.entries(typeKeywords)) {
        if (keywords.some(keyword => normalizedContent.includes(keyword))) {
          variant = variantName;
          break;
        }
      }
    }

    const variantConfig = typeConfig.variants[variant];
    if (!variantConfig) {
      const defaultConfig = typeConfig.variants.default;
      if (!defaultConfig) return null;
      
      return {
        variantConfig: defaultConfig,
        ttl: defaultConfig.ttl,
        variant: defaultConfig.type || variant,
      };
    }

    return {
      variantConfig,
      ttl: variantConfig.ttl,
      variant: variantConfig.type || variant,
    };
  })();

  if (!config) return;

  let success = false;
  
  if (config.variantConfig.api) {
    success = await handleApiExternalVideo(api, message, config, senderName, senderId);
  } else if (config.variantConfig.source) {
    success = await handleApiSourceVideo(api, message, config, senderName, senderId);
  }

  if (!success) {
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi xử lý lệnh video. Vui lòng thử lại sau.",
        quote: message,
      },
      message.threadId,
      message.type
    );
  }
};

export async function sendRandomGirlVideo(api, message, caption, type, ttl = 0) {
  let nameFile = "vdgirl.txt";
  if (type == "anime") nameFile = "vdanime.txt";
  if (type == "cosplay") nameFile = "vdcos.txt";
  if (type == "sexy") nameFile = "vdsexy.txt";
  if (type == "tet") nameFile = "vdtet.txt";
  if (type == "gai") nameFile = "vdgai.txt";
  if (type == "boy") nameFile = "vdboy.txt";
  if (type == "sad") nameFile = "vdsad.txt";
  if (type == "chill") nameFile = "vdchill.txt";
  if (type == "vuto") nameFile = "vdvuto.txt";
  const filePath = path.join(CONFIG.baseDataPath, nameFile);
  let videoLinks = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
  
  while (videoLinks.length > 0) {
    const randomIndex = Math.floor(Math.random() * videoLinks.length);
    const videoUrl = videoLinks[randomIndex].trim();
    
    const isValid = await checkVideoUrl(videoUrl);
    
    if (isValid) {
      try {
        await api.sendVideo({
          videoUrl,
          threadId: message.threadId,
          threadType: message.type,
          message: {
            text: caption,
          },
          ttl: ttl,
        });
        return true;
      } catch (error) {
        console.error("Lỗi khi gửi video:", error);
        return false;
      }
    } else {
      videoLinks.splice(randomIndex, 1);
    }
  }
  
  return false;
}