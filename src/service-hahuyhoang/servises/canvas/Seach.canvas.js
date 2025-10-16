import { createCanvas, loadImage } from "canvas";
import fs from "fs/promises";
import path from "path";
import { loadImageBuffer } from "../../../utils/util.js";

function drawDefaultThumbnail(ctx, x, y, size) {
	ctx.fillStyle = "#fff3cd";
	ctx.beginPath();
	ctx.arc(x + size / 2, y + size / 2, size / 2 - 3, 0, Math.PI * 2);
	ctx.fill();

	ctx.strokeStyle = "#dc3545";
	ctx.lineWidth = 4;
	const padding = size * 0.2;
	ctx.beginPath();
	ctx.moveTo(x + padding, y + padding);
	ctx.lineTo(x + size - padding, y + size - padding);
	ctx.moveTo(x + size - padding, y + padding);
	ctx.lineTo(x + padding, y + size - padding);
	ctx.stroke();
}

export async function createSearchResultImage(data) {
	const MAX_ITEMS_PER_IMAGE = 200;
	const imagePaths = [];

	const tempCanvas = createCanvas(1, 1);
	const tempCtx = tempCanvas.getContext("2d");
	tempCtx.font = "bold 24px BeVietnamPro";

	const maxTitleWidth = data.reduce((maxWidth, item) => {
		const title = item.title.length > 36 ? item.title.slice(0, 36) + "..." : item.title;
		const width = tempCtx.measureText(title).width;
		return width > maxWidth ? width : maxWidth;
	}, 0);

	const thumbnailSize = 100;
	const padding = 20;
	const rowHeight = 150;
	const columnWidth = Math.max(600, maxTitleWidth + thumbnailSize + padding * 6);

	const chunkArray = (arr, size) =>
		Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
			arr.slice(i * size, i * size + size)
		);

	const chunks = chunkArray(data, MAX_ITEMS_PER_IMAGE);

	for (const [chunkIndex, items] of chunks.entries()) {
		const count = items.length;
		let numColumns = 3;
		if (count < 3) numColumns = 1;
		else if (count >= 3 && count <= 20) numColumns = 2;

		const rows = Math.ceil(count / numColumns);
		const canvasWidth = columnWidth * numColumns + padding * (numColumns + 1);
		const canvasHeight = rows * rowHeight + padding * 2;

		const canvas = createCanvas(canvasWidth, canvasHeight);
		const ctx = canvas.getContext("2d");

		const thumbnailPromises = items.map(async (item) => {
			try {
				const buffer = await loadImageBuffer(item.thumbnailM);
				if (buffer) return await loadImage(buffer);
			} catch {}
			return null;
		});

		const thumbnails = await Promise.all(thumbnailPromises);

		const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
		gradient.addColorStop(0, "rgba(0, 0, 0, 0.8)");
		gradient.addColorStop(1, "rgba(0, 0, 0, 0.9)");
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, canvasWidth, canvasHeight);

		for (let i = 0; i < count; i++) {
			const item = items[i];
			const column = i % numColumns;
			const row = Math.floor(i / numColumns);
			const totalContentWidth = columnWidth * numColumns + padding * (numColumns - 1);
			const startX = (canvasWidth - totalContentWidth) / 2;
			const xPos = numColumns === 1
				? (canvasWidth - columnWidth) / 2
				: startX + column * (columnWidth + padding);
			const yPos = padding + row * rowHeight;

			// Background box
			ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
			ctx.beginPath();
			ctx.roundRect(xPos, yPos, columnWidth, rowHeight - 20, 10);
			ctx.fill();

			// Thumbnail
			const thumbX = xPos + padding;
			const thumbY = yPos + (rowHeight - thumbnailSize) / 2;
			const radius = thumbnailSize / 2;

			ctx.save();
			ctx.beginPath();
			ctx.arc(thumbX + radius, thumbY + radius, radius + 4, 0, Math.PI * 2);
			ctx.strokeStyle = "#32CD32";
			ctx.lineWidth = 4;
			ctx.stroke();
			ctx.restore();

			ctx.save();
			ctx.beginPath();
			ctx.arc(thumbX + radius, thumbY + radius, radius, 0, Math.PI * 2);
			ctx.clip();

			if (thumbnails[i]) {
				ctx.drawImage(thumbnails[i], thumbX, thumbY, thumbnailSize, thumbnailSize);
			} else {
				drawDefaultThumbnail(ctx, thumbX, thumbY, thumbnailSize);
			}
			ctx.restore();

			// Separator
			ctx.save();
			ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
			ctx.fillRect(thumbX + thumbnailSize + padding, thumbY + 5, 3, 90);
			ctx.restore();

			// Index box
			ctx.save();
			ctx.fillStyle = "#4CAF50";
			ctx.beginPath();
			ctx.roundRect(xPos + padding, yPos + 10, 50, 40, [10, 0, 10, 0]);
			ctx.fill();

			ctx.fillStyle = "#ffffff";
			ctx.font = "bold 24px BeVietnamPro";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(`${i + 1 + chunkIndex * MAX_ITEMS_PER_IMAGE}`, xPos + padding + 25, yPos + 30);
			ctx.restore();

			// Title
			const textX = thumbX + thumbnailSize + padding * 3;
			const availableTextWidth = columnWidth - (textX - xPos) - padding;
			ctx.textAlign = "left";
			ctx.textBaseline = "top";
			ctx.font = "bold 24px BeVietnamPro";
			ctx.fillStyle = "#ffffff";

			let title = item.title;
			if (ctx.measureText(title).width > availableTextWidth) {
				while (ctx.measureText(title + "...").width > availableTextWidth && title.length > 0) {
					title = title.slice(0, -1);
				}
				title += "...";
			}
			ctx.fillText(title, textX, thumbY);

			// Garena
			ctx.font = "20px BeVietnamPro";
			ctx.fillStyle = "#cccccc";
			ctx.fillText("", textX, thumbY + 30);
		}

		const filePath = path.resolve(`./assets/temp/search_result_${Date.now()}_${chunkIndex}.png`);
		await fs.writeFile(filePath, canvas.toBuffer());
		imagePaths.push(filePath);
	}

	return imagePaths.length === 1 ? imagePaths[0] : imagePaths;
}
