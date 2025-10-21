import fs from "fs"
import path from "path"
import https from "https"
import http from "http"
import { removeBackground } from "@imgly/background-removal-node"
import { getGlobalPrefix } from "../../../service.js"
import { deleteFile, downloadFileFake } from "../../../../utils/util.js"
import { MessageType } from "../../../../api-zalo/index.js"
import { tempDir } from "../../../../utils/io-json.js"
import { appContext } from "../../../../api-zalo/context.js"
import { sendMessageComplete, sendMessageWarning, sendMessageFailed } from "../../chat-style/chat-style.js"
import { execSync } from "child_process"

function getRedirectUrl(url) {
  return new Promise((resolve) => {
    const protocol = url.startsWith("https") ? https : http
    protocol.get(url, { method: "HEAD" }, (res) => {
      if (res.headers.location) {
        resolve(res.headers.location)
      } else {
        resolve(url)
      }
    }).on("error", () => resolve(url))
  })
}

async function removeBackgroundImgly(imageSrc) {
  try {
    const blob = await removeBackground(imageSrc)
    const buffer = Buffer.from(await blob.arrayBuffer())
    return buffer
  } catch (error) {
    throw error
  }
}

async function getVideoRedirectUrl(url) {
  try {
    const response = await getRedirectUrl(url)
    return response
  } catch (error) {
    return url
  }
}

async function processAndSendSticker(api, message, mediaUrl, width, height, cliMsgType, removeBg = false) {
  const threadId = message.threadId
  let videoPath = null
  let webpPath = null
  let imagePath = null
  let convertedWebpPath = null
  let bgRemovedPath = null
  let tempImagePath = null

  try {
    if (cliMsgType === 44) {
      const redirectUrl = await getVideoRedirectUrl(mediaUrl)
      videoPath = path.join(tempDir, `sticker_video_${Date.now()}.mp4`)
      webpPath = path.join(tempDir, `sticker_webp_${Date.now()}.webp`)
      await downloadFileFake(redirectUrl, videoPath)
      execSync(`ffmpeg -y -i "${videoPath}" -c:v libwebp -q:v 80 "${webpPath}"`, { stdio: 'pipe' })
      const webpUpload = await api.uploadAttachment([webpPath], threadId, appContext.send2meId, MessageType.DirectMessage)
      const webpUrl = webpUpload?.[0]?.fileUrl
      if (!webpUrl) {
        throw new Error("Upload video attachment thất bại")
      }
      const staticUrl = webpUrl + "?creator=VXK-Service-BOT.webp"
      const animUrl = webpUrl + "?createdBy=VXK-Service-BOT.Webp"
      await api.sendCustomSticker(message, staticUrl, animUrl, width, height)
    } else {
      let downloadUrl = mediaUrl
      let fileExt = "jpg"
      if (mediaUrl.endsWith(".jxl")) {
        downloadUrl = mediaUrl.replace("/jxl/", "/jpg/").replace(".jxl", ".jpg")
        fileExt = "jpg"
      } else {
        try {
          if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
            const urlObj = new URL(mediaUrl)
            const urlExt = path.extname(urlObj.pathname)
            if (urlExt) {
              fileExt = urlExt.slice(1)
            }
          } else {
            const urlExt = path.extname(mediaUrl)
            if (urlExt) {
              fileExt = urlExt.slice(1)
            }
          }
        } catch (e) {
          const urlExt = path.extname(mediaUrl)
          if (urlExt) {
            fileExt = urlExt.slice(1)
          }
        }
      }

      convertedWebpPath = path.join(tempDir, `sticker_converted_${Date.now()}.webp`)

      if (removeBg) {
        bgRemovedPath = path.join(tempDir, `sticker_bg_removed_${Date.now()}.png`)
        tempImagePath = path.join(tempDir, `sticker_temp_image_${Date.now()}.${fileExt}`)
        await downloadFileFake(downloadUrl, tempImagePath)
        const pngBuffer = await removeBackgroundImgly(tempImagePath)
        fs.writeFileSync(bgRemovedPath, pngBuffer)
        execSync(`ffmpeg -y -i "${bgRemovedPath}" -c:v libwebp -q:v 80 "${convertedWebpPath}"`, { stdio: 'pipe' })
      } else {
        imagePath = path.join(tempDir, `sticker_image_${Date.now()}.${fileExt}`)
        await downloadFileFake(downloadUrl, imagePath)
        execSync(`ffmpeg -y -i "${imagePath}" -c:v libwebp -q:v 80 "${convertedWebpPath}"`, { stdio: 'pipe' })
      }

      const webpUpload = await api.uploadAttachment([convertedWebpPath], threadId, appContext.send2meId, MessageType.DirectMessage)
      const webpUrl = webpUpload?.[0]?.fileUrl
      if (!webpUrl) {
        throw new Error("Upload image attachment thất bại")
      }
      await api.sendCustomSticker(message, webpUrl + "?creator=VXK-Service-BOT.webp", webpUrl + "?createdBy=VXK-Service-BOT.Webp", width, height)
    }
    return true
  } catch (error) {
    throw error
  } finally {
    if (videoPath) await deleteFile(videoPath)
    if (webpPath) await deleteFile(webpPath)
    if (imagePath) await deleteFile(imagePath)
    if (convertedWebpPath) await deleteFile(convertedWebpPath)
    if (bgRemovedPath) await deleteFile(bgRemovedPath)
    if (tempImagePath) await deleteFile(tempImagePath)
  }
}

