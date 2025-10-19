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

const PIXIAN_API_KEY = "pxakgb6mdp3qqjg"
const PIXIAN_API_SECRET = "k229erm83053ec8potlhbqqec0b53sk57cmrn32mrr1m8jddml6d"

function getRedirectUrl(url) {
  return new Promise((resolve, reject) => {
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

function removeBackgroundPixian(imagePath) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(imagePath)
    const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substr(2, 16)
    const bodyParts = []

    const footer = `\r\n--${boundary}--\r\n`
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${path.basename(imagePath)}"\r\nContent-Type: application/octet-stream\r\n\r\n`

    const req = https.request({
      hostname: "api.pixian.ai",
      path: "/api/v2/remove-background",
      method: "POST",
      auth: `${PIXIAN_API_KEY}:${PIXIAN_API_SECRET}`,
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      }
    }, (res) => {
      let data = Buffer.alloc(0)
      res.on("data", chunk => data = Buffer.concat([data, chunk]))
      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve(data)
        } else {
          reject(new Error(`Pixian API error: ${res.statusCode}`))
        }
      })
    })

    req.on("error", reject)
    req.write(header)

    fileStream.on("data", chunk => req.write(chunk))
    fileStream.on("end", () => {
      req.write(footer)
      req.end()
    })
    fileStream.on("error", reject)
  })
}

async function getVideoRedirectUrl(url) {
  try {
    const response = await getRedirectUrl(url)
    return response
  } catch (error) {
    console.error("Lỗi khi lấy redirect URL:", error)
    return url
  }
}

async function processAndSendSticker(api, message, mediaUrl, width, height, cliMsgType, removeBackground = false) {
  const threadId = message.threadId
  let videoPath = null
  let webpPath = null
  let imagePath = null
  let convertedWebpPath = null
  let bgRemovedPath = null

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
      await api.sendCustomSticker(message, webpUrl + "?creator=VXK-Service-BOT.webp", webpUrl + "?createdBy=VXK-Service-BOT.Webp", width, height)
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

      let processPath = imagePath
      if (removeBackground) {
        bgRemovedPath = path.join(tempDir, `sticker_bg_removed_${Date.now()}.png`)
        const pngData = await removeBackgroundPixian(imagePath)
        fs.writeFileSync(bgRemovedPath, pngData)
        processPath = bgRemovedPath
      }

      execSync(`ffmpeg -y -i "${processPath}" -c:v libwebp -q:v 80 "${convertedWebpPath}"`, { stdio: 'pipe' })
      const webpUpload = await api.uploadAttachment([convertedWebpPath], threadId, appContext.send2meId, MessageType.DirectMessage)
      const webpUrl = webpUpload?.[0]?.fileUrl
      if (!webpUrl) {
        throw new Error("Upload image attachment thất bại")
      }
      await api.sendCustomSticker(message, webpUrl + "?creator=VXK-Service-BOT.webp", webpUrl + "?createdBy=VXK-Service-BOT.Webp", width, height)
    }
    return true
  } catch (error) {
    console.error("Lỗi khi xử lý sticker:", error)
    throw error
  } finally {
    if (videoPath) await deleteFile(videoPath)
    if (webpPath) await deleteFile(webpPath)
    if (imagePath) await deleteFile(imagePath)
    if (convertedWebpPath) await deleteFile(convertedWebpPath)
    if (bgRemovedPath) await deleteFile(bgRemovedPath)
  }
}

export async function handleStickerCommand(api, message) {
  const quote = message.data?.quote
  const senderName = message.data.dName
  const threadId = message.threadId
  const prefix = getGlobalPrefix()
  const msgText = message.data?.content || ""

  const removeBackground = msgText.includes("xp")

  if (!quote) {
    await sendMessageWarning(api, message, `${senderName}, Hãy reply vào tin nhắn chứa ảnh hoặc video cần tạo sticker và dùng lại lệnh ${prefix}sticker${removeBackground ? " xp" : ""}.`, true)
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
    const attachData = JSON.parse(attach)
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

    const statusMsg = removeBackground ? `Đang xóa phông và tạo sticker cho ${senderName}, vui lòng chờ một chút!` : `Đang tạo sticker cho ${senderName}, vui lòng chờ một chút!`
    await sendMessageWarning(api, message, statusMsg, true)
    await processAndSendSticker(api, message, decodedUrl, width, height, cliMsgType, removeBackground)
    await sendMessageComplete(api, message, `Sticker của bạn đây!`, true)
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh sticker:", error)
    await sendMessageFailed(api, message, `${senderName}, Lỗi khi xử lý lệnh sticker: ${error.message}`, true)
  }
}
