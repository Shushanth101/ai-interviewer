import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const db = await getDb();
    
    // Retrieve all interviews, sorting from newest to oldest
    const interviews = await db
      .collection<any>('interviews')
      .find({})
      .sort({ timestamp: -1 })
      .toArray();

    return NextResponse.json({ interviews });
  } catch (error: any) {
    console.error('Fetch History Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve past interviews', message: error.message },
      { status: 500 }
    );
  }
}
