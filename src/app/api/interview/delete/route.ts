import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function DELETE(req: Request) {
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
    const result = await db.collection<any>('interviews').deleteOne({ _id: id });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: 'Interview session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, deleted: id });
  } catch (error: any) {
    console.error('Delete Interview Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete interview session', message: error.message },
      { status: 500 }
    );
  }
}
