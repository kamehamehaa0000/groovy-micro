declare module "music-tempo" {
  export interface MusicTempoOptions {
    maxBeatInterval?: number;
    minBeatInterval?: number;
    expiryTime?: number;
    maxHistory?: number;
  }

  export default class MusicTempo {
    constructor(audioData: Float32Array | number[], params?: MusicTempoOptions);
    tempo: number;
    beats: number[];
    beatInterval: number;
  }
}
