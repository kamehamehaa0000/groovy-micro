import { spawn } from 'child_process'
import path from 'path'

export const convertToHLS = async (
  inputPath: string,
  outputDir: string
): Promise<{ outputPath: string; duration: string | null }> => {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, 'playlist.m3u8')
    const ffmpeg = spawn('ffmpeg', [
      '-i',
      inputPath, // Input MP3 file
      '-map',
      '0:a', // Map audio stream
      '-c:a',
      'aac', // Encode audio to AAC (widely supported)
      '-b:a',
      '128k', // Set audio bitrate
      '-ac',
      '2', // Stereo audio
      '-ar',
      '44100', // Sample rate
      '-f',
      'hls', // Output format
      '-hls_time',
      '6', // Segment duration (in seconds)
      '-hls_segment_type',
      'fmp4', // Segment type
      '-hls_flags',
      'independent_segments', // Ensure segments are independent
      outputPath, // Output .m3u8 file path
    ])

    let duration: string | null = null

    ffmpeg.stderr.on('data', (data) => {
      const output = data.toString()
      console.log(`FFmpeg: ${output}`)

      // Extract duration from FFmpeg output
      if (!duration) {
        const durationMatch = output.match(
          /Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/
        )
        if (durationMatch && durationMatch[1]) {
          const durationString = durationMatch[1]
          const [hours, minutes, seconds] = durationString
            .split(':')
            .map(parseFloat)
          const durationInSeconds = hours * 3600 + minutes * 60 + seconds
          duration = formatDuration(durationInSeconds)
        }
      }
    })

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve({ outputPath, duration })
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`))
      }
    })
  })
}

const formatDuration = (totalSeconds: number | null | undefined): string => {
  if (totalSeconds == null || isNaN(totalSeconds) || totalSeconds < 0) {
    return '00:00'
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)

  const formattedMinutes = String(minutes).padStart(2, '0')
  const formattedSeconds = String(seconds).padStart(2, '0')

  return `${formattedMinutes}:${formattedSeconds}`
}
