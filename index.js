const express = require('express')
const cors = require('cors')
const { execSync } = require('child_process')
const fs = require('fs')

const app = express()
app.use(cors())
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

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
  const inputFile = `/tmp/input_${tmpId}.mp4`
  const outputFile = `/tmp/output_${tmpId}.mp4`

  try {
    execSync(`yt-dlp -f "best[height<=720]" -o "${inputFile}" "${url}"`, { timeout: 120000 })
    execSync(`ffmpeg -i "${inputFile}" -ss ${start} -t ${duration} -vf "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -c:a aac "${outputFile}"`, { timeout: 60000 })

    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Disposition', `attachment; filename="clip_${tmpId}.mp4"`)
    const stream = fs.createReadStream(outputFile)
    stream.pipe(res)
    stream.on('end', () => {
      if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile)
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile)
    })
  } catch (err) {
    console.error(err)
    if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile)
    if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile)
    res.status(500).json({ error: 'Failed to create clip' })
  }
})

app.listen(3001, () => console.log('Server running on port 3001'))