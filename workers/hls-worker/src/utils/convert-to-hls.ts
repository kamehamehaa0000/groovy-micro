import { spawn } from 'child_process'
import path from 'path'

export const convertToHLS = async (
  inputPath: string,
  outputDir: string
): Promise<string> => {
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
          duration = durationMatch[1]
        }
      }
    })

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath)
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`))
      }
    })
  })
}
