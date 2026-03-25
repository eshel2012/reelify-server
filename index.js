const express = require('express')
const cors = require('cors')
const { execSync } = require('child_process')
const fs = require('fs')
const axios = require('axios')

const app = express()
app.use(cors())
app.use(express.json())

app.get('/health', (req, res) => res.json({ status: 'ok' }))

function getVideoId(url) {
  const match = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/)
  return match ? match[1] : null
}

app.post('/clip', async (req, res) => {
  const { url, startTime, endTime } = req.body
  if (!url || !startTime || !endTime)
    return res.status(400).json({ error: 'Missing params' })

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

    console.log('Fetching video info for:', videoId)
    const { data } = await axios.get(`https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id=${videoId}`, {
      headers: {
        'x-rapidapi-host': 'ytstream-download-youtube-videos.p.rapidapi.com',
        'x-rapidapi-key': process.env.RAPIDAPI_KEY
      }
    })

    console.log('RapidAPI status:', data.status)
    console.log('Formats available:', (data.adaptiveFormats || data.formats || []).length)

    const formats = data.adaptiveFormats || data.formats || []
    const mp4 = formats
      .filter(f => f.mimeType?.includes('video/mp4') && f.qualityLabel)
      .sort((a, b) => parseInt(b.qualityLabel) - parseInt(a.qualityLabel))
      .find(f => parseInt(f.qualityLabel) <= 720)

    if (!mp4) {
      console.log('No mp4 format found, data:', JSON.stringify(data).slice(0, 300))
      return res.status(500).json({ error: 'No video format found' })
    }

    console.log('Using quality:', mp4.qualityLabel)

    execSync(
      `ffmpeg -ss ${start} -t ${duration} -i "${mp4.url}" -c:v libx264 -c:a aac "${outputFile}"`,
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
    console.error('Error:', err.message)
    if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile)
    res.status(500).json({ error: err.message })
  }
})

app.listen(3001, () => console.log('Server running on port 3001'))