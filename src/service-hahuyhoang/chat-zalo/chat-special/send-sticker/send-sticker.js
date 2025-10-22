import fs from "fs"
import path from "path"
import https from "https"
import http from "http"
import { getGlobalPrefix } from "../../../service.js"
import { deleteFile, downloadFileFake } from "../../../../utils/util.js"
import { MessageType } from "../../../../api-zalo/index.js"
import { tempDir } from "../../../../utils/io-json.js"
import { appContext } from "../../../../api-zalo/context.js"
import { sendMessageComplete, sendMessageWarning, sendMessageFailed } from "../../chat-style/chat-style.js"
import { execSync } from "child_process"
import { admins } from "../../../../index.js"

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

async function getVideoRedirectUrl(url) {
  try {
    const response = await getRedirectUrl(url)
    return response
  } catch (error) {
    return url
  }
}

async function processAndSendSticker(api, message, mediaUrl, width, height, cliMsgType, radius = 30) {
  const threadId = message.threadId
  let videoPath = null
  let webpPath = null
  let imagePath = null
  let convertedWebpPath = null

  const radiusSquared = radius * radius
  const roundedFilter = radius > 0 
    ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=yuva420p,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(gt(pow(max(0,${radius}-min(X,W-X)),2)+pow(max(0,${radius}-min(Y,H-Y)),2),${radiusSquared}),0,255)'`
    : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`

  try {
    if (cliMsgType === 44) {
      const redirectUrl = await getVideoRedirectUrl(mediaUrl)
      videoPath = path.join(tempDir, `sticker_video_${Date.now()}.mp4`)
      webpPath = path.join(tempDir, `sticker_webp_${Date.now()}.webp`)
      await downloadFileFake(redirectUrl, videoPath)
      execSync(`ffmpeg -y -i "${videoPath}" -vf "${roundedFilter}" -c:v libwebp -q:v 80 "${webpPath}"`, { stdio: 'pipe' })
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
        const urlObj = new URL(mediaUrl)
        const urlExt = path.extname(urlObj.pathname)
        if (urlExt) {
          fileExt = urlExt.slice(1)
        }
      }
      imagePath = path.join(tempDir, `sticker_image_${Date.now()}.${fileExt}`)
      convertedWebpPath = path.join(tempDir, `sticker_converted_${Date.now()}.webp`)
      await downloadFileFake(downloadUrl, imagePath)

      execSync(`ffmpeg -y -i "${imagePath}" -vf "${roundedFilter}" -c:v libwebp -q:v 80 "${convertedWebpPath}"`, { stdio: 'pipe' })
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
  }
}

export async function handleStickerCommand(api, message) {
  const quote = message.data?.quote
  const senderName = message.data.dName
  const senderId = message.data.uidFrom
  const threadId = message.threadId
  const prefix = getGlobalPrefix()
  const msgContent = message.data?.content || ""
  const args = msgContent.split(/\s+/)

  const isAdmin = admins.includes(senderId)

  let radius = 30
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('r')) {
      const num = parseInt(args[i].slice(1))
      if (!isNaN(num) && num >= 0) {
        radius = num
      }
      break
    }
  }

  if (!quote) {
    await sendMessageWarning(api, message, `${senderName}, Hãy reply vào tin nhắn chứa ảnh hoặc video cần tạo sticker và dùng lại lệnh ${prefix}sticker${radius !== 30 ? ` r${radius}` : ''}.`, true)
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
    let attachData = {}
    
    if (typeof attach === 'string') {
      attachData = JSON.parse(attach)
      if (attachData.params && typeof attachData.params === "string") {
        attachData.params = JSON.parse(
          attachData.params.replace(/\\\\/g, "\\").replace(/\\\//g, "/")
        )
      }
    } else {
      attachData = attach
      if (attachData.params && typeof attachData.params === "string") {
        attachData.params = JSON.parse(
          attachData.params.replace(/\\\\/g, "\\").replace(/\\\//g, "/")
        )
      }
    }

    const mediaUrl = attachData.hdUrl || attachData.href || attachData.hd
    if (!mediaUrl) {
      await sendMessageWarning(api, message, `${senderName}, Không tìm thấy URL trong đính kèm của tin nhắn bạn đã reply.`, true)
      return
    }

    const decodedUrl = decodeURIComponent(mediaUrl.replace(/\\\//g, "/"))

    const params = attachData.params || {}
    const duration = params.duration || 0
    
    if (cliMsgType === 44 && !isAdmin && duration > 10000) {
      await sendMessageWarning(api, message, `${senderName}, Sticker video chỉ được phép dài tối đa 10 giây đối với thành viên. (Video của bạn: ${(duration / 1000).toFixed(1)}s)`, true)
      return
    }

    let width = Number(params.width) || 512
    let height = Number(params.height) || 512
    
    if (width <= 0 || height <= 0) {
      width = 512
      height = 512
    }

    const statusMsg = radius > 0 
      ? `Đang tạo sticker (bo góc ${radius}px, kích thước ${width}x${height}) cho ${senderName}, vui lòng chờ một chút!`
      : `Đang tạo sticker (kích thước ${width}x${height}) cho ${senderName}, vui lòng chờ một chút!`
    await sendMessageWarning(api, message, statusMsg, true)
    await processAndSendSticker(api, message, decodedUrl, width, height, cliMsgType, radius)
    await sendMessageComplete(api, message, `Sticker của bạn đây!`, true)
  } catch (error) {
    await sendMessageFailed(api, message, `${senderName}, Lỗi khi xử lý lệnh sticker: ${error.message}`, true)
  }
}
