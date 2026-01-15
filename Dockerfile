# Use Node.js base image
FROM node:22-slim

# Install FFmpeg and other system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Verify FFmpeg installation
RUN ffmpeg -version && echo "FFmpeg installed successfully"

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Copy Prisma schema (needed for postinstall prisma generate)
COPY prisma ./prisma

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Build Next.js app
RUN npm run build

# Expose port
EXPOSE 8080

# Set environment variable for port
ENV PORT=8080
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin/chromium

# Start the application
CMD ["npm", "start"]
