import fetch from "node-fetch";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";

const TOMORROW_API_KEY = "mdTWQAInBIDB3mHiDtkwuTlwhVB50rqn";
const OPENWEATHER_API_KEY = "e707d13f116e5f7ac80bd21c37883e5e";
const WEATHERAPI_KEY = "fe221e3a25734f0297994922240611";

export async function weatherCommand(api, message) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const prefix = getGlobalPrefix();
  
  const location = content.replace(`${prefix}thoitiet`, "").trim();
  
  if (!location) {
    // Nếu không có địa điểm, hiển thị thời tiết tổng quan
    await getOverallWeather(api, message, threadId);
  } else {
    // Nếu có địa điểm, hiển thị thời tiết cụ thể
    await getLocalWeather(api, message, threadId, location);
  }
}

// Hàm lấy thời tiết tổng quan cả nước
async function getOverallWeather(api, message, threadId) {
  try {
    // Danh sách các thành phố lớn của Việt Nam
    const majorCities = [
      "Hà Nội",
      "Hồ Chí Minh",
      "Đà Nẵng", 
      "Cần Thơ",
      "Huế"
    ];

    // Chọn ngẫu nhiên một thành phố
    const randomCity = majorCities[Math.floor(Math.random() * majorCities.length)];
    
    // Gọi getLocalWeather với thành phố được chọn
    await getLocalWeather(api, message, threadId, randomCity, true);
    
  } catch (error) {
    console.error("Lỗi khi lấy thông tin thời tiết tổng quan:", error);
    await api.sendMessage(
      { msg: "Đã xảy ra lỗi khi lấy thông tin thời tiết tổng quan. Vui lòng thử lại sau.", quote: message },
      threadId,
      message.type
    );
  }
}

// Hàm lấy thời tiết địa phương cụ thể
async function getLocalWeather(api, message, threadId, location, isOverall = false) {
  try {
    const geoResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=vi&format=json`
    );
    const geoData = await geoResponse.json();

    if (!geoData.results || geoData.results.length === 0) {
      await api.sendMessage(
        { msg: "Không tìm thấy thành phố. Vui lòng kiểm tra lại tên thành phố.", quote: message },
        threadId,
        message.type
      );
      return;
    }

    const { latitude, longitude, name, admin1, country } = geoData.results[0];

    const [tomorrowData, openWeatherData, weatherApiData] = await Promise.all([
      getTomorrowWeather(latitude, longitude),
      getOpenWeatherData(latitude, longitude),
      getWeatherApiData(latitude, longitude)
    ]);

    const weatherInfo = formatWeatherInfo(
      name,
      admin1,
      country,
      tomorrowData,
      openWeatherData,
      weatherApiData,
      isOverall
    );

    await api.sendMessage({ msg: weatherInfo, quote: message }, threadId, message.type);
  } catch (error) {
    console.error("Lỗi khi lấy thông tin thời tiết địa phương:", error);
    await api.sendMessage(
      { msg: "Đã xảy ra lỗi khi lấy thông tin thời tiết địa phương. Vui lòng thử lại sau.", quote: message },
      threadId,
      message.type
    );
  }
}

// Hàm lấy cảnh báo thời tiết
async function getWeatherWarnings() {
  try {
    // Có thể tích hợp với API cảnh báo thời tiết của Việt Nam
    // Hoặc sử dụng WeatherAPI để lấy cảnh báo
    const response = await fetch(
      `http://api.weatherapi.com/v1/alerts.json?key=${WEATHERAPI_KEY}&q=Vietnam&lang=vi`
    );
    const data = await response.json();
    
    if (data.alerts && data.alerts.alert.length > 0) {
      return data.alerts.alert.map(alert => 
        `• ${alert.headline}\n  ${alert.desc}`
      ).join('\n');
    }
    return null;
  } catch (error) {
    console.error("Lỗi khi lấy cảnh báo thời tiết:", error);
    return null;
  }
}

// Lấy dữ liệu từ Tomorrow.io (tốt cho dự báo ngắn hạn và chi tiết theo giờ)
async function getTomorrowWeather(lat, lon) {
  const response = await fetch(
    `https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}&apikey=${TOMORROW_API_KEY}`
  );
  return await response.json();
}

// Lấy dữ liệu từ OpenWeather (tốt cho thông tin hiện tại và chất lượng không khí)
async function getOpenWeatherData(lat, lon) {
  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=vi`
  );
  return await response.json();
}

// Lấy dữ liệu từ WeatherAPI (tốt cho dự báo dài hạn và thông tin thiên văn)
async function getWeatherApiData(lat, lon) {
  const response = await fetch(
    `http://api.weatherapi.com/v1/forecast.json?key=${WEATHERAPI_KEY}&q=${lat},${lon}&days=3&aqi=yes&lang=vi`
  );
  return await response.json();
}

