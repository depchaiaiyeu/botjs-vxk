FROM node:18

# Cài FFmpeg và Python
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libwebp-dev \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Set timezone Việt Nam
ENV TZ=Asia/Ho_Chi_Minh
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Start command
CMD ["npm", "start"]
