declare module "music-tempo" {
  /**
   * Options accepted by music-tempo.
   *
   * The upstream package ships no type declarations, so this mirrors the
   * options that its runtime actually reads (see src/MusicTempo.js and
   * src/OnsetDetection.js in the package).
   */
  export interface MusicTempoOptions {
    /** FFT window size in samples. Must be a power of two. Defaults to 2048. */
    bufferSize?: number;
    /** Spacing between FFT windows in samples. Defaults to 441. */
    hopSize?: number;
    /**
     * Duration of one FFT hop in seconds. Defaults to 0.01, which assumes a
     * 44100 Hz input (441 samples / 0.01 s). Set this to `hopSize / sampleRate`
     * when analysing audio at a different sample rate, otherwise every time
     * estimate - and therefore the detected tempo - is scaled incorrectly.
     */
    timeStep?: number;
    maxBeatInterval?: number;
    minBeatInterval?: number;
    expiryTime?: number;
    maxHistory?: number;
    decayRate?: number;
    peakFindingWindow?: number;
    meanWndMultiplier?: number;
    peakThreshold?: number;
    widthTreshold?: number;
    maxIOI?: number;
    minIOI?: number;
    maxTempos?: number;
    initPeriod?: number;
    thresholdBI?: number;
    thresholdBT?: number;
    toleranceWndInner?: number;
    toleranceWndPre?: number;
    toleranceWndPost?: number;
    correctionFactor?: number;
    maxChange?: number;
    penaltyFactor?: number;
  }

  export default class MusicTempo {
    constructor(audioData: Float32Array | number[], params?: MusicTempoOptions);
    tempo: number;
    beats: number[];
    beatInterval: number;
  }
}
