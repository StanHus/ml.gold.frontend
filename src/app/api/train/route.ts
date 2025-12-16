import { NextRequest, NextResponse } from 'next/server';
import { trainPatternModel } from '@/lib/services/mlTrainer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    
    const config = {
      epochs: body.epochs || 10,
      learningRate: body.learningRate || 0.01,
      windowSize: body.windowSize || 20,
      predictionHorizon: body.predictionHorizon || 7,
    };
    
    console.log('Starting training with config:', config);
    
    const results = await trainPatternModel(config);
    
    return NextResponse.json({
      success: true,
      config,
      epochs: results.length,
      finalMetrics: results[results.length - 1],
      allResults: results,
    });
  } catch (error) {
    console.error('Training error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint with training config',
    example: {
      epochs: 10,
      learningRate: 0.01,
      windowSize: 20,
      predictionHorizon: 7,
    },
  });
}

