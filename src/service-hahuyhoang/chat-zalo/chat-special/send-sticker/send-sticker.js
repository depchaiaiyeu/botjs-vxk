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
  return new Promise((resolve, reject) => {
    if (!url.startsWith("http")) {
      resolve(url)
      return
    }
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

async function removeBackgroundImgly(imagePath) {
  try {
    const blob = await removeBackground(imagePath)
    const buffer = Buffer.from(await blob.arrayBuffer())
    return buffer
  } catch (error) {
    console.error("Lỗi khi xóa phông:", error)
    throw error
  }
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

function isLocalPath(url) {
  return /^[a-z]:[\/\\]/i.test(url)
}

async function processAndSendSticker(api, message, mediaUrl, width, height, cliMsgType, removeBackground = false, radiusRatio = 5) {
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
      if (isLocalPath(redirectUrl)) {
        fs.copyFileSync(redirectUrl, videoPath)
      } else {
        await downloadFileFake(redirectUrl, videoPath)
      }
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
      if (isLocalPath(downloadUrl)) {
        fs.copyFileSync(downloadUrl, imagePath)
      } else {
        await downloadFileFake(downloadUrl, imagePath)
      }

      let processPath = imagePath
      if (removeBackground) {
        bgRemovedPath = path.join(tempDir, `sticker_bg_removed_${Date.now()}.png`)
        const pngBuffer = await removeBackgroundImgly(imagePath)
        fs.writeFileSync(bgRemovedPath, pngBuffer)
        processPath = bgRemovedPath
      }

      const r = Math.floor(Math.min(width, height) * (radiusRatio / 100))
      let vfFilter = ""
      if (r > 0 && cliMsgType !== 44) {
        vfFilter = `-vf "format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='a(X,Y)*((gt(X,${r})*lt(X,W-${r})*gt(Y,${r})*lt(Y,H-${r})) + (lt((X-${r})*(X-${r})+(Y-${r})*(Y-${r}),${r}*${r})*lt(X,${r})*lt(Y,${r})) + (lt((X-(W-${r}))*(X-(W-${r}))+(Y-${r})*(Y-${r}),${r}*${r})*gt(X,W-${r})*lt(Y,${r})) + (lt((X-${r})*(X-${r})+(Y-(H-${r}))*(Y-(H-${r})),${r}*${r})*lt(X,${r})*gt(Y,H-${r})) + (lt((X-(W-${r}))*(X-(W-${r}))+(Y-(H-${r}))*(Y-(H-${r})),${r}*${r})*gt(X,W-${r})*gt(Y,H-${r})))'"`
      }

      execSync(`ffmpeg -y -i "${processPath}" ${vfFilter} -c:v libwebp -q:v 80 "${convertedWebpPath}"`, { stdio: 'pipe' })
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
  const msgContent = message.data?.content || ""
  const args = msgContent.split(/\s+/)

  const removeBackgroundImg = args.includes("xp")
  let radiusRatio = 5
  for (let arg of args) {
    if (arg.startsWith("r")) {
      radiusRatio = parseInt(arg.slice(1), 10) || 5
      break
    }
  }

  if (!quote) {
    await sendMessageWarning(api, message, `${senderName}, Hãy reply vào tin nhắn chứa ảnh hoặc video cần tạo sticker và dùng lại lệnh ${prefix}sticker${removeBackgroundImg ? " xp" : ""}${radiusRatio !== 5 ? ` r${radiusRatio}` : ""}.`, true)
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

    const statusMsg = removeBackgroundImg ? `Đang xóa phông và tạo sticker cho ${senderName}, vui lòng chờ một chút!` : `Đang tạo sticker cho ${senderName}, vui lòng chờ một chút!`
    await sendMessageWarning(api, message, statusMsg, true)
    await processAndSendSticker(api, message, decodedUrl, width, height, cliMsgType, removeBackgroundImg, radiusRatio)
    await sendMessageComplete(api, message, `Sticker của bạn đây!`, true)
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh sticker:", error)
    await sendMessageFailed(api, message, `${senderName}, Lỗi khi xử lý lệnh sticker: ${error.message}`, true)
  }
}
