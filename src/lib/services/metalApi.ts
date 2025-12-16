/**
 * Metal API Service
 * Fetches live and historical gold prices from Metal API
 * API Docs: https://metalpriceapi.com/documentation
 */

import prisma from '../db';

const METAL_API_BASE = 'https://api.metalpriceapi.com/v1';

interface MetalPriceResponse {
  success: boolean;
  timestamp: number;
  base: string;
  rates: {
    XAU?: number; // Gold
    [key: string]: number | undefined;
  };
}

interface MetalHistoricalResponse extends MetalPriceResponse {
  date: string;
}

interface TimeSeriesResponse {
  success: boolean;
  timeseries: boolean;
  start_date: string;
  end_date: string;
  base: string;
  rates: {
    [date: string]: {
      XAU?: number;
      [key: string]: number | undefined;
    };
  };
}

export class MetalApiService {
  private apiKey: string;

  constructor() {
    const apiKey = process.env.METAL_API_KEY;
    if (!apiKey) {
      throw new Error('METAL_API_KEY environment variable is not set');
    }
    this.apiKey = apiKey;
  }

  /**
   * Fetch current live gold price
   */
  async getLivePrice(): Promise<{ price: number; timestamp: Date }> {
    const url = `${METAL_API_BASE}/latest?api_key=${this.apiKey}&base=USD&currencies=XAU`;
    
    const response = await fetch(url);
    const data: MetalPriceResponse = await response.json();
    
    if (!data.success || !data.rates.XAU) {
      throw new Error('Failed to fetch live gold price');
    }
    
    // Metal API returns gold as 1/oz in USD, we need to invert
    const pricePerOz = 1 / data.rates.XAU;
    
    return {
      price: pricePerOz,
      timestamp: new Date(data.timestamp * 1000),
    };
  }

  /**
   * Fetch gold price for a specific date
   */
  async getHistoricalPrice(date: Date): Promise<{ price: number; date: Date }> {
    const dateStr = date.toISOString().split('T')[0];
    const url = `${METAL_API_BASE}/${dateStr}?api_key=${this.apiKey}&base=USD&currencies=XAU`;
    
    const response = await fetch(url);
    const data: MetalHistoricalResponse = await response.json();
    
    if (!data.success || !data.rates.XAU) {
      throw new Error(`Failed to fetch gold price for ${dateStr}`);
    }
    
    const pricePerOz = 1 / data.rates.XAU;
    
    return {
      price: pricePerOz,
      date: new Date(data.date),
    };
  }

  /**
   * Fetch gold prices for a date range
   */
  async getTimeSeries(startDate: Date, endDate: Date): Promise<Array<{ date: Date; price: number }>> {
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    const url = `${METAL_API_BASE}/timeframe?api_key=${this.apiKey}&start_date=${startStr}&end_date=${endStr}&base=USD&currencies=XAU`;
    
    const response = await fetch(url);
    const data: TimeSeriesResponse = await response.json();
    
    if (!data.success) {
      throw new Error(`Failed to fetch time series from ${startStr} to ${endStr}`);
    }
    
    const prices: Array<{ date: Date; price: number }> = [];
    
    for (const [dateStr, rates] of Object.entries(data.rates)) {
      if (rates.XAU) {
        prices.push({
          date: new Date(dateStr),
          price: 1 / rates.XAU,
        });
      }
    }
    
    return prices.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Fetch and store live price in database
   */
  async fetchAndStoreLivePrice(): Promise<void> {
    const { price, timestamp } = await this.getLivePrice();
    
    // Normalize to start of day for storage
    const dateOnly = new Date(timestamp);
    dateOnly.setHours(0, 0, 0, 0);
    
    await prisma.goldPrice.upsert({
      where: { date: dateOnly },
      update: {
        closePrice: price,
        source: 'metal_api',
        updatedAt: new Date(),
      },
      create: {
        date: dateOnly,
        closePrice: price,
        source: 'metal_api',
      },
    });
  }

  /**
   * Backfill historical prices from API
   */
  async backfillFromApi(startDate: Date, endDate: Date): Promise<number> {
    const prices = await this.getTimeSeries(startDate, endDate);
    let count = 0;
    
    for (const { date, price } of prices) {
      const dateOnly = new Date(date);
      dateOnly.setHours(0, 0, 0, 0);
      
      await prisma.goldPrice.upsert({
        where: { date: dateOnly },
        update: {
          closePrice: price,
          source: 'metal_api',
        },
        create: {
          date: dateOnly,
          closePrice: price,
          source: 'metal_api',
        },
      });
      count++;
    }
    
    return count;
  }
}

export const metalApiService = new MetalApiService();
export default metalApiService;

