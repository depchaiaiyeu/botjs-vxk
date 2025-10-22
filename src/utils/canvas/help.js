import { createCanvas } from "canvas"
import fs from "fs"
import path from "path"

export async function createInstructionsImage(helpContent, isAdminBox, width = 800) {
  const ctxTemp = createCanvas(999, 999).getContext("2d")
  const space = 36
  let yTemp = 60
  ctxTemp.font = "bold 28px Tahoma"
  for (const key in helpContent.allMembers) {
    if (helpContent.allMembers.hasOwnProperty(key)) {
      yTemp += 80
    }
  }
  if (isAdminBox) yTemp += Object.keys(helpContent.admin).length * 80
  const height = yTemp + 100
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext("2d")

  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, "#021B2D")
  gradient.addColorStop(1, "#013026")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  ctx.font = "bold 36px Tahoma"
  ctx.fillStyle = "#A5B4FC"
  ctx.textAlign = "center"
  ctx.fillText(helpContent.title, width / 2, 70)
  ctx.strokeStyle = "#475569"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(width / 2 - 150, 85)
  ctx.lineTo(width / 2 + 150, 85)
  ctx.stroke()

  let xLeft = 60
  let xRight = width / 2 + 10
  let y = 150
  const btnW = width / 2 - 90
  const btnH = 60
  const gap = 20

  const drawButton = (x, y, w, h, leftText, rightText) => {
    const grd = ctx.createLinearGradient(x, y, x, y + h)
    grd.addColorStop(0, "#0F172A")
    grd.addColorStop(1, "#1E293B")
    ctx.fillStyle = grd
    ctx.beginPath()
    ctx.moveTo(x + 12, y)
    ctx.lineTo(x + w - 12, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + 12)
    ctx.lineTo(x + w, y + h - 12)
    ctx.quadraticCurveTo(x + w, y + h, x + w - 12, y + h)
    ctx.lineTo(x + 12, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - 12)
    ctx.lineTo(x, y + 12)
    ctx.quadraticCurveTo(x, y, x + 12, y)
    ctx.closePath()
    ctx.fill()
    ctx.font = "bold 24px Tahoma"
    ctx.fillStyle = "#60A5FA"
    ctx.textAlign = "left"
    ctx.fillText(leftText, x + 20, y + 38)
    ctx.fillStyle = "#22C55E"
    ctx.textAlign = "right"
    ctx.fillText(rightText, x + w - 20, y + 38)
  }

  let side = 0
  for (const key in helpContent.allMembers) {
    if (helpContent.allMembers.hasOwnProperty(key)) {
      const cmd = helpContent.allMembers[key].command
      const desc = helpContent.allMembers[key].description
      if (side === 0) drawButton(xLeft, y, btnW, btnH, cmd, desc)
      else drawButton(xRight, y, btnW, btnH, cmd, desc)
      if (side === 1) y += btnH + gap
      side = 1 - side
    }
  }

  if (isAdminBox && Object.keys(helpContent.admin).length > 0) {
    y += 80
    ctx.textAlign = "center"
    ctx.fillStyle = "#A5B4FC"
    ctx.font = "bold 30px Tahoma"
    ctx.fillText(helpContent.titleAdmin, width / 2, y)
    y += 50
    side = 0
    for (const key in helpContent.admin) {
      if (helpContent.admin.hasOwnProperty(key)) {
        const cmd = helpContent.admin[key].command
        const desc = helpContent.admin[key].description
        if (side === 0) drawButton(xLeft, y, btnW, btnH, cmd, desc)
        else drawButton(xRight, y, btnW, btnH, cmd, desc)
        if (side === 1) y += btnH + gap
        side = 1 - side
      }
    }
  }

  const filePath = path.resolve(`./assets/temp/help_${Date.now()}.png`)
  const out = fs.createWriteStream(filePath)
  const stream = canvas.createPNGStream()
  stream.pipe(out)
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath))
    out.on("error", reject)
  })
}
