/**
 * Gradium AI WebSocket TTS - Test Script
 * 
 * This script tests the Gradium AI WebSocket implementation.
 * Make sure you have a valid GRADIUM_API_KEY in your .env file.
 * 
 * Usage:
 *   node --loader ts-node/esm test-gradium.ts
 *   OR
 *   npx tsx test-gradium.ts
 */

import { generateAndSaveGradiumTTS } from './studio/backend/gradiumClient';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config();

async function testGradiumTTS() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  🧪 GRADIUM AI WEBSOCKET - TEST SCRIPT                 ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Check if API key is configured
  if (!process.env.GRADIUM_API_KEY) {
    console.log('❌ ERROR: GRADIUM_API_KEY not found in .env file');
    console.log('\nPlease add your Gradium API key to .env:');
    console.log('GRADIUM_API_KEY=gd_your_key_here\n');
    process.exit(1);
  }

  // Check API key format
  if (!process.env.GRADIUM_API_KEY.startsWith('gd_')) {
    console.log('⚠️  WARNING: API key does not start with "gd_"');
    console.log('   Current key starts with:', process.env.GRADIUM_API_KEY.substring(0, 4));
    console.log('   Expected format: gd_xxxxx...\n');
    console.log('   (Note: gsk_ is for Groq, not Gradium)\n');
  }

  const testScript = "Hello! This is a test of the Gradium AI text-to-speech system. The implementation now uses WebSocket for real-time audio streaming.";
  const testVoice = 'en-US-female'; // Default voice (maps to Emma)
  const outputPath = path.join(process.cwd(), 'tmp', 'test_gradium.wav');

  console.log('Test Parameters:');
  console.log('  Script:', testScript);
  console.log('  Voice:', testVoice);
  console.log('  Output:', outputPath);
  console.log('  API Key:', process.env.GRADIUM_API_KEY.substring(0, 8) + '...');
  console.log('  WS URL:', process.env.GRADIUM_WS_URL || 'wss://us.api.gradium.ai/api/speech/tts');
  console.log('\n');

  try {
    const audioPath = await generateAndSaveGradiumTTS(
      testScript,
      testVoice,
      outputPath
    );

    if (audioPath) {
      console.log('\n╔════════════════════════════════════════════════════════╗');
      console.log('║  ✅ TEST SUCCESSFUL - Audio Generated                  ║');
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log(`║  Output File: ${audioPath.substring(audioPath.length - 43)}`.padEnd(56) + '║');
      console.log('║  You can now play this file to hear the result        ║');
      console.log('╚════════════════════════════════════════════════════════╝\n');
    } else {
      console.log('\n╔════════════════════════════════════════════════════════╗');
      console.log('║  ❌ TEST FAILED - No Audio Generated                   ║');
      console.log('╠════════════════════════════════════════════════════════╣');
      console.log('║  Check console logs above for error details           ║');
      console.log('╚════════════════════════════════════════════════════════╝\n');
      process.exit(1);
    }
  } catch (error) {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  ❌ TEST FAILED - Exception Occurred                   ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log(`║  Error: ${String(error).substring(0, 45)}`.padEnd(56) + '║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Run the test
testGradiumTTS().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
