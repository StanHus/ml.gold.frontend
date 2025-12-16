/**
 * Gold API Routes
 * Main API for interacting with the gold price analysis system
 */

import { NextRequest, NextResponse } from 'next/server';
import brainService from '@/lib/services/brain';
import csvImportService from '@/lib/services/csvImport';
import metalApiService from '@/lib/services/metalApi';
import worldNewsService from '@/lib/services/worldNews';
import fredApiService from '@/lib/services/fredApi';
import quantifierService from '@/lib/services/quantifier';
import patternDetectorService from '@/lib/services/patternDetector';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');
  
  try {
    switch (action) {
      case 'latest': {
        const price = await brainService.getLatestPrice();
        return NextResponse.json({ success: true, data: price });
      }
      
      case 'date': {
        const dateStr = searchParams.get('date');
        if (!dateStr) {
          return NextResponse.json({ success: false, error: 'Date parameter required' }, { status: 400 });
        }
        const analysis = await brainService.getDateAnalysis(new Date(dateStr));
        return NextResponse.json({ success: true, data: analysis });
      }
      
      case 'swings': {
        const minSwing = parseFloat(searchParams.get('minSwing') || '2');
        const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
        const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
        const direction = searchParams.get('direction') as 'up' | 'down' | 'both' | undefined;
        
        const swings = await brainService.findSwings(minSwing, startDate, endDate, direction);
        return NextResponse.json({ success: true, data: swings });
      }
      
      case 'period': {
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        if (!startDate || !endDate) {
          return NextResponse.json({ success: false, error: 'startDate and endDate required' }, { status: 400 });
        }
        const stats = await brainService.getPeriodStats(new Date(startDate), new Date(endDate));
        return NextResponse.json({ success: true, data: stats });
      }
      
      case 'search': {
        const criteria: Record<string, unknown> = {};
        if (searchParams.get('minPrice')) criteria.minPrice = parseFloat(searchParams.get('minPrice')!);
        if (searchParams.get('maxPrice')) criteria.maxPrice = parseFloat(searchParams.get('maxPrice')!);
        if (searchParams.get('minDailyChange')) criteria.minDailyChange = parseFloat(searchParams.get('minDailyChange')!);
        if (searchParams.get('maxDailyChange')) criteria.maxDailyChange = parseFloat(searchParams.get('maxDailyChange')!);
        if (searchParams.get('trend')) criteria.trend = searchParams.get('trend');
        if (searchParams.get('limit')) criteria.limit = parseInt(searchParams.get('limit')!);
        
        const results = await brainService.searchDates(criteria);
        return NextResponse.json({ success: true, data: results });
      }
      
      case 'patterns': {
        const patternType = searchParams.get('type') || undefined;
        const minConfidence = searchParams.get('minConfidence') ? parseFloat(searchParams.get('minConfidence')!) : undefined;
        
        const patterns = await patternDetectorService.getPatternOccurrences({
          patternType,
          minConfidence,
          limit: 50,
        });
        return NextResponse.json({ success: true, data: patterns });
      }
      
      case 'news': {
        const dateStr = searchParams.get('date');
        if (dateStr) {
          const news = await worldNewsService.getNewsAroundDate(new Date(dateStr));
          return NextResponse.json({ success: true, data: news });
        }
        const category = searchParams.get('category');
        if (category) {
          const news = await worldNewsService.getNewsByCategory(category);
          return NextResponse.json({ success: true, data: news });
        }
        return NextResponse.json({ success: false, error: 'Date or category required' }, { status: 400 });
      }
      
      case 'quantifications': {
        const pending = searchParams.get('pending') === 'true';
        if (pending) {
          const data = await quantifierService.getPendingReview(50);
          return NextResponse.json({ success: true, data });
        }
        const dateStr = searchParams.get('date');
        if (dateStr) {
          const data = await quantifierService.getHighImpactNews(new Date(dateStr));
          return NextResponse.json({ success: true, data });
        }
        return NextResponse.json({ success: false, error: 'Specify pending=true or date' }, { status: 400 });
      }
      
      case 'feedback-stats': {
        const stats = await quantifierService.getFeedbackStats();
        return NextResponse.json({ success: true, data: stats });
      }
      
      case 'indicators': {
        const dateStr = searchParams.get('date');
        if (!dateStr) {
          return NextResponse.json({ success: false, error: 'Date parameter required' }, { status: 400 });
        }
        const indicators = await fredApiService.getIndicatorsForDate(new Date(dateStr));
        return NextResponse.json({ success: true, data: indicators });
      }
      
      default:
        return NextResponse.json({ 
          success: false, 
          error: 'Invalid action',
          availableActions: ['latest', 'date', 'swings', 'period', 'search', 'patterns', 'news', 'quantifications', 'feedback-stats', 'indicators']
        }, { status: 400 });
    }
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;
  
  try {
    switch (action) {
      case 'import-csv': {
        const { content } = body;
        if (!content) {
          return NextResponse.json({ success: false, error: 'CSV content required' }, { status: 400 });
        }
        const result = await csvImportService.importFromCsvContent(content);
        return NextResponse.json({ success: true, data: result });
      }
      
      case 'calculate-metrics': {
        const updated = await csvImportService.calculateDerivedMetrics();
        return NextResponse.json({ success: true, data: { updated } });
      }
      
      case 'fetch-live-price': {
        const liveData = await metalApiService.getLivePrice();
        await metalApiService.fetchAndStoreLivePrice();
        return NextResponse.json({ success: true, data: { price: liveData.price, timestamp: liveData.timestamp } });
      }
      
      case 'fetch-news': {
        const { startDate, endDate } = body;
        const result = await worldNewsService.fetchAndStoreNews({
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
        });
        return NextResponse.json({ success: true, data: result });
      }
      
      case 'fetch-indicators': {
        const { startDate, endDate } = body;
        const results = await fredApiService.fetchAllRelevantIndicators({
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
        });
        return NextResponse.json({ success: true, data: results });
      }
      
      case 'detect-patterns': {
        const { startDate, endDate } = body;
        const result = await patternDetectorService.detectAndStorePatterns(
          startDate ? new Date(startDate) : undefined,
          endDate ? new Date(endDate) : undefined
        );
        return NextResponse.json({ success: true, data: result });
      }
      
      case 'quantify-news': {
        const { startDate, endDate, maxLagDays } = body;
        if (!startDate || !endDate) {
          return NextResponse.json({ success: false, error: 'startDate and endDate required' }, { status: 400 });
        }
        const result = await quantifierService.quantifyNewsForPeriod(
          new Date(startDate),
          new Date(endDate),
          { maxLagDays }
        );
        return NextResponse.json({ success: true, data: result });
      }
      
      case 'submit-feedback': {
        const { quantificationId, humanScore, humanFeedback, verifiedBy } = body;
        if (!quantificationId || humanScore === undefined) {
          return NextResponse.json({ success: false, error: 'quantificationId and humanScore required' }, { status: 400 });
        }
        await quantifierService.submitFeedback(quantificationId, { humanScore, humanFeedback, verifiedBy });
        return NextResponse.json({ success: true });
      }
      
      case 'submit-pattern-feedback': {
        const { occurrenceId, confirmed, actualMove, notes } = body;
        if (!occurrenceId || confirmed === undefined) {
          return NextResponse.json({ success: false, error: 'occurrenceId and confirmed required' }, { status: 400 });
        }
        await patternDetectorService.submitPatternFeedback(occurrenceId, { confirmed, actualMove, notes });
        return NextResponse.json({ success: true });
      }
      
      default:
        return NextResponse.json({ 
          success: false, 
          error: 'Invalid action',
          availableActions: ['import-csv', 'calculate-metrics', 'fetch-live-price', 'fetch-news', 'fetch-indicators', 'detect-patterns', 'quantify-news', 'submit-feedback', 'submit-pattern-feedback']
        }, { status: 400 });
    }
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

