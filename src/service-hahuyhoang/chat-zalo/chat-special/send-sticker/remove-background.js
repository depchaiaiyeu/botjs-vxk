import { removeBackgroundFromImageUrl } from "remove.bg";

export async function removeBackground(imageUrl) {
  try {
    const apiKey = "M3yhGcgdBwDgtg5f6752YbPb";
    if (!apiKey) {
      throw new Error('REMOVE_BG_API_KEY Không được cấu hình');
    }

    const result = await removeBackgroundFromImageUrl({
      url: imageUrl,
      apiKey: apiKey,
      size: 'regular',
      type: 'auto'
    });

    return Buffer.from(result.base64img, 'base64');

  } catch (error) {
    console.error('Lỗi khi xóa nền:', error);
    return null;
  }
} 
