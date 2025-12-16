/**
 * FRED API Service
 * Fetches economic indicators from the Federal Reserve Economic Data
 */

import prisma from '../db';
import { format, subYears } from 'date-fns';

interface FredObservation {
  realtime_start: string;
  realtime_end: string;
  date: string;
  value: string;
}

interface FredSeriesResponse {
  realtime_start: string;
  realtime_end: string;
  observation_start: string;
  observation_end: string;
  units: string;
  output_type: number;
  file_type: string;
  order_by: string;
  sort_order: string;
  count: number;
  offset: number;
  limit: number;
  observations: FredObservation[];
}

export const GOLD_RELEVANT_SERIES = {
  FEDFUNDS: 'Federal Funds Effective Rate',
  DFF: 'Federal Funds Rate (Daily)',
  DTB3: '3-Month Treasury Bill Rate',
  DGS10: '10-Year Treasury Constant Maturity Rate',
  DGS2: '2-Year Treasury Constant Maturity Rate',
  T10Y2Y: '10-Year Treasury Minus 2-Year Treasury (Yield Curve)',
  CPIAUCSL: 'Consumer Price Index for All Urban Consumers',
  CPILFESL: 'Core CPI (Less Food and Energy)',
  PCEPI: 'Personal Consumption Expenditures Price Index',
  T5YIE: '5-Year Breakeven Inflation Rate',
  T10YIE: '10-Year Breakeven Inflation Rate',
  DTWEXBGS: 'Trade Weighted U.S. Dollar Index',
  DEXUSEU: 'USD/EUR Exchange Rate',
  GDPC1: 'Real GDP',
  UNRATE: 'Unemployment Rate',
  ICSA: 'Initial Jobless Claims',
  M2SL: 'M2 Money Supply',
  WALCL: 'Federal Reserve Total Assets',
  DCOILWTICO: 'Crude Oil Prices (WTI)',
  GOLDAMGBD228NLBM: 'Gold Fixing Price (London)',
} as const;

export class FredApiService {
  private apiKey: string;
  private baseUrl = 'https://api.stlouisfed.org/fred';

  constructor() {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) {
      throw new Error('FRED_API_KEY environment variable is not set');
    }
    this.apiKey = apiKey;
  }

  async getSeriesObservations(seriesId: string, options: { startDate?: Date; endDate?: Date; limit?: number } = {}): Promise<FredObservation[]> {
    const { startDate = subYears(new Date(), 5), endDate = new Date(), limit = 10000 } = options;
    
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: this.apiKey,
      file_type: 'json',
      observation_start: format(startDate, 'yyyy-MM-dd'),
      observation_end: format(endDate, 'yyyy-MM-dd'),
      limit: String(limit),
      sort_order: 'desc',
    });
    
    const response = await fetch(`${this.baseUrl}/series/observations?${params}`);
    const data: FredSeriesResponse = await response.json();
    
    return data.observations || [];
  }

  async getLatestValue(seriesId: string): Promise<{ date: Date; value: number } | null> {
    const observations = await this.getSeriesObservations(seriesId, { limit: 1 });
    
    if (observations.length === 0 || observations[0].value === '.') {
      return null;
    }
    
    return {
      date: new Date(observations[0].date),
      value: parseFloat(observations[0].value),
    };
  }

  async fetchAndStoreIndicator(seriesId: string, options: { startDate?: Date; endDate?: Date } = {}): Promise<{ stored: number; skipped: number }> {
    const observations = await this.getSeriesObservations(seriesId, options);
    const name = GOLD_RELEVANT_SERIES[seriesId as keyof typeof GOLD_RELEVANT_SERIES] || seriesId;
    
    let stored = 0;
    let skipped = 0;
    
    for (const obs of observations) {
      if (obs.value === '.') {
        skipped++;
        continue;
      }
      
      try {
        const date = new Date(obs.date);
        date.setHours(0, 0, 0, 0);
        
        await prisma.economicIndicator.upsert({
          where: { seriesId_date: { seriesId, date } },
          update: { value: parseFloat(obs.value) },
          create: { seriesId, name, date, value: parseFloat(obs.value) },
        });
        
        stored++;
      } catch (error) {
        console.error(`Failed to store ${seriesId} for ${obs.date}:`, error);
        skipped++;
      }
    }
    
    return { stored, skipped };
  }

  async fetchAllRelevantIndicators(options: { startDate?: Date; endDate?: Date } = {}): Promise<{ [seriesId: string]: { stored: number; skipped: number } }> {
    const results: { [seriesId: string]: { stored: number; skipped: number } } = {};
    
    for (const seriesId of Object.keys(GOLD_RELEVANT_SERIES)) {
      try {
        results[seriesId] = await this.fetchAndStoreIndicator(seriesId, options);
      } catch (error) {
        console.error(`Failed to fetch ${seriesId}:`, error);
        results[seriesId] = { stored: 0, skipped: 0 };
      }
    }
    
    return results;
  }

  async getIndicatorsForDate(date: Date): Promise<{ seriesId: string; name: string; value: number; date: Date }[]> {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    const results: { seriesId: string; name: string; value: number; date: Date }[] = [];
    
    for (const [seriesId, name] of Object.entries(GOLD_RELEVANT_SERIES)) {
      const indicator = await prisma.economicIndicator.findFirst({
        where: { seriesId, date: { lte: targetDate } },
        orderBy: { date: 'desc' },
      });
      
      if (indicator) {
        results.push({ seriesId, name, value: indicator.value, date: indicator.date });
      }
    }
    
    return results;
  }

  async getIndicatorTimeSeries(seriesId: string, startDate: Date, endDate: Date): Promise<{ date: Date; value: number }[]> {
    const indicators = await prisma.economicIndicator.findMany({
      where: { seriesId, date: { gte: startDate, lte: endDate } },
      orderBy: { date: 'asc' },
    });
    
    return indicators.map(i => ({ date: i.date, value: i.value }));
  }

  async calculateCorrelation(seriesId: string, startDate: Date, endDate: Date): Promise<number | null> {
    const [indicators, prices] = await Promise.all([
      prisma.economicIndicator.findMany({
        where: { seriesId, date: { gte: startDate, lte: endDate } },
        orderBy: { date: 'asc' },
      }),
      prisma.goldPrice.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        orderBy: { date: 'asc' },
      }),
    ]);
    
    if (indicators.length < 10 || prices.length < 10) {
      return null;
    }
    
    const indicatorMap = new Map(indicators.map(i => [i.date.toISOString().split('T')[0], i.value]));
    const priceMap = new Map(prices.map(p => [p.date.toISOString().split('T')[0], p.closePrice]));
    
    const pairs: { x: number; y: number }[] = [];
    
    for (const [dateStr, indicatorValue] of indicatorMap) {
      const goldPrice = priceMap.get(dateStr);
      if (goldPrice !== undefined) {
        pairs.push({ x: indicatorValue, y: goldPrice });
      }
    }
    
    if (pairs.length < 10) {
      return null;
    }
    
    const n = pairs.length;
    const sumX = pairs.reduce((a, b) => a + b.x, 0);
    const sumY = pairs.reduce((a, b) => a + b.y, 0);
    const sumXY = pairs.reduce((a, b) => a + b.x * b.y, 0);
    const sumX2 = pairs.reduce((a, b) => a + b.x * b.x, 0);
    const sumY2 = pairs.reduce((a, b) => a + b.y * b.y, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    if (denominator === 0) {
      return null;
    }
    
    return numerator / denominator;
  }
}

export const fredApiService = new FredApiService();
export default fredApiService;
