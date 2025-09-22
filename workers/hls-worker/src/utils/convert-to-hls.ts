import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

export const convertToHLS = async (
  inputPath: string,
  outputDir: string
): Promise<{ outputPath: string; duration: string | null }> => {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, 'playlist.m3u8')
    const ffmpeg = spawn(
      'ffmpeg',
      [
        '-i',
        inputPath,
        '-map',
        '0:a',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-ac',
        '2',
        '-ar',
        '44100',
        '-f',
        'hls',
        '-hls_time',
        '10',
        '-hls_list_size',
        '0',
        '-hls_segment_type',
        'fmp4',
        '-hls_fmp4_init_filename',
        'init.mp4', // Use simple filename, not path
        '-hls_segment_filename',
        'segment%d.m4s', // Use simple filename pattern, not path
        '-hls_flags',
        'independent_segments',
        'playlist.m3u8', // Use simple filename, not full path
      ],
      {
        cwd: outputDir, // Set working directory so FFmpeg creates files here
      }
    )

    let duration: string | null = null

    ffmpeg.stderr.on('data', (data) => {
      const output = data.toString()
      console.log(`FFmpeg: ${output}`)

      if (!duration) {
        const durationMatch = output.match(
          /Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/
        )
        if (durationMatch) {
          const hours = parseInt(durationMatch[1])
          const minutes = parseInt(durationMatch[2])
          const seconds = parseInt(durationMatch[3])
          const centiseconds = parseInt(durationMatch[4])
          const durationInSeconds =
            hours * 3600 + minutes * 60 + seconds + centiseconds / 100
          duration = formatDuration(durationInSeconds)
        }
      }
    })

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        // Debug: Check the generated playlist content
        try {
          const playlistContent = fs.readFileSync(outputPath, 'utf8')
          console.log('Generated playlist.m3u8 content:')
          console.log(playlistContent)

          // Verify all referenced files exist
          const files = fs.readdirSync(outputDir)
          console.log('Files in output directory:', files)
        } catch (error) {
          console.error('Error reading playlist:', error)
        }

        resolve({ outputPath, duration })
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`))
      }
    })

    ffmpeg.on('error', (error) => {
      reject(error)
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
