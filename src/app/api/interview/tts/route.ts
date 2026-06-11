import { NextResponse } from 'next/server';

const TTS_SERVER = 'http://127.0.0.1:8000';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const text = searchParams.get('text');
    const lang = searchParams.get('lang') || 'en';
    const voice = searchParams.get('voice') || 'M1';
    const speed = searchParams.get('speed') || '1.0';

    if (!text) {
      return NextResponse.json(
        { error: 'text parameter is required' },
        { status: 400 }
      );
    }

    const ttsUrl = `${TTS_SERVER}/tts?text=${encodeURIComponent(text)}&lang=${lang}&voice=${voice}&speed=${speed}`;
    const ttsResponse = await fetch(ttsUrl);

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text();
      return NextResponse.json(
        { error: 'Supertonic TTS server returned an error', details: errText },
        { status: 502 }
      );
    }

    const audioBuffer = await ttsResponse.arrayBuffer();

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (error: any) {
    console.error('TTS Proxy API Error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy TTS request', message: error.message },
      { status: 500 }
    );
  }
}
