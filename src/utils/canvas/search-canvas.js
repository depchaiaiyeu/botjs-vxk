import { createCanvas, loadImage } from "canvas";
import fs from "fs/promises";
import path from "path";
import { loadImageBuffer } from "../util.js";

// Hàm vẽ thumbnail mặc định
function drawDefaultThumbnail(ctx, x, y, size) {
	// Vẽ nền màu vàng nhạt
	ctx.fillStyle = "#fff3cd";
	ctx.beginPath();
	ctx.arc(x + size/2, y + size/2, size/2 - 3, 0, Math.PI * 2);
	ctx.fill();

	// Vẽ dấu X màu đỏ
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
    // Tạo canvas tạm để tính toán độ dài text
    const tempCanvas = createCanvas(1, 1);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.font = "bold 24px BeVietnamPro";

    // Tìm độ dài thực tế lớn nhất của các tiêu đề
    const maxTitleWidth = data.reduce((maxWidth, song) => {
        const title = song.title.length > 36 ? song.title.slice(0, 36) + "..." : song.title;
        const titleWidth = tempCtx.measureText(title).width;
        return titleWidth > maxWidth ? titleWidth : maxWidth;
    }, 0);

    // Kích thước cơ bản
    const thumbnailSize = 100; // Ảnh nhỏ hơn
    const padding = 20;
    const rowHeight = 150;
    const columnWidth = Math.max(600, maxTitleWidth + thumbnailSize + padding * 6); // Độ rộng mỗi cột
    const itemsPerColumn = 10; // Số mục tối đa mỗi cột
    const numColumns = Math.ceil(data.length / itemsPerColumn);

    // Tính toán kích thước canvas
    const canvasWidth = columnWidth * numColumns + padding * 3; // Chiều rộng cho 2 cột
    const canvasHeight = Math.min(data.length, itemsPerColumn) * rowHeight + padding * 2; // Chiều cao canvas

    // Tạo canvas chính
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext("2d");

    try {
        const thumbnailPromises = data.map(async (song) => {
            try {
                const processedThumbnail = await loadImageBuffer(song.thumbnailM);
                if (processedThumbnail) {
                    return await loadImage(processedThumbnail);
                }
                return null;
            } catch (error) {
                return null;
            }
        });

        const thumbnails = await Promise.all(thumbnailPromises);

        // Vẽ nền canvas
        const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
        gradient.addColorStop(0, "rgba(0, 0, 0, 0.8)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0.9)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        for (let i = 0; i < data.length; i++) {
            const song = data[i];

            // Tính toán cột và hàng
            const column = Math.floor(i / itemsPerColumn); // Xác định cột (0 hoặc 1)
            const row = i % itemsPerColumn; // Xác định hàng trong cột

            // Xác định vị trí x và y
            const xPos = padding + column * (columnWidth + padding); // Cột
            const yPos = padding + row * rowHeight; // Hàng

            // Vẽ nền mục
            ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
            ctx.beginPath();
            ctx.roundRect(xPos, yPos, columnWidth, rowHeight - 20, 10);
            ctx.fill();

            // Vẽ viền xanh lá cây sáng quanh ảnh
            const thumbX = xPos + padding;
            const thumbY = yPos + (rowHeight - thumbnailSize) / 2;
            const radius = thumbnailSize / 2;

            ctx.save();
            ctx.beginPath();
            ctx.arc(thumbX + radius, thumbY + radius, radius + 4, 0, Math.PI * 2); // Viền bo sát
            ctx.strokeStyle = "#32CD32"; // Màu xanh lá cây sáng
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.restore();

            // Vẽ thumbnail
            ctx.save();
            ctx.beginPath();
            ctx.arc(thumbX + radius, thumbY + radius, radius, 0, Math.PI * 2);
            ctx.clip();

            if (thumbnails[i]) {
                ctx.drawImage(
                    thumbnails[i],
                    thumbX,
                    thumbY,
                    thumbnailSize,
                    thumbnailSize
                );
            } else {
                drawDefaultThumbnail(ctx, thumbX, thumbY, thumbnailSize);
            }
            ctx.restore();

            // Vẽ vạch ngăn cách (đẩy lên một chút)
            ctx.save();
            ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
            ctx.fillRect(thumbX + thumbnailSize + padding, thumbY + 5, 3, 90); // Đẩy lên từ 15 -> 5
            ctx.restore();

            // Vẽ số thứ tự
            ctx.save();
            ctx.fillStyle = "#4CAF50";
            ctx.beginPath();
            ctx.roundRect(xPos + padding, yPos + 10, 50, 40, [10, 0, 10, 0]);
            ctx.fill();

            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 24px BeVietnamPro";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${i + 1}`, xPos + padding + 25, yPos + 30);
            ctx.restore();

            // Vẽ thông tin bài hát
			const textX = thumbX + thumbnailSize + padding * 3; // Text đẩy sang phải hơn
			const availableTextWidth = columnWidth - (textX - xPos) - padding;
			ctx.textAlign = "left";
			ctx.textBaseline = "top";
			ctx.font = "bold 18px BeVietnamPro";
			ctx.fillStyle = "#ffffff";
			let title = song.title;
			if (ctx.measureText(title).width > availableTextWidth) {
				while (ctx.measureText(title + "...").width > availableTextWidth && title.length > 0) {
					title = title.slice(0, -1);
				}
				title += "...";
			}
			ctx.fillText(title, textX, thumbY);
			ctx.font = "18px BeVietnamPro";
			ctx.fillStyle = "#cccccc";
			let artist = song.artistsNames;
			
			// Kiểm tra và cắt tên nghệ sĩ nếu quá dài
			if (ctx.measureText(artist).width > availableTextWidth) {
				while (ctx.measureText(artist + "...").width > availableTextWidth && artist.length > 0) {
					artist = artist.slice(0, -1);
				}
				artist += "...";
			}
			ctx.fillText(artist, textX, thumbY + 30);
			
			// Thống kê
			const stats = [];
			if (song.rankChart || song.rank) stats.push(`🏆 Top ${song.rankChart || song.rank}`);
			if (song.view) stats.push(`👀 ${song.view.toLocaleString()}`);
			if (song.listen) stats.push(`🎧 ${song.listen.toLocaleString()}`);
			if (song.like) stats.push(`❤️ ${song.like.toLocaleString()}`);
			if (song.comment) stats.push(`💬 ${song.comment.toLocaleString()}`);
			if (song.isOfficial) stats.push(`✅ Official`);
			if (song.isHD) stats.push(`🎥 HD`);
			if (song.publishedTime) stats.push(`🕒 ${song.publishedTime}`);
			if (song.isPremium) stats.push(`💳 [ Premium ]`);
			
			ctx.font = "15px BeVietnamPro";
			ctx.fillStyle = "#ffffff";
			
			// Kiểm tra và cắt thông tin thống kê nếu quá dài
			let statsText = stats.join(" • ");
			if (ctx.measureText(statsText).width > availableTextWidth) {
				while (ctx.measureText(statsText + "...").width > availableTextWidth && statsText.length > 0) {
					statsText = statsText.slice(0, -1);
				}
				statsText += "...";
			}
			ctx.fillText(statsText, textX, thumbY + 60);
        }

        const filePath = path.resolve(`./assets/temp/search_result_${Date.now()}.png`);
        await fs.writeFile(filePath, canvas.toBuffer());
        return filePath;

    } catch (error) {
        console.error("Lỗi khi tạo ảnh kết quả tìm kiếm:", error);
        throw error;
    }
}
