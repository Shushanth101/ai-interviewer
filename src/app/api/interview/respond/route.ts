import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { streamText } from 'ai';
import { createGroq } from '@ai-sdk/groq';

const groqApiKey = process.env.GROQ_API_KEY ;
const groq = createGroq({ apiKey: groqApiKey });
const llmModel = groq('openai/gpt-oss-120b');

const TTS_SERVER = 'http://127.0.0.1:8000';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { chatId, prompt } = body;

    if (!chatId || !prompt) {
      return NextResponse.json(
        { error: 'chatId and prompt are required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const interview = await db.collection<any>('interviews').findOne({ _id: chatId });

    if (!interview) {
      return NextResponse.json(
        { error: 'Interview session not found' },
        { status: 404 }
      );
    }

    // 1. Push user's transcribed response into the MongoDB transcript history
    const userMessage = { role: 'user', content: prompt, timestamp: new Date() };
    await db.collection<any>('interviews').updateOne(
      { _id: chatId },
      { $push: { transcript: userMessage } } as any
    );

    // 2. Fetch full history to construct AI context
    const updatedInterview = await db.collection<any>('interviews').findOne({ _id: chatId });
    const transcriptHistory = updatedInterview?.transcript || [];

    // Map messages to core message formats expected by Vercel AI SDK
    const messages = transcriptHistory.map((msg: any) => ({
      role: msg.role === 'system' ? 'system' : msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    }));

    // 3. Generate conversational next question via Groq openai/gpt-oss-120b
    const result = await streamText({
      model: llmModel,
      messages: messages,
    });

    // Accumulate the streaming response
    let assistantText = '';
    for await (const textPart of result.textStream) {
      assistantText += textPart;
    }

    assistantText = assistantText.trim();

    // 4. Push Assistant's response into MongoDB
    const assistantMessage = { role: 'assistant', content: assistantText, timestamp: new Date() };
    await db.collection<any>('interviews').updateOne(
      { _id: chatId },
      { $push: { transcript: assistantMessage } } as any
    );

    // 5. Generate TTS wav audio from local Supertonic server
    let audioBuffer: Buffer;
    try {
      const ttsUrl = `${TTS_SERVER}/tts?text=${encodeURIComponent(assistantText)}&lang=en&voice=M1&speed=1.0`;
      const ttsResponse = await fetch(ttsUrl);

      if (!ttsResponse.ok) {
        throw new Error(`TTS server responded with status: ${ttsResponse.status}`);
      }

      const arrayBuffer = await ttsResponse.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
    } catch (ttsErr: any) {
      console.error('TTS Generation failed, sending JSON fallback instead:', ttsErr);
      // If TTS fails, we return a fallback headers state with empty audio or a descriptive message
      return NextResponse.json(
        { 
          error: 'TTS generation failed', 
          message: ttsErr.message, 
          transcript: assistantText 
        },
        { status: 500 }
      );
    }

    // 6. Return standard audio binary response stream with custom X-Transcript headers
    return new Response(audioBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'X-Transcript': encodeURIComponent(assistantText),
        'Access-Control-Expose-Headers': 'X-Transcript',
      }
    });

  } catch (error: any) {
    console.error('Interview Respond Route Error:', error);
    return NextResponse.json(
      { error: 'Internal response generation failed', message: error.message },
      { status: 500 }
    );
  }
}
