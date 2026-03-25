const express = require('express')
const cors = require('cors')
const { execSync } = require('child_process')
const fs = require('fs')
const https = require('https')

const app = express()
app.use(cors())
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

function getVideoId(url) {
  const match = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)
  return match ? match[1] : null
}

async function getDirectVideoUrl(videoId) {
  const response = await fetch(`https://yt-api.p.rapidapi.com/dl?id=${videoId}`, {
    method: 'GET',
    headers: {
      'x-rapidapi-host': 'yt-api.p.rapidapi.com',
      'x-rapidapi-key': process.env.RAPIDAPI_KEY
    }
  })
  const data = await response.json()

  // מחפש פורמט mp4 עד 720p
  const formats = data.adaptiveFormats || data.formats || []
  const mp4 = formats
    .filter(f => f.mimeType?.includes('video/mp4') && f.qualityLabel)
    .sort((a, b) => {
      const qa = parseInt(a.qualityLabel) || 0
      const qb = parseInt(b.qualityLabel) || 0
      return qb - qa
    })
    .find(f => parseInt(f.qualityLabel) <= 720)

  return mp4?.url || null
}

app.post('/clip', async (req, res) => {
  const { url, startTime, endTime } = req.body

  if (!url || !startTime || !endTime) {
    return res.status(400).json({ error: 'Missing params' })
  }

  const startParts = startTime.split(':').map(Number)
  const endParts = endTime.split(':').map(Number)
  const start = startParts[0] * 60 + startParts[1]
  const end = endParts[0] * 60 + endParts[1]
  const duration = end - start

  const tmpId = Date.now()
  const outputFile = `/tmp/output_${tmpId}.mp4`

  try {
    const videoId = getVideoId(url)
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL' })

    const directUrl = await getDirectVideoUrl(videoId)
    if (!directUrl) return res.status(500).json({ error: 'Could not get video URL' })

    // FFmpeg מוריד ישירות מהURL וחותך
    execSync(
      `ffmpeg -ss ${start} -t ${duration} -i "${directUrl}" \
      -vf "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2" \
      -c:v libx264 -c:a aac "${outputFile}"`,
      { timeout: 120000 }
    )

    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Disposition', `attachment; filename="clip_${tmpId}.mp4"`)
    const stream = fs.createReadStream(outputFile)
    stream.pipe(res)
    stream.on('end', () => {
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile)
    })
  } catch (err) {
    console.error(err)
    if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile)
    res.status(500).json({ error: 'Failed to create clip' })
  }
})

app.listen(3001, () => console.log('Server running on port 3001'))