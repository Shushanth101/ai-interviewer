import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Session ID parameter (id) is required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const interview = await db.collection<any>('interviews').findOne({ _id: id });

    if (!interview) {
      return NextResponse.json(
        { error: 'Interview session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ interview });
  } catch (error: any) {
    console.error('Fetch Details Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve interview details', message: error.message },
      { status: 500 }
    );
  }
}
