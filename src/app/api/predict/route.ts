import { NextRequest, NextResponse } from 'next/server';
import { generatePrediction } from '@/lib/services/predictor';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const horizon = parseInt(searchParams.get('horizon') || '7');
    
    const prediction = await generatePrediction(horizon);
    
    return NextResponse.json({
      success: true,
      prediction,
    });
  } catch (error) {
    console.error('Prediction error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

