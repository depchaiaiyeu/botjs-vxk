import axios from "axios";
import * as cheerio from "cheerio";
import { sendMessageCompleteRequest, sendMessageWarningRequest } from "../chat-zalo/chat-style/chat-style.js";

const MAX_MOVIES = 40;
const MOVIES_PER_MESSAGE = 20;

/**
 * Lấy danh sách phim sắp chiếu từ Moveek
 */
async function getUpcomingMovies() {
    try {
        const url = "https://moveek.com/sap-chieu/";
        const response = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36",
                "Referer": "https://moveek.com/",
                "Accept-Encoding": "gzip, deflate, br, zstd"
            }
        });

        const $ = cheerio.load(response.data);
        let movies = [];

        $(".card").each((index, element) => {
            if (movies.length >= MAX_MOVIES) return false; // Chỉ lấy 50 phim đầu tiên

            const titleElement = $(element).find("h3 a");
            const title = titleElement.attr("title") || titleElement.text().trim();
            const url = titleElement.attr("href");
            const releaseDate = $(element).find(".text-muted").first().text().trim();

            if (title && url) {
                movies.push({
                    title,
                    releaseDate: releaseDate || "Chưa rõ",
                    url: `https://moveek.com${url}`
                });
            }
        });

        console.log(`📥 Lấy được ${movies.length} phim sắp chiếu!`);
        return movies;
    } catch (error) {
        console.error("❌ Lỗi khi lấy dữ liệu:", error);
        return [];
    }
}

/**
 * Gửi lịch chiếu phim lên chat (gửi 2 lần, mỗi lần 25 phim)
 */
export async function sendMovieSchedule(api, message) {
    const movies = await getUpcomingMovies();
    
    if (movies.length === 0) {
        const object = { caption: "❌ Không tìm thấy lịch chiếu phim nào!" };
        await sendMessageWarningRequest(api, message, object, 30000);
        return;
    }

    let batches = [];
    for (let i = 0; i < movies.length; i += MOVIES_PER_MESSAGE) {
        batches.push(movies.slice(i, i + MOVIES_PER_MESSAGE));
    }
    for (let i = 0; i < batches.length; i++) {
        let caption = `🎬 Lịch Chiếu Phim Sắp Tới🎬\n\n`;
        batches[i].forEach(movie => {
            caption += `🔹 Tên Phim: ${movie.title}\n📅Ngày chiếu: ${movie.releaseDate}\n🔗 Link chi tiết (${movie.url})\n\n`;
        });
        const object = { caption };

        await sendMessageCompleteRequest(api, message, object, 600000);
    }
}
