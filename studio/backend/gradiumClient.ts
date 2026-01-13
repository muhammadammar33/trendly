/**
 * Gradium AI WebSocket TTS Client
 * 
 * Official Documentation: https://docs.gradium.ai
 * WebSocket Endpoint: wss://us.api.gradium.ai/api/speech/tts
 */

import WebSocket from 'ws';
import * as path from 'path';
import * as fs from 'fs';

interface GradiumSetupMessage {
  type: 'setup';
  model_name: string;
  voice_id: string;
  output_format: 'wav' | 'pcm' | 'opus';
  json_config?: {
    padding_bonus?: number; // Speed control (-4.0 to 4.0)
    temp?: number; // Temperature (0 to 1.4)
    cfg_coef?: number; // Voice similarity (1.0 to 4.0)
  };
}

interface GradiumTextMessage {
  type: 'text';
  text: string;
}

interface GradiumEndOfStreamMessage {
  type: 'end_of_stream';
}

interface GradiumAudioResponse {
  type: 'audio';
  audio: string; // Base64 encoded
}

interface GradiumReadyResponse {
  type: 'ready';
  request_id: string;
}

interface GradiumErrorResponse {
  type: 'error';
  message: string;
  code: number;
}

type GradiumResponse = GradiumAudioResponse | GradiumReadyResponse | GradiumErrorResponse | { type: 'end_of_stream' };

/**
 * Gradium Voice Library
 */
export const GRADIUM_VOICES = {
  // English (US)
  'en-US-female': 'YTpq7expH9539ERJ', // Emma - Pleasant and smooth
  'en-US-male': 'LFZvm12tW_z0xfGo', // Kent - Relaxed and authentic
  'en-US-female-2': 'jtEKaLYNn6iif5PR', // Sydney - Joyful and airy
  'en-US-male-2': 'KWJiFWu2O9nMPYcR', // John - Warm and resonant
  
  // English (UK)
  'en-GB-female': 'ubuXFxVQwVYnZQhy', // Eva - Joyful and dynamic
  'en-GB-male': 'm86j6D7UZpGzHsNu', // Jack - Pleasant British voice
  
  // French
  'fr-FR-female': 'b35yykvVppLXyw_l', // Elise - Warm and smooth
  'fr-FR-male': 'axlOaUiFyOZhy4nv', // Leo - Warm and smooth
  
  // German
  'de-DE-female': '-uP9MuGtBqAvEyxI', // Mia - Joyful and energetic
  'de-DE-male': '0y1VZjPabOBU3rWy', // Maximilian - Warm and smooth
  
  // Spanish
  'es-ES-female': 'B36pbz5_UoWn4BDl', // Valentina - Warm and engaging
  'es-ES-male': 'xu7iJ_fn2ElcWp2s', // Sergio - Warm and smooth
  
  // Portuguese
  'pt-BR-female': 'pYcGZz9VOo4n2ynh', // Alice - Warm and smooth
  'pt-BR-male': 'M-FvVo9c-jGR4PgP', // Davi - Engaging and smooth
  
  // Defaults
  'female': 'YTpq7expH9539ERJ', // Default: Emma
  'male': 'LFZvm12tW_z0xfGo', // Default: Kent
};

export class GradiumTTSClient {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private apiKey: string;
  private audioChunks: Buffer[] = [];
  private requestId: string | null = null;

  constructor() {
    this.wsUrl = process.env.GRADIUM_WS_URL || 'wss://us.api.gradium.ai/api/speech/tts';
    this.apiKey = process.env.GRADIUM_API_KEY || '';

    if (!this.apiKey) {
      throw new Error('GRADIUM_API_KEY is required in .env file');
    }

    // Note: Gradium keys start with "gd_" but we'll validate during connection
  }

