FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
  ffmpeg \
  nodejs \
  npm \
  && rm -rf /var/lib/apt/lists/*

RUN pip install yt-dlp

WORKDIR /app
COPY package.json .
RUN npm install
COPY index.js .

EXPOSE 3001
CMD ["node", "index.js"]