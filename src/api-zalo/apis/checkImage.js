import axios from "axios";

export function checkImageFactory() {
	/**
	 * Check Dirty Content
	 *
	 * @param imageInput
	 *
	 * @throws ZaloApiError
	 */
	return async function checkImage(imageInput) {
		const response = await axios.get(imageInput, { responseType: 'arraybuffer' })
		if (response.status !== 200) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const formData = new FormData();
		formData.append('img_bytes', new Blob([response.data]));

		const headers = {
			'apikey': 'WmUXM4OK3H8i2hTA3nZuji3BLLee2HUm'
		};

		try {
			const response = await axios.post(
				'https://api.zalo.ai/v1/dirtycontent/filter',
				formData,
				{ headers }
			);
			return response.data.data;
		} catch (error) {
			throw new Error(`Lỗi khi kiểm tra hình ảnh: ${error.message}`);
		}
	};
} 