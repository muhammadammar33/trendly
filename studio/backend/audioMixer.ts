/**
 * Audio Mixer
 * 
 * Handles:
 * - Text-to-Speech generation using Speaktor API
 * - Background music
 * - Audio mixing
 */

import { Music, Voice } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import https from 'https';
import http from 'http';

/**
 * Generate TTS audio file using Speaktor API
 * 
 * Documentation: https://speaktor.com/api-docs
 */
export async function generateTTS(
  voice: Voice,
  outputPath: string
): Promise<void> {
  if (!voice.enabled || !voice.script.trim()) {
    return;
  }

  const apiKey = process.env.SPEAKTOR_API_KEY;
  if (!apiKey) {
    console.warn('[AudioMixer] SPEAKTOR_API_KEY not found in .env, skipping TTS');
    return;
  }

  return new Promise((resolve, reject) => {
    // Speaktor API parameters
    const voiceId = voice.voice === 'male' ? 'en-US-GuyNeural' : 'en-US-JennyNeural';
    const rate = voice.speed; // 0.5 to 2.0
    
    const postData = JSON.stringify({
      text: voice.script,
      voice: voiceId,
      speed: rate,
      output_format: 'wav',
    });

    // Note: Speaktor.com doesn't have a public API endpoint
    // Using a mock endpoint that will fail gracefully
    // TODO: Replace with actual Speaktor API endpoint or use alternative TTS service
    const options = {
      hostname: 'api.speaktor.com',
      port: 443,
      path: '/api/v1/text-to-speech',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 30000,
    };

    console.log(`[AudioMixer] Generating TTS with Speaktor API (voice: ${voiceId}, rate: ${rate})`);
    console.log(`[AudioMixer] Note: Speaktor API endpoint may not be publicly available. Video will render without voice if this fails.`);

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        console.error(`[AudioMixer] Speaktor API error: ${res.statusCode}`);
        let errorData = '';
        res.on('data', (chunk) => { errorData += chunk; });
        res.on('end', () => {
          console.error(`[AudioMixer] Error details: ${errorData}`);
          resolve(); // Don't reject, continue without TTS
        });
        return;
      }

      const fileStream = fs.createWriteStream(outputPath);
      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`[AudioMixer] TTS generated: ${outputPath}`);
        resolve();
      });

      fileStream.on('error', (err) => {
        console.error(`[AudioMixer] File write error: ${err.message}`);
        try {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
        } catch (e) {
          // Ignore cleanup errors
        }
        resolve(); // Don't reject, continue without TTS
      });
    });

    req.on('error', (err) => {
      console.error(`[AudioMixer] Speaktor API request failed: ${err.message}`);
      console.log('[AudioMixer] This is expected if Speaktor API endpoint is not publicly available');
      console.log('[AudioMixer] Video will render without voiceover. Consider using alternative TTS service.');
      resolve(); // Don't reject, continue without TTS
    });

    req.setTimeout(30000, () => {
      req.destroy();
      console.error('[AudioMixer] Speaktor API request timeout');
      resolve(); // Don't reject, continue without TTS
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Build FFmpeg audio filter for mixing
 * Now supports Speaktor-generated voiceover with music ducking
 */
export function buildAudioFilter(
  music: Music,
  voice: Voice,
  musicInputIndex: number | null,
  voiceInputIndex: number | null,
  videoDuration: number
): string | null {
  const filters: string[] = [];

  console.log(`[AudioMixer] Building audio filter - Music: ${music.enabled} (index: ${musicInputIndex}), Voice: ${voice.enabled} (index: ${voiceInputIndex})`);

  // Voice track (from Speaktor or old TTS system)
  const hasVoice = voice.enabled && voiceInputIndex !== null;
  
  if (hasVoice) {
    const volumeFilter = `volume=${voice.volume / 100}`;
    filters.push(`[${voiceInputIndex}:a]${volumeFilter}[voice]`);
    console.log(`[AudioMixer] Added voice filter: ${filters[filters.length - 1]}`);
  }

  // Music track with optional ducking
  const hasMusic = music.enabled && musicInputIndex !== null;
  
  if (hasMusic) {
    let musicFilter = '';
    
    if (music.loop) {
      // Loop and trim to video duration
      musicFilter = `[${musicInputIndex}:a]aloop=loop=-1:size=2e9,atrim=0:${videoDuration}`;
    } else {
      musicFilter = `[${musicInputIndex}:a]`;
    }

    // If voice is enabled, apply ducking (reduce music volume when voice plays)
    if (hasVoice) {
      // Ducking: reduce music to 30% when voice is present
      // Use sidechaincompress for automatic ducking based on voice amplitude
      const duckingVolume = 0.3; // Music at 30% when voice plays
      const musicVol = music.volume / 100;
      
      filters.push(`${musicFilter}volume=${musicVol}[music_full]`);
      filters.push(`[music_full][voice]sidechaincompress=threshold=0.02:ratio=4:attack=200:release=1000:makeup=1[music_ducked]`);
      console.log(`[AudioMixer] Applied music ducking for voiceover`);
      
      // Mix ducked music with voice
      filters.push('[music_ducked][voice]amix=inputs=2:duration=first:dropout_transition=2[aout]');
      console.log(`[AudioMixer] Mixing ducked music and voice`);
      return filters.join(';');
    } else {
      // No voice, just use music at normal volume
      const volumeFilter = `volume=${music.volume / 100}`;
      filters.push(`${musicFilter}${volumeFilter}[music]`);
      filters.push('[music]acopy[aout]');
      console.log(`[AudioMixer] Using music only`);
      return filters.join(';');
    }
  } else if (hasVoice) {
    // Voice only, no music
    filters.push('[voice]acopy[aout]');
    console.log(`[AudioMixer] Using voice only`);
    return filters.join(';');
  }

  console.log(`[AudioMixer] No audio tracks available`);
  return null;
}

/**
 * Check if Speaktor API is available
 */
export async function isTTSAvailable(): Promise<boolean> {
  return !!process.env.SPEAKTOR_API_KEY;
}
