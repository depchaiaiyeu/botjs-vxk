import { parentPort, workerData } from "worker_threads";
import * as nsfwjs from "nsfwjs";
import canvas from "canvas";
import { loadImageBuffer } from "../../../utils/util.js"; // đường dẫn đúng

const { Canvas } = canvas;

(async () => {
  try {
    const model = await nsfwjs.load();
    const imageBuffer = await loadImageBuffer(workerData);
    const image = await canvas.loadImage(imageBuffer);

    const cvs = new Canvas(image.width, image.height);
    const ctx = cvs.getContext("2d");
    ctx.drawImage(image, 0, 0, image.width, image.height);

    const predictions = await model.classify(cvs);
    const nsfw_score = predictions.reduce((sum, pred) => {
      return ["Porn", "Sexy", "Hentai"].includes(pred.className)
        ? sum + pred.probability
        : sum;
    }, 0);

    parentPort.postMessage(nsfw_score * 100);
  } catch (err) {
    console.error("Worker lỗi khi xử lý ảnh:", err);
    parentPort.postMessage(0);
  }
})();
