import axios from "axios"
import fs from "fs"
import path from "path"
import { getGlobalPrefix } from "../../../service.js"
import { checkExstentionFileRemote, deleteFile, downloadFileFake } from "../../../../utils/util.js"
import { MessageType } from "../../../../api-zalo/index.js"
import { tempDir } from "../../../../utils/io-json.js"
import { removeMention } from "../../../../utils/format-util.js"
import { isAdmin } from "../../../../index.js"
import { appContext } from "../../../../api-zalo/context.js"
import { sendMessageComplete, sendMessageWarning, sendMessageFailed } from "../../chat-style/chat-style.js"
import { execSync } from "child_process"

export async function isValidMediaUrl(url) {
  try {
    const ext = await checkExstentionFileRemote(url)
    if (!ext) return { isValid: false, isVideo: false }
    if (["mp4", "mov", "webm"].includes(ext)) return { isValid: true, isVideo: true }
    if (["png", "jpg", "jpeg", "gif", "webp", "jxl"].includes(ext)) return { isValid: true, isVideo: false }
    return { isValid: false, isVideo: false }
  } catch {
    return { isValid: false, isVideo: false }
  }
}

export async function getVideoRedirectUrl(url) {
  try {
    const response = execSync(`curl -I "${url}"`, { encoding: 'utf8' })
    const locationMatch = response.match(/location:\s*(.+)/i)
    if (locationMatch) {
      return locationMatch[1].trim()
    }
    return url
  } catch (error) {
    console.error("Lỗi khi lấy redirect URL:", error)
    return url
  }
}

export async function processAndSendSticker(api, message, mediaSource, width, height) {
  const threadId = message.threadId
  let isLocalFile = false
  let pathSticker = null
  
  try {
    try {
      await fs.promises.access(mediaSource)
      isLocalFile = true
    } catch {
      isLocalFile = false
    }
    
    if (isLocalFile) {
      pathSticker = mediaSource
    } else {
      const ext = await checkExstentionFileRemote(mediaSource)
      pathSticker = path.join(tempDir, `sticker_${Date.now()}.${ext}`)
      await downloadFileFake(mediaSource, pathSticker)
    }
    
    const linkUploadZalo = await api.uploadAttachment([pathSticker], threadId, appContext.send2meId, MessageType.DirectMessage)
    const finalUrl = linkUploadZalo[0].fileUrl + "?createdBy=VXK-Service-BOT.Webp"
    
    await sendMessageComplete(api, message, `Sticker của bạn đây!`, true)
    await api.sendCustomSticker(message, finalUrl, finalUrl, width, height)
    return true
  } catch (error) {
    console.error("Lỗi khi xử lý sticker:", error)
    throw error
  } finally {
    if (pathSticker && !isLocalFile) {
      await deleteFile(pathSticker)
    }
  }
}

export async function handleStickerCommand(api, message) {
  const quote = message.data.quote
  const senderName = message.data.dName
  const senderId = message.data.uidFrom
  const threadId = message.threadId
  const content = removeMention(message)
  const prefix = getGlobalPrefix()
  
  if (!quote) {
    await sendMessageWarning(api, message, `${senderName}, Hãy reply vào tin nhắn chứa ảnh hoặc video cần tạo sticker và dùng lại lệnh ${prefix}sticker.`, true)
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
    const mediaCheck = await isValidMediaUrl(decodedUrl)
    if (!mediaCheck.isValid) {
      await sendMessageWarning(api, message, `${senderName}, URL không hợp lệ hoặc không phải là ảnh, GIF hoặc video được hỗ trợ!\nLink: ${decodedUrl}`, true)
      return
    }
    
    const params = attachData.params || {}
    const duration = params.duration || 0
    if (mediaCheck.isVideo && duration > 5000) {
      await sendMessageWarning(api, message, `${senderName}, Sticker video chỉ được phép dài tối đa 5 giây!`, true)
      return
    }
    
    const width = params.width || 512
    const height = params.height || 512
    
    await sendMessageWarning(api, message, `Đang tạo sticker cho ${senderName}, vui lòng chờ một chút!`, true)
    
    let finalUrl = decodedUrl
    if (mediaCheck.isVideo) {
      const redirectUrl = await getVideoRedirectUrl(decodedUrl)
      finalUrl = redirectUrl + "?createdBy=VXK-Service-BOT.Webp"
    } else {
      finalUrl = decodedUrl + "?createdBy=VXK-Service-BOT.Webp"
    }
    
    await sendMessageComplete(api, message, `Sticker của bạn đây!`, true)
    await api.sendCustomSticker(message, finalUrl, finalUrl, width, height)
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh sticker:", error)
    await sendMessageFailed(api, message, `${senderName}, Lỗi khi xử lý lệnh sticker: ${error.message}`, true)
  }
}