function formatWeatherInfo(name, admin1, country, tomorrow, openWeather, weatherApi, isOverall) {
  const daily = tomorrow.timelines.daily[0].values;
  const current = openWeather;
  const forecast = weatherApi.forecast.forecastday;

  // Tính toán chỉ số UV và chất lượng không khí
  const uvIndex = weatherApi.current.uv;
  const uvLevel = getUVLevel(uvIndex);
  
  // Xử lý thông tin thời tiết hiện tại từ OpenWeather
  const currentWeather = current.weather[0];
  const currentTemp = current.main;
  const currentWind = current.wind;
  const currentRain = current.rain ? current.rain["1h"] || 0 : 0;

  // Lấy mô tả thời tiết từ Tomorrow.io
  const tomorrowWeatherCode = daily.weatherCodeMax || daily.weatherCodeMin;
  const weatherDesc = getWeatherDescription(tomorrowWeatherCode);

  return `[ THÔNG BÁO THỜI TIẾT ]\n` +
    `📍 ${isOverall ? "Tổng Quan" : name + (admin1 ? `, ${admin1}` : "") + (country ? `, ${country}` : "")}\n` +
    `⏰ Cập nhật: ${new Date(current.dt * 1000).toLocaleString('vi-VN')}\n\n` +
    
    `🌡️ NHIỆT ĐỘ VÀ ĐỘ ẨM\n` +
    `• Hiện tại: ${currentTemp.temp}°C (Cảm giác như ${currentTemp.feels_like}°C)\n` +
    `• Thấp Nhất: ${currentTemp.temp_min}°C\n` +
    `• Cao Nhất: ${currentTemp.temp_max}°C\n` +
    `• Độ ẩm: ${currentTemp.humidity}%\n\n` +
    
    `🌤️ ĐIỀU KIỆN THỜI TIẾT\n` +
    `• Hiện tại: ${currentWeather.description}\n` +
    `• Dự báo: ${weatherDesc}\n` +
    `• Mây che phủ: ${current.clouds.all}%\n` +
    `• Tầm nhìn: ${(current.visibility / 1000).toFixed(1)}km\n\n` +
    
    `🌧️ LƯỢNG MƯA VÀ KHẢ NĂNG MƯA\n` +
    `• Lượng mưa (1h qua): ${currentRain}mm\n` +
    `• ${getPrecipitationForecast(tomorrow.timelines.hourly)}\n\n` //+
    
    // `💨 GIÓ VÀ ÁP SUẤT\n` +
    // `• Tốc độ gió: ${currentWind.speed} m/s\n` +
    // `• Hướng gió: ${getWindDirection(currentWind.deg)}\n` +
    // `• Gió giật: ${currentWind.gust || 0} m/s\n` +
    // `• Áp suất: ${currentTemp.pressure} hPa\n\n` +
    
    // `🌅 THÔNG TIN THIÊN VĂN\n` +
    // `• Bình minh: ${formatTime(current.sys.sunrise * 1000)}\n` +
    // `• Hoàng hôn: ${formatTime(current.sys.sunset * 1000)}\n` +
    // `• Chỉ số UV: ${uvIndex} (${uvLevel})\n\n`;
}

// Các hàm tiện ích
function getUVLevel(index) {
  if (index <= 2) return "Thấp";
  if (index <= 5) return "Trung bình";
  if (index <= 7) return "Cao";
  if (index <= 10) return "Rất cao";
  return "Nguy hiểm";
}

function getWindDirection(degrees) {
  const directions = ["Bắc", "Đông Bắc", "Đông", "Đông Nam", "Nam", "Tây Nam", "Tây", "Tây Bắc"];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function getPrecipitationForecast(hourlyData) {
  if (!Array.isArray(hourlyData)) return "Không có dữ liệu dự báo mưa";
  
  // Tìm thời điểm có khả năng mưa cao nhất trong 24h tới
  const next24Hours = hourlyData.slice(0, 24);
  const rainHour = next24Hours.find(hour => 
    hour && 
    hour.values && 
    hour.values.precipitationProbability > 50
  );
  
  if (!rainHour) {
    // Kiểm tra xem có khả năng mưa thấp không
    const lightRainHour = next24Hours.find(hour => 
      hour && 
      hour.values && 
      hour.values.precipitationProbability > 30
    );
    
    if (lightRainHour) {
      return "Có thể có mưa nhỏ trong 24 giờ tới";
    }
    return "Dự kiến không có mưa trong 24 giờ tới";
  }

  try {
    const time = new Date(rainHour.time);
    const hour = time.getHours();
    const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = dayNames[time.getDay()];
    
    let timeOfDay;
    if (hour >= 5 && hour < 12) timeOfDay = "sáng";
    else if (hour >= 12 && hour < 18) timeOfDay = "chiều";
    else if (hour >= 18 && hour < 22) timeOfDay = "tối";
    else timeOfDay = "đêm";

    const probability = rainHour.values.precipitationProbability;
    const intensity = getRainIntensity(rainHour.values.rainIntensity || 0);
    
    return `Dự báo ${intensity} vào ${timeOfDay} ${dayName} (${probability}% khả năng)`;
  } catch (error) {
    console.error("Lỗi khi dự báo mưa:", error);
    return "Không thể dự đoán chính xác thời gian mưa";
  }
}

function getRainIntensity(intensity) {
  if (intensity === 0) return "không mưa";
  if (intensity < 2.5) return "mưa nhỏ";
  if (intensity < 7.6) return "mưa vừa";
  if (intensity < 15.2) return "mưa to";
  if (intensity < 30.4) return "mưa rất to";
  return "mưa đặc biệt to";
}

function getWeatherDescription(code) {
  const weatherCodes = {
    1000: "Quang đãng",
    1100: "Có mây nhẹ",
    1101: "Có mây",
    1102: "Nhiều mây",
    1001: "Âm u",
    2000: "Sương mù",
    2100: "Sương mù nhẹ",
    4000: "Mưa nhỏ",
    4001: "Mưa",
    4200: "Mưa nhẹ",
    4201: "Mưa vừa",
    4202: "Mưa to",
    5000: "Tuyết",
    5001: "Tuyết rơi nhẹ",
    5100: "Mưa tuyết nhẹ",
    6000: "Mưa đá",
    6200: "Mưa đá nhẹ",
    6201: "Mưa đá nặng",
    7000: "Sấm sét",
    7101: "Sấm sét mạnh",
    7102: "Giông bão",
    8000: "Một vài cơn mưa rào"
  };
  return weatherCodes[code] || "Không rõ";
}