  /**
   * Generate speech from text using Gradium AI WebSocket API
   */
  async generateSpeech(
    text: string,
    voiceId: string = 'YTpq7expH9539ERJ', // Emma (default)
    options?: {
      speed?: number; // -4.0 (faster) to 4.0 (slower)
      temperature?: number; // 0 (deterministic) to 1.4 (diverse)
      voiceSimilarity?: number; // 1.0 to 4.0
    }
  ): Promise<Buffer> {
    const startTime = Date.now();
    
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  🎤 GRADIUM AI - WebSocket TTS Generation             ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log(`║  Voice ID: ${voiceId.substring(0, 42).padEnd(42)} ║`);
    console.log(`║  Text Length: ${text.length.toString().padEnd(39)} chars ║`);
    console.log(`║  WebSocket URL: ${this.wsUrl.substring(6, 41).padEnd(35)} ║`);
    console.log('╚════════════════════════════════════════════════════════╝\n');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.ws) this.ws.close();
        console.log('\n╔════════════════════════════════════════════════════════╗');
        console.log('║  ⏱️  GRADIUM AI - Request Timeout (30s)                ║');
        console.log('╚════════════════════════════════════════════════════════╝\n');
        reject(new Error('Gradium AI WebSocket timeout (30s)'));
      }, 30000);

      try {
        // Connect to WebSocket with API key header
        this.ws = new WebSocket(this.wsUrl, {
          headers: {
            'x-api-key': this.apiKey,
          },
        });

        this.audioChunks = [];

        this.ws.on('open', () => {
          console.log('✅ WebSocket connected to Gradium AI');

          // Send setup message (MUST be first)
          const setupMessage: GradiumSetupMessage = {
            type: 'setup',
            model_name: process.env.GRADIUM_MODEL || 'default',
            voice_id: voiceId,
            output_format: (process.env.GRADIUM_OUTPUT_FORMAT as any) || 'wav',
          };

          // Add advanced options if provided
          if (options && Object.keys(options).length > 0) {
            setupMessage.json_config = {};
            if (options.speed !== undefined) setupMessage.json_config.padding_bonus = options.speed;
            if (options.temperature !== undefined) setupMessage.json_config.temp = options.temperature;
            if (options.voiceSimilarity !== undefined) setupMessage.json_config.cfg_coef = options.voiceSimilarity;
          }

          this.ws!.send(JSON.stringify(setupMessage));
          console.log('📤 Sent setup message');
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const message: GradiumResponse = JSON.parse(data.toString());

            switch (message.type) {
              case 'ready':
                console.log(`✅ Session ready - Request ID: ${message.request_id}`);
                this.requestId = message.request_id;

                // Send text message
                const textMessage: GradiumTextMessage = {
                  type: 'text',
                  text: text,
                };
                this.ws!.send(JSON.stringify(textMessage));
                console.log('📤 Sent text for synthesis');

                // Send end of stream to finalize
                const endMessage: GradiumEndOfStreamMessage = {
                  type: 'end_of_stream',
                };
                this.ws!.send(JSON.stringify(endMessage));
                console.log('📤 Sent end_of_stream signal');
                break;

              case 'audio':
                // Decode base64 audio and collect chunks
                const audioBuffer = Buffer.from(message.audio, 'base64');
                this.audioChunks.push(audioBuffer);
                
                // Log every 5 chunks to avoid spam
                if (this.audioChunks.length % 5 === 0 || this.audioChunks.length === 1) {
                  console.log(`🎵 Received audio chunks: ${this.audioChunks.length} (latest: ${(audioBuffer.length / 1024).toFixed(1)} KB)`);
                }
                break;

              case 'end_of_stream':
                // All audio received, concatenate and return
                clearTimeout(timeout);
                const finalAudio = Buffer.concat(this.audioChunks);
                const generationTime = ((Date.now() - startTime) / 1000).toFixed(2);
                const fileSizeKB = (finalAudio.length / 1024).toFixed(2);

                console.log('\n╔════════════════════════════════════════════════════════╗');
                console.log('║  ✅ GRADIUM AI - Generation Complete                  ║');
                console.log('╠════════════════════════════════════════════════════════╣');
                console.log(`║  Total Audio Size: ${fileSizeKB.padEnd(32)} KB ║`);
                console.log(`║  Audio Chunks: ${this.audioChunks.length.toString().padEnd(40)} ║`);
                console.log(`║  Generation Time: ${generationTime.padEnd(33)} s ║`);
                console.log(`║  Format: WAV (48kHz, 16-bit, mono)                    ║`);
                console.log('╚════════════════════════════════════════════════════════╝\n');

                this.ws!.close();
                resolve(finalAudio);
                break;

              case 'error':
                clearTimeout(timeout);
                console.log('\n╔════════════════════════════════════════════════════════╗');
                console.log('║  ❌ GRADIUM AI - Server Error                         ║');
                console.log('╠════════════════════════════════════════════════════════╣');
                console.log(`║  Message: ${message.message.substring(0, 45).padEnd(45)} ║`);
                console.log(`║  Code: ${message.code.toString().padEnd(48)} ║`);
                console.log('╚════════════════════════════════════════════════════════╝\n');
                
                this.ws!.close();
                reject(new Error(`Gradium AI Error ${message.code}: ${message.message}`));
                break;
            }
          } catch (parseError) {
            console.error('❌ Failed to parse WebSocket message:', parseError);
          }
        });

        this.ws.on('error', (error) => {
          clearTimeout(timeout);
          console.log('\n╔════════════════════════════════════════════════════════╗');
          console.log('║  ❌ GRADIUM AI - WebSocket Error                      ║');
          console.log('╠════════════════════════════════════════════════════════╣');
          console.log(`║  Error: ${String(error).substring(0, 48).padEnd(48)} ║`);
          console.log('╚════════════════════════════════════════════════════════╝\n');
          reject(error);
        });

        this.ws.on('close', (code, reason) => {
          console.log(`🔌 WebSocket closed: Code ${code}${reason ? `, Reason: ${reason}` : ''}`);
        });

      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Close WebSocket connection
   */
  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

/**
 * Helper function for quick TTS generation
 * Returns audio Buffer or null on failure
 */
export async function generateGradiumTTS(
  text: string,
  voice: string = 'en-US-female',
  options?: {
    speed?: number;
    temperature?: number;
    voiceSimilarity?: number;
  }
): Promise<Buffer | null> {
  try {
    // Map voice names to Gradium voice IDs
    const voiceId = GRADIUM_VOICES[voice as keyof typeof GRADIUM_VOICES] || GRADIUM_VOICES['female'];
    
    const client = new GradiumTTSClient();
    const audioBuffer = await client.generateSpeech(text, voiceId, options);
    client.close();
    
    return audioBuffer;
  } catch (error: any) {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  ❌ GRADIUM TTS - Generation Failed                   ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log(`║  Error: ${error.message.substring(0, 48).padEnd(48)} ║`);
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    return null;
  }
}

/**
 * Save generated audio to file
 */
export async function generateAndSaveGradiumTTS(
  text: string,
  voice: string = 'en-US-female',
  outputPath?: string
): Promise<string | null> {
  try {
    const audioBuffer = await generateGradiumTTS(text, voice);
    
    if (!audioBuffer) {
      return null;
    }

    // Generate output path if not provided
    if (!outputPath) {
      const tempDir = path.join(process.cwd(), 'tmp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      outputPath = path.join(tempDir, `voice_gradium_${Date.now()}.wav`);
    }

    // Save to file
    fs.writeFileSync(outputPath, audioBuffer);
    
    console.log(`💾 Audio saved: ${outputPath}`);
    return outputPath;
    
  } catch (error: any) {
    console.error('❌ Failed to save audio:', error.message);
    return null;
  }
}
