import fs from "fs"
import path from "path"
import { getGlobalPrefix } from "../../../service.js"
import { deleteFile, downloadFileFake } from "../../../../utils/util.js"
import { MessageType } from "../../../../api-zalo/index.js"
import { tempDir } from "../../../../utils/io-json.js"
import { appContext } from "../../../../api-zalo/context.js"
import { sendMessageComplete, sendMessageWarning, sendMessageFailed } from "../../chat-style/chat-style.js"
import { execSync } from "child_process"

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

function createRoundedCornerFilter(radius, width, height) {
  return `scale=${width}:${height},split[main][corners];[corners]scale=10:10,boxblur=1:1[c];[main][c]overlay=0:0:shortest=1[tl];[tl][c]overlay=W-w:0:shortest=1[tr];[tr][c]overlay=0:H-h:shortest=1[bl];[bl][c]overlay=W-w:H-h:shortest=1[out];[out]pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,drawbox=x=0:y=0:w=${width}:h=${height}:t=0:c=transparent,format=rgba,split[s0][s1];[s0]scale=10:10[c1];[c1]pad=${radius}*2:${radius}*2,negate[mask];[s1][mask]alphamerge`
}

export async function processAndSendSticker(api, message, mediaUrl, width, height, cliMsgType, cornerRadius = 5) {
  const threadId = message.threadId
  let videoPath = null
  let webpPath = null
  let imagePath = null
  let convertedWebpPath = null
  
  try {
    if (cliMsgType === 44) {
      const redirectUrl = await getVideoRedirectUrl(mediaUrl)
      videoPath = path.join(tempDir, `sticker_video_${Date.now()}.mp4`)
      webpPath = path.join(tempDir, `sticker_webp_${Date.now()}.webp`)
      await downloadFileFake(redirectUrl, videoPath)
      
      const roundFilter = `scale=${width}:${height},format=rgba,setpts=PTS-STARTPTS,fps=10[v1];[v1]boxblur=luma_radius=${cornerRadius}:luma_power=1[blurred];color=white:s=${width}x${height}:d=1[bg];[bg]drawbox=x=0:y=0:w=${cornerRadius}:h=${cornerRadius}:c=black:t=fill:replace=1[c1];[c1]drawbox=x=${width-cornerRadius}:y=0:w=${cornerRadius}:h=${cornerRadius}:c=black:t=fill:replace=1[c2];[c2]drawbox=x=0:y=${height-cornerRadius}:w=${cornerRadius}:h=${cornerRadius}:c=black:t=fill:replace=1[c3];[c3]drawbox=x=${width-cornerRadius}:y=${height-cornerRadius}:w=${cornerRadius}:h=${cornerRadius}:c=black:t=fill:replace=1[mask];[v1][mask]alphamerge[out]`
      
      execSync(`ffmpeg -y -i "${videoPath}" -vf "scale=${width}:${height},format=rgba,fps=10" -c:v libwebp -q:v 80 "${webpPath}"`, { stdio: 'pipe' })
      
      const webpUpload = await api.uploadAttachment([webpPath], threadId, appContext.send2meId, MessageType.DirectMessage)
      const webpUrl = webpUpload?.[0]?.fileUrl
      if (!webpUrl) {
        throw new Error("Upload video attachment thất bại")
      }
      await api.sendCustomSticker(message, webpUrl + "?createdBy=VXK-Service-BOT.webp", webpUrl + "?createdBy=VXK-Service-BOT.Webp", width, height)
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
      
      const roundedImageFilter = `scale=${width}:${height},format=rgba,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,split[img][mask];[mask]scale=${width}:${height},format=gray,negate[inverted];[img][inverted]alphamerge,drawbox=x=0:y=0:w=${cornerRadius}:h=${cornerRadius}:c=white:t=fill[c1];[c1]drawbox=x=${width-cornerRadius}:y=0:w=${cornerRadius}:h=${cornerRadius}:c=white:t=fill[c2];[c2]drawbox=x=0:y=${height-cornerRadius}:w=${cornerRadius}:h=${cornerRadius}:c=white:t=fill[c3];[c3]drawbox=x=${width-cornerRadius}:y=${height-cornerRadius}:w=${cornerRadius}:h=${cornerRadius}:c=white:t=fill`
      
      execSync(`ffmpeg -y -i "${imagePath}" -vf "scale=${width}:${height},format=rgba" -c:v libwebp -q:v 80 "${convertedWebpPath}"`, { stdio: 'pipe' })
      
      const webpUpload = await api.uploadAttachment([convertedWebpPath], threadId, appContext.send2meId, MessageType.DirectMessage)
      const webpUrl = webpUpload?.[0]?.fileUrl
      if (!webpUrl) {
        throw new Error("Upload image attachment thất bại")
      }
      await api.sendCustomSticker(message, webpUrl + "?createdBy=VXK-Service-BOT.webp", webpUrl + "?createdBy=VXK-Service-BOT.Webp", width, height)
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
  }
}

export async function handleStickerCommand(api, message) {
  const quote = message.data?.quote
  const senderName = message.data.dName
  const threadId = message.threadId
  const prefix = getGlobalPrefix()
  
  if (!quote) {
    await sendMessageWarning(api, message, `${senderName}, Hãy reply vào tin nhắn chứa ảnh hoặc video cần tạo sticker và dùng lại lệnh ${prefix}sticker.`, true)
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
    let cornerRadius = 5
    const commandText = message.data.text || ""
    const radiusMatch = commandText.match(/r(\d+)/i)
    if (radiusMatch) {
      const parsedRadius = parseInt(radiusMatch[1])
      if (parsedRadius >= 10 && parsedRadius <= 40) {
        cornerRadius = parsedRadius
      } else if (parsedRadius > 0) {
        cornerRadius = Math.min(Math.max(parsedRadius, 10), 40)
      }
    }
    
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
    
    await sendMessageWarning(api, message, `Đang tạo sticker cho ${senderName}, vui lòng chờ một chút!`, true)
    await processAndSendSticker(api, message, decodedUrl, width, height, cliMsgType, cornerRadius)
    await sendMessageComplete(api, message, `Sticker của bạn đây!`, true)
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh sticker:", error)
    await sendMessageFailed(api, message, `${senderName}, Lỗi khi xử lý lệnh sticker: ${error.message}`, true)
  }
}
