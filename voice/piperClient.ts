/**
 * Piper TTS Client (Neural Text-to-Speech)
 * 
 * Uses Piper for high-quality offline voice synthesis
 * Falls back to espeak-ng if Piper is not available
 */

import { spawn } from 'child_process';
import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs';

export interface PiperRequest {
  text: string;
  voice?: string;
  speedRate?: number;
}

export interface PiperResult {
  audioFilePath: string;
  error?: string;
}

const PIPER_EXECUTABLE = process.env.PIPER_PATH || 'C:\\piper\\piper.exe';
const VOICES_DIR = process.env.PIPER_VOICES_DIR || 'C:\\piper\\voices';
// Use /tmp for serverless, public for local dev
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const CACHE_DIR = isServerless 
  ? '/tmp/voice' 
  : path.join(process.cwd(), 'public', 'voice');

/**
 * Voice model mapping
 */
const VOICE_MODELS: Record<string, { model: string; speaker?: number }> = {
  'female': { model: 'en_US-amy-medium', speaker: 0 },
  'male': { model: 'en_US-ryan-high', speaker: 0 },
  'british-female': { model: 'en_GB-alba-medium', speaker: 0 },
  'british-male': { model: 'en_GB-northern_english_male-medium', speaker: 0 },
};

/**
 * Generate cache hash
 */
function generateCacheHash(text: string, voice: string, speed: number): string {
  return createHash('md5')
    .update(`${text}-${voice}-${speed}`)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Main synthesis function
 */
export async function synthesizeSpeech(
  projectId: string,
  params: PiperRequest
): Promise<PiperResult> {
  const voice = params.voice || 'female';
  const speed = params.speedRate || 1.0;
  const text = params.text;

  // Create cache directory
  const cacheDir = path.join(CACHE_DIR, projectId);
  
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  // Generate cache key
  const hash = generateCacheHash(text, voice, speed);
  const outputPath = path.join(cacheDir, `${hash}.wav`);

  // Check cache
  if (fs.existsSync(outputPath)) {
    console.log(`[PiperTTS] Using cached audio: ${hash}`);
    return { audioFilePath: outputPath };
  }

  // Check if Piper is installed
  if (!fs.existsSync(PIPER_EXECUTABLE)) {
    console.warn('[PiperTTS] Piper not found at:', PIPER_EXECUTABLE);
    console.warn('[PiperTTS] Falling back to espeak-ng');
    return generateWithEspeak(text, outputPath, speed, voice);
  }

  // Get voice model
  const voiceConfig = VOICE_MODELS[voice] || VOICE_MODELS['female'];
  const modelPath = path.join(VOICES_DIR, `${voiceConfig.model}.onnx`);
  const configPath = path.join(VOICES_DIR, `${voiceConfig.model}.onnx.json`);

  // Check if voice model exists
  if (!fs.existsSync(modelPath)) {
    console.warn(`[PiperTTS] Voice model not found: ${modelPath}`);
    console.warn('[PiperTTS] Falling back to espeak-ng');
    return generateWithEspeak(text, outputPath, speed, voice);
  }

  console.log(`[PiperTTS] Generating speech with ${voiceConfig.model}...`);

  try {
    return await generateWithPiper(text, outputPath, speed, modelPath, configPath, voiceConfig.speaker);
  } catch (error) {
    console.error('[PiperTTS] Piper generation failed:', error);
    console.log('[PiperTTS] Falling back to espeak-ng');
    return generateWithEspeak(text, outputPath, speed, voice);
  }
}

/**
 * Generate speech using Piper (neural TTS)
 */
async function generateWithPiper(
  text: string,
  outputPath: string,
  speed: number,
  modelPath: string,
  configPath: string,
  speaker?: number
): Promise<PiperResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '--model', modelPath,
      '--config', configPath,
      '--output_file', outputPath,
      '--length_scale', (1.0 / speed).toFixed(2), // Speed control (inverse)
    ];

    if (speaker !== undefined) {
      args.push('--speaker', speaker.toString());
    }

    console.log(`[PiperTTS] Running: piper.exe ${args.join(' ')}`);

    const piper = spawn(PIPER_EXECUTABLE, args);

    let stderr = '';

    // Write text to stdin
    piper.stdin.write(text);
    piper.stdin.end();

    piper.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    piper.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        console.log(`[PiperTTS] ✅ Generated audio: ${outputPath}`);
        resolve({ audioFilePath: outputPath });
      } else {
        const error = `Piper failed (code ${code}): ${stderr}`;
        console.error(`[PiperTTS] ${error}`);
        reject(new Error(error));
      }
    });

    piper.on('error', (err) => {
      console.error('[PiperTTS] Piper spawn error:', err.message);
      reject(err);
    });
  });
}

/**
 * Fallback: Generate speech using espeak-ng (lower quality)
 */
async function generateWithEspeak(
  text: string,
  outputPath: string,
  speed: number,
  voice: string
): Promise<PiperResult> {
  return new Promise((resolve, reject) => {
    const speedRate = Math.round(speed * 140); // Slower for clarity
    const voiceVariant = getEspeakVoice(voice);
    
    const args = [
      '-v', voiceVariant,
      '-s', speedRate.toString(),
      '-a', '80',        // Lower amplitude to prevent distortion
      '-p', '50',        // Natural pitch
      '-g', '3',         // 3ms word gaps
      '-w', outputPath,
      text
    ];

    console.log(`[PiperTTS] Fallback espeak-ng: ${args.join(' ')}`);

    const espeak = spawn('espeak-ng', args);

    let stderr = '';
    espeak.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    espeak.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        console.log(`[PiperTTS] ✅ espeak-ng generated: ${outputPath}`);
        resolve({ audioFilePath: outputPath });
      } else {
        reject(new Error(`espeak-ng failed (code ${code}): ${stderr}`));
      }
    });

    espeak.on('error', (err) => {
      reject(new Error(`espeak-ng error: ${err.message}. Install with: choco install espeak-ng`));
    });
  });
}

/**
 * Map voice to espeak variant (fallback)
 */
function getEspeakVoice(voice: string): string {
  const mapping: Record<string, string> = {
    'female': 'en+f3',
    'male': 'en+m3',
    'british-female': 'en-gb+f2',
    'british-male': 'en-gb+m1',
  };
  return mapping[voice] || 'en+f3';
}

/**
 * Check if Piper is available
 */
export async function isPiperAvailable(): Promise<boolean> {
  return fs.existsSync(PIPER_EXECUTABLE);
}
