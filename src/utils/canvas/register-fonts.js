import { registerFont } from "canvas";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

registerFont(path.join(__dirname, "../../../assets/fonts/SVN-Transformer.ttf"), { family: "Transformer" });
registerFont(path.join(__dirname, "../../../assets/fonts/BeVietnamPro-Bold.ttf"), { family: "BeVietnamPro" });
registerFont(path.join(__dirname, "../../../assets/fonts/NotoEmoji-Bold.ttf"), { family: "NotoEmojiBold" });
