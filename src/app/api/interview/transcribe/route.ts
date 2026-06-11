import { NextResponse } from 'next/server';
import { experimental_transcribe as transcribe } from 'ai';
import { createGroq } from '@ai-sdk/groq';

const groqApiKey = process.env.GROQ_API_KEY ;
const groq = createGroq({ apiKey: groqApiKey });
const sttModel = groq.transcription('whisper-large-v3-turbo');

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { base64Audio } = body;

    if (!base64Audio) {
      return NextResponse.json(
        { error: 'base64Audio is required' },
        { status: 400 }
      );
    }

    // Call Vercel AI SDK transcription helper
    const result = await transcribe({
      model: sttModel,
      audio: base64Audio,
      providerOptions: {
        groq: { language: 'en' },
      },
    });

    return NextResponse.json({ transcription: result.text });
  } catch (error: any) {
    console.error('Transcription Route Error:', error);
    return NextResponse.json(
      { error: 'Failed to transcribe audio', message: error.message },
      { status: 500 }
    );
  }
}