export async function handleStickerCommand(api, message) {
  const quote = message.data?.quote
  const senderName = message.data.dName
  const threadId = message.threadId
  const prefix = getGlobalPrefix()
  const msgContent = message.data?.content || ""
  const args = msgContent.split(/\s+/)

  const removeBackgroundImg = args.includes("xp")

  if (!quote) {
    await sendMessageWarning(api, message, `${senderName}, Hãy reply vào tin nhắn chứa ảnh hoặc video cần tạo sticker và dùng lại lệnh ${prefix}sticker${removeBackgroundImg ? " xp" : ""}.`, true)
    return
  }

  const cliMsgType = message.data?.quote?.cliMsgType
  if (![44, 32, 49].includes(cliMsgType)) {
    await sendMessageWarning(api, message, `${senderName}, Vui lòng reply vào tin nhắn có ảnh, video hoặc GIF để tạo sticker!`, true)
    return
  }

  const attach = quote.attach
  if (!attach) {
    await sendMessageWarning(api, message, `${senderName}, Không có đính kèm nào trong nội dung reply của bạn.`, true)
    return
  }

  try {
    let attachData
    try {
      attachData = typeof attach === 'string' ? JSON.parse(attach) : attach
    } catch {
      attachData = attach
    }

    const mediaUrl = attachData.hdUrl || attachData.href
    if (!mediaUrl) {
      await sendMessageWarning(api, message, `${senderName}, Không tìm thấy URL trong đính kèm của tin nhắn bạn đã reply.`, true)
      return
    }

    const decodedUrl = decodeURIComponent(mediaUrl.replace(/\\\//g, "/"))

    const params = attachData.params || {}
    const duration = params.duration || 0
    if (cliMsgType === 44 && duration > 5000) {
      await sendMessageWarning(api, message, `${senderName}, Sticker video chỉ được phép dài tối đa 5 giây!`, true)
      return
    }

    const width = params.width || 512
    const height = params.height || 512

    const statusMsg = removeBackgroundImg ? `Đang xóa phông và tạo sticker cho ${senderName}, vui lòng chờ một chút!` : `Đang tạo sticker cho ${senderName}, vui lòng chờ một chút!`
    await sendMessageWarning(api, message, statusMsg, true)
    await processAndSendSticker(api, message, decodedUrl, width, height, cliMsgType, removeBackgroundImg)
    await sendMessageComplete(api, message, `Sticker của bạn đây!`, true)
  } catch (error) {
    await sendMessageFailed(api, message, `${senderName}, Lỗi khi xử lý lệnh sticker: ${error.message}`, true)
  }
}
