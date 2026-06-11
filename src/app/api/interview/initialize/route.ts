import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, topics, jd, resume } = body;

    if (!type || (type !== 'topic' && type !== 'jd_resume')) {
      return NextResponse.json(
        { error: 'Invalid interview type. Must be "topic" or "jd_resume".' },
        { status: 400 }
      );
    }

    const id = 'intv_' + Date.now().toString();
    const welcomeQuestion = 'Hello! Thank you for joining the interview today. To start, could you please introduce yourself and share a brief overview of your background?';

    let systemPrompt = '';
    let metadata: any = {};

    if (type === 'topic') {
      if (!topics || !Array.isArray(topics) || topics.length === 0) {
        return NextResponse.json(
          { error: 'Topics array is required for topic-based interviews.' },
          { status: 400 }
        );
      }
      metadata = { topics };
      systemPrompt = `You are a professional AI interviewer conducting a rigorous technical screening.
The candidate has chosen to be interviewed on the following topics: ${topics.join(', ')}.

Instructions:
- Restrict your questions and conversations STRICTLY to these selected topics: ${topics.join(', ')}.
- Dynamically adapt the difficulty based on the candidate's answers. If they show deep knowledge, ask progressively harder conceptual or architectural questions.
- Ask ONE targeted question at a time.
- Start by listening to their background, and then transition smoothly into technical questioning about ${topics.join(', ')}.
- Keep all questions and responses extremely short and conversational (1-2 sentences max).
- Speak naturally like a human recruiter. Do NOT use bullet points, formatting, lists, or markdown.`;
    } else {
      if (!jd || !resume) {
        return NextResponse.json(
          { error: 'Both Job Description (jd) and Resume (resume) are required.' },
          { status: 400 }
        );
      }
      metadata = { jd, resume };
      systemPrompt = `You are a professional AI interviewer conducting a tailored technical screening.
Job Description (JD):
${jd}

Candidate Resume:
${resume}

Instructions:
- Carefully analyze both the JD requirements and the Candidate Resume.
- Ask highly realistic, professional recruiter-style questions targeted strictly to:
  1. The candidate's past experiences and listed skills.
  2. The technical and behavioral expectations detailed in the Job Description.
- Ask ONE question at a time.
- Start by welcoming them, and then transition into digging deeper into their resumes and experience as it relates to the JD.
- Keep all questions and responses extremely short and conversational (1-2 sentences max).
- Speak naturally like a human. Do NOT use bullet points, formatting, lists, or markdown.`;
    }

    // Insert the session into MongoDB
    const db = await getDb();
    await db.collection<any>('interviews').insertOne({
      _id: id as any,
      type,
      timestamp: new Date(),
      metadata,
      transcript: [
        { role: 'system', content: systemPrompt, timestamp: new Date() },
        { role: 'assistant', content: welcomeQuestion, timestamp: new Date() }
      ]
    });

    return NextResponse.json({ id, firstQuestion: welcomeQuestion });
  } catch (error: any) {
    console.error('Initialize Interview API Error:', error);
    return NextResponse.json(
      { error: 'Failed to initialize interview', message: error.message },
      { status: 500 }
    );
  }
}
