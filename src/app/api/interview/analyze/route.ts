import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createGroq } from '@ai-sdk/groq';

const groqApiKey = process.env.GROQ_API_KEY ;
const groq = createGroq({ apiKey: groqApiKey });
const llmModel = groq('openai/gpt-oss-120b');

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { chatId } = body;

    if (!chatId) {
      return NextResponse.json(
        { error: 'chatId is required' },
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

    const transcript = interview.transcript || [];
    
    // Filter and format transcript for LLM review
    const chatEntries = transcript.filter((msg: any) => msg.role !== 'system');
    
    if (chatEntries.length <= 1) {
      return NextResponse.json(
        { error: 'Transcript is too short to analyze. Please complete at least one round of Q&A.' },
        { status: 400 }
      );
    }

    const formattedTranscript = chatEntries
      .map((msg: any) => `${msg.role === 'user' ? 'Candidate' : 'Interviewer'}: ${msg.content}`)
      .join('\n\n');

    // 1. Generate rich evaluation object using Vercel AI SDK generateObject
    const result = await generateObject({
      model: llmModel,
      schema: z.object({
        communicationQuality: z.string().describe('Detailed evaluation of clarity, conciseness, pacing, and structural presentation.'),
        technicalAccuracy: z.string().describe('Critical technical accuracy breakdown of candidate responses, checking facts and understanding.'),
        confidence: z.string().describe('Assessment of candour, hesitations, delivery confidence, and poise.'),
        strengths: z.array(z.string()).describe('Top 3-5 distinct strengths highlighted by the candidate (technical/conceptual/behavioral).'),
        weaknesses: z.array(z.string()).describe('Top 3-5 critical technical gaps, misconceptions, or areas that require brushing up.'),
        suggestions: z.array(z.string()).describe('3-5 constructive, clear learning roadmap suggestions to level up their skills.'),
        topicScores: z.array(
          z.object({
            topic: z.string().describe('evaluated topic or skill domain, e.g. React, Database, Design Patterns, Communication'),
            score: z.number().min(0).max(100).describe('Score from 0 to 100')
          })
        ).describe('Scores by specific categories based on candidate inputs.'),
        overallScore: z.number().min(0).max(100).describe('Consolidated overall interview rating percentage.'),
        summary: z.string().describe('Paragraph-level hiring feedback summarizing their readiness, seniority, and communication.')
      }),
      prompt: `You are an elite, highly critical technical interviewer, system architect, and recruiter.
Review this candidate's live technical interview transcript:

${formattedTranscript}

Perform an exhaustive, objective, and deeply technical assessment. Focus heavily on actual substance, detecting whether answers are surface-level or display deep architectural expertise.
Fill out the structured JSON report accurately.`,
    });

    const analysisResult = result.object;

    // 2. Save generated analysis directly into MongoDB
    await db.collection<any>('interviews').updateOne(
      { _id: chatId },
      { $set: { analysis: analysisResult } } as any
    );

    return NextResponse.json({ success: true, analysis: analysisResult });

  } catch (error: any) {
    console.error('Analysis API Error:', error);
    return NextResponse.json(
      { error: 'Failed to run AI analysis on transcript', message: error.message },
      { status: 500 }
    );
  }
}
