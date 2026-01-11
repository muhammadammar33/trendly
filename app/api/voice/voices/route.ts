import { NextRequest, NextResponse } from 'next/server';
import voicesConfig from '@/voice/voices.json';

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json({
      status: 'ok',
      voices: voicesConfig.voices,
      speeds: voicesConfig.speeds,
    });
  } catch (error) {
    console.error('[API /voice/voices] Error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: 'Failed to load voice configuration',
      },
      { status: 500 }
    );
  }
}
