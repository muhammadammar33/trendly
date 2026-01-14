/**
 * Audio Mixer
 * 
 * Handles:
 * - Text-to-Speech generation using Gradium AI WebSocket API
 * - Background music
 * - Audio mixing
 */

import { Music, Voice } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { generateGradiumTTS, GRADIUM_VOICES } from './gradiumClient';

/**
 * Gradium AI Voice Options (WebSocket-based)
 */
export { GRADIUM_VOICES } from './gradiumClient';

/**
 * Generate TTS audio file using Gradium AI WebSocket API
 * 
 * @param script - Text to convert to speech
 * @param voice - Voice model (e.g., 'en-US-female', 'en-GB-male')
 * @returns Path to generated audio file, or null if generation fails
 */
export async function generateTTS(
  script: string,
  voice?: string
): Promise<string | null> {
  if (!script || !script.trim()) {
    console.log('[AudioMixer] Empty script, skipping TTS');
    return null;
  }

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  🎙️  TTS GENERATION - Starting Process                 ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║  Script Length: ${script.length.toString().padEnd(38)} chars ║`);
  console.log(`║  Voice: ${(voice || 'en-US-female').padEnd(45)} ║`);
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const timestamp = Date.now();
  const tempDir = path.join(process.cwd(), 'tmp');
  
  // Ensure tmp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    // Generate audio using Gradium AI WebSocket
    const audioBuffer = await generateGradiumTTS(script, voice || 'en-US-female');
    
    if (!audioBuffer) {
      throw new Error('Gradium AI returned null audio buffer');
    }

    // Save to file
    const outputPath = path.join(tempDir, `voice_gradium_${timestamp}.wav`);
    fs.writeFileSync(outputPath, audioBuffer);
    
    const fileSizeKB = (audioBuffer.length / 1024).toFixed(2);

    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  ✅ TTS COMPLETE - Provider: GRADIUM AI                ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log(`║  File Size: ${fileSizeKB.padEnd(43)} KB ║`);
    console.log(`║  Audio Path: ...${outputPath.substring(outputPath.length - 35)}`.padEnd(56) + '║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    return outputPath;

  } catch (error: any) {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  ❌ TTS FAILED - Gradium AI Unavailable                ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log(`║  Error: ${error.message.substring(0, 48).padEnd(48)} ║`);
    console.log('║  Video will render WITHOUT voiceover                  ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    return null;
  }
}

/**
 * Build FFmpeg audio filter for mixing
 * Supports voiceover with music ducking
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
      filters.push('[music]aresample=async=1:first_pts=0[aout]');
      console.log(`[AudioMixer] Using music only`);
      return filters.join(';');
    }
  } else if (hasVoice) {
    // Voice only, no music
    filters.push('[voice]aresample=async=1:first_pts=0[aout]');
    console.log(`[AudioMixer] Using voice only`);
    return filters.join(';');
  }

  console.log(`[AudioMixer] No audio tracks available`);
  return null;
}

/**
 * Check if Gradium AI TTS is available
 */
export async function isTTSAvailable(): Promise<boolean> {
  // Check if Gradium AI API key is configured
  return !!process.env.GRADIUM_API_KEY;
}
