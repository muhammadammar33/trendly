/**
 * Gradium AI Voice Generation API Route
 * 
 * POST /api/voice/gradium
 * Generate voiceover using Gradium AI with Piper fallback
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateTTS } from '@/studio/backend/audioMixer';
import { getProject, updateProject } from '@/studio/projectStore';
import * as fs from 'fs';

export const maxDuration = 60; // 60 second timeout for voice generation
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, script, voice, speed } = body;

    // Validation
    if (!projectId || !script) {
      return NextResponse.json(
        { error: 'Missing required fields: projectId and script' },
        { status: 400 }
      );
    }

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  🎤 GRADIUM API - Voice Generation Request            ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log(`║  Project ID: ${projectId.substring(0, 36)}`.padEnd(56) + '║');
    console.log(`║  Script Length: ${script.length} characters`.padEnd(56) + '║');
    console.log(`║  Voice: ${voice || 'en-US-female'}`.padEnd(56) + '║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    // Get the project
    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Generate voice using Gradium AI → Piper cascade
    const audioPath = await generateTTS(script, voice || 'en-US-female');

    if (!audioPath) {
      return NextResponse.json(
        {
          error: 'Voice generation failed',
          message: 'Both Gradium AI and Piper TTS failed. Check console for details.',
          provider: null,
        },
        { status: 500 }
      );
    }

    // Detect which provider was used
    let provider: 'gradium' | 'piper' = 'gradium';
    if (audioPath.includes('voice_piper_')) {
      provider = 'piper';
    }

    // Get file info
    const stats = fs.statSync(audioPath);
    const fileSizeKB = (stats.size / 1024).toFixed(2);

    // Update project with new audio path
    updateProject(projectId, {
      voice: {
        ...project.voice,
        audioPath,
        generatedWith: provider,
      },
    });

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  ✅ GRADIUM API - Voice Generation Successful          ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log(`║  Provider: ${provider.toUpperCase()}`.padEnd(56) + '║');
    console.log(`║  File Size: ${fileSizeKB} KB`.padEnd(56) + '║');
    console.log(`║  Duration: ${stats.mtimeMs ? 'N/A' : 'N/A'}`.padEnd(56) + '║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    return NextResponse.json({
      success: true,
      audioPath,
      provider,
      fileSize: fileSizeKB,
      message: `Voice generated successfully with ${provider === 'gradium' ? 'Gradium AI' : 'Piper TTS (fallback)'}`,
    });
  } catch (error) {
    console.error('\n╔════════════════════════════════════════════════════════╗');
    console.error('║  ❌ GRADIUM API - Error Occurred                       ║');
    console.error('╠════════════════════════════════════════════════════════╣');
    console.error(`║  Error: ${String(error).substring(0, 45)}`.padEnd(56) + '║');
    console.error('╚════════════════════════════════════════════════════════╝\n');

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
