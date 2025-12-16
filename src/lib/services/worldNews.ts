/**
 * World News API Service
 * Fetches news articles related to gold and commodities
 */

import prisma from '../db';
import { subDays, format } from 'date-fns';

interface WorldNewsArticle {
  id: number;
  title: string;
  text: string;
  summary?: string;
  url: string;
  image?: string;
  publish_date: string;
  author?: string;
  language: string;
  source_country?: string;
  sentiment?: number;
}

interface WorldNewsResponse {
  offset: number;
  number: number;
  available: number;
  news: WorldNewsArticle[];
}

const IMPACT_CATEGORIES = {
  inflation: ['inflation', 'CPI', 'consumer price', 'cost of living', 'purchasing power'],
  interest_rates: ['interest rate', 'federal reserve', 'fed rate', 'monetary policy', 'rate hike', 'rate cut', 'FOMC'],
  currency: ['dollar', 'USD', 'currency', 'forex', 'DXY', 'dollar index'],
  geopolitics: ['war', 'conflict', 'sanctions', 'tension', 'crisis', 'military', 'invasion'],
  economy: ['recession', 'GDP', 'unemployment', 'economic growth', 'stimulus', 'debt'],
  demand: ['jewelry demand', 'industrial demand', 'gold demand', 'ETF inflow', 'physical gold'],
  supply: ['gold mining', 'gold production', 'mine output', 'gold supply'],
};

export class WorldNewsService {
  private apiKey: string;
  private baseUrl = 'https://api.worldnewsapi.com';

  constructor() {
    const apiKey = process.env.WORLD_NEWS_API_KEY;
    if (!apiKey) {
      throw new Error('WORLD_NEWS_API_KEY environment variable is not set');
    }
    this.apiKey = apiKey;
  }

  async searchGoldNews(options: { startDate?: Date; endDate?: Date; limit?: number } = {}): Promise<WorldNewsArticle[]> {
    const { startDate = subDays(new Date(), 7), endDate = new Date(), limit = 100 } = options;
    
    const params = new URLSearchParams({
      'api-key': this.apiKey,
      'text': 'gold OR bullion OR "precious metals" OR XAU',
      'earliest-publish-date': format(startDate, 'yyyy-MM-dd'),
      'latest-publish-date': format(endDate, 'yyyy-MM-dd'),
      'language': 'en',
      'number': String(limit),
      'sort': 'publish-time',
      'sort-direction': 'DESC',
    });
    
    const response = await fetch(`${this.baseUrl}/search-news?${params}`);
    const data: WorldNewsResponse = await response.json();
    
    return data.news || [];
  }

  async searchByTopic(topic: string, options: { startDate?: Date; endDate?: Date; limit?: number } = {}): Promise<WorldNewsArticle[]> {
    const { startDate = subDays(new Date(), 7), endDate = new Date(), limit = 50 } = options;
    
    const params = new URLSearchParams({
      'api-key': this.apiKey,
      'text': topic,
      'earliest-publish-date': format(startDate, 'yyyy-MM-dd'),
      'latest-publish-date': format(endDate, 'yyyy-MM-dd'),
      'language': 'en',
      'number': String(limit),
      'sort': 'publish-time',
      'sort-direction': 'DESC',
    });
    
    const response = await fetch(`${this.baseUrl}/search-news?${params}`);
    const data: WorldNewsResponse = await response.json();
    
    return data.news || [];
  }

  categorizeArticle(article: WorldNewsArticle): string[] {
    const text = `${article.title} ${article.text}`.toLowerCase();
    const categories: string[] = [];
    
    for (const [category, keywords] of Object.entries(IMPACT_CATEGORIES)) {
      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          categories.push(category);
          break;
        }
      }
    }
    
    return categories.length > 0 ? categories : ['general'];
  }

  async fetchAndStoreNews(options: { startDate?: Date; endDate?: Date; limit?: number } = {}): Promise<{ stored: number; skipped: number }> {
    const articles = await this.searchGoldNews(options);
    let stored = 0;
    let skipped = 0;
    
    for (const article of articles) {
      try {
        const categories = this.categorizeArticle(article);
        
        await prisma.newsArticle.upsert({
          where: { externalId: String(article.id) },
          update: {
            title: article.title,
            text: article.text,
            summary: article.summary,
            url: article.url,
            source: article.source_country,
            author: article.author,
            sentiment: article.sentiment,
            category: categories[0] || 'general',
            updatedAt: new Date(),
          },
          create: {
            externalId: String(article.id),
            title: article.title,
            text: article.text,
            summary: article.summary,
            url: article.url,
            source: article.source_country,
            author: article.author,
            publishedAt: new Date(article.publish_date),
            sentiment: article.sentiment,
            category: categories[0] || 'general',
          },
        });
        
        stored++;
      } catch (error) {
        console.error(`Failed to store article ${article.id}:`, error);
        skipped++;
      }
    }
    
    return { stored, skipped };
  }

  async getNewsAroundDate(date: Date, daysBefore: number = 3, daysAfter: number = 1): Promise<{
    id: string;
    title: string;
    text: string;
    publishedAt: Date;
    category: string | null;
    sentiment: number | null;
  }[]> {
    const startDate = subDays(date, daysBefore);
    const endDate = subDays(date, -daysAfter);
    
    return prisma.newsArticle.findMany({
      where: { publishedAt: { gte: startDate, lte: endDate } },
      orderBy: { publishedAt: 'desc' },
      select: { id: true, title: true, text: true, publishedAt: true, category: true, sentiment: true },
    });
  }

  async getNewsByCategory(category: string, limit: number = 50): Promise<{
    id: string;
    title: string;
    publishedAt: Date;
    sentiment: number | null;
  }[]> {
    return prisma.newsArticle.findMany({
      where: { category },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: { id: true, title: true, publishedAt: true, sentiment: true },
    });
  }
}

export const worldNewsService = new WorldNewsService();
export default worldNewsService;
