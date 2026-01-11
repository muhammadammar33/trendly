import { NextRequest, NextResponse } from 'next/server';
import { synthesizeSpeech } from '@/voice/piperClient';
import * as path from 'path';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const {
      projectId,
      text,
      voiceName,
      speedRate,
    } = body;

    // Validate required fields
    if (!projectId) {
      return NextResponse.json(
        {
          status: 'error',
          error: 'Missing required field: projectId',
        },
        { status: 400 }
      );
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        {
          status: 'error',
          error: 'Missing or invalid field: text',
        },
        { status: 400 }
      );
    }

    console.log(`[API /voice/piper] Synthesizing speech for project ${projectId}`);
    console.log(`[API /voice/piper] Voice: ${voiceName || 'default'}, Length: ${text.length} chars`);

    // Call synthesis
    const result = await synthesizeSpeech(projectId, {
      text,
      voice: voiceName,
      speedRate: speedRate || 1.0,
    });

    if (result.error) {
      return NextResponse.json(
        {
          status: 'error',
          error: result.error,
        },
        { status: 500 }
      );
    }

    // Convert absolute paths to relative URLs for frontend
    const audioUrlLocal = result.audioFilePath
      ? `/voice/${projectId}/${path.basename(result.audioFilePath)}`
      : undefined;

    console.log(`[API /voice/piper] Success: ${audioUrlLocal}`);

    return NextResponse.json({
      status: 'ok',
      audioUrlLocal,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[API /voice/piper] Error:', errorMessage);
    
    return NextResponse.json(
      {
        status: 'error',
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
