import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

const WORLD_NEWS_API_KEY = process.env.WORLD_NEWS_API_KEY;

interface NewsArticle {
  id: number;
  title: string;
  text: string;
  summary?: string;
  url: string;
  image?: string;
  publish_date: string;
  sentiment?: number;
}

async function fetchGoldNews(query: string = 'gold price', limit: number = 10): Promise<NewsArticle[]> {
  const url = new URL('https://api.worldnewsapi.com/search-news');
  url.searchParams.set('api-key', WORLD_NEWS_API_KEY || '');
  url.searchParams.set('text', query);
  url.searchParams.set('language', 'en');
  url.searchParams.set('number', limit.toString());
  url.searchParams.set('sort', 'publish-time');
  url.searchParams.set('sort-direction', 'desc');
  
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`World News API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.news || [];
}

function quantifyNewsImpact(article: NewsArticle): number {
  const text = `${article.title} ${article.text}`.toLowerCase();
  
  let score = 0;
  
  // Bullish keywords
  const bullishTerms = [
    { term: 'rally', weight: 15 },
    { term: 'surge', weight: 20 },
    { term: 'soar', weight: 20 },
    { term: 'record high', weight: 25 },
    { term: 'all-time high', weight: 30 },
    { term: 'safe haven', weight: 15 },
    { term: 'inflation', weight: 10 },
    { term: 'uncertainty', weight: 10 },
    { term: 'crisis', weight: 15 },
    { term: 'war', weight: 15 },
    { term: 'geopolitical', weight: 10 },
    { term: 'fed cut', weight: 15 },
    { term: 'rate cut', weight: 15 },
    { term: 'dovish', weight: 12 },
    { term: 'central bank buying', weight: 20 },
    { term: 'demand', weight: 8 },
    { term: 'bullish', weight: 15 },
  ];
  
  // Bearish keywords
  const bearishTerms = [
    { term: 'fall', weight: -10 },
    { term: 'drop', weight: -12 },
    { term: 'plunge', weight: -20 },
    { term: 'decline', weight: -10 },
    { term: 'rate hike', weight: -15 },
    { term: 'fed raise', weight: -15 },
    { term: 'hawkish', weight: -12 },
    { term: 'strong dollar', weight: -10 },
    { term: 'usd strength', weight: -10 },
    { term: 'bearish', weight: -15 },
    { term: 'selloff', weight: -15 },
    { term: 'sell-off', weight: -15 },
  ];
  
  for (const { term, weight } of [...bullishTerms, ...bearishTerms]) {
    if (text.includes(term)) {
      score += weight;
    }
  }
  
  // Use API sentiment if available
  if (article.sentiment !== undefined) {
    score += article.sentiment * 30;  // -1 to 1 scaled
  }
  
  // Clamp to -100 to 100
  return Math.max(-100, Math.min(100, score));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'fetch';
    const query = searchParams.get('query') || 'gold price';
    const limit = parseInt(searchParams.get('limit') || '10');
    
    if (action === 'fetch') {
      // Fetch fresh news from API
      const articles = await fetchGoldNews(query, limit);
      
      // Get latest gold price for linking
      const latestPrice = await prisma.goldPrice.findFirst({
        orderBy: { date: 'desc' },
      });
      
      if (!latestPrice) {
        return NextResponse.json({ error: 'No gold prices in database' }, { status: 400 });
      }
      
      const results = [];
      
      for (const article of articles) {
        const externalId = String(article.id);
        
        // Store article
        const stored = await prisma.newsArticle.upsert({
          where: { externalId },
          update: {
            title: article.title,
            text: article.text,
            summary: article.summary,
            sentiment: article.sentiment,
          },
          create: {
            externalId,
            title: article.title,
            text: article.text,
            summary: article.summary,
            url: article.url,
            publishedAt: new Date(article.publish_date),
            source: 'worldnews',
            sentiment: article.sentiment,
          },
        });
        
        // Quantify impact
        const impactScore = quantifyNewsImpact(article);
        
        // Create quantification linked to latest price
        await prisma.newsQuantification.upsert({
          where: {
            newsArticleId_goldPriceId: {
              newsArticleId: stored.id,
              goldPriceId: latestPrice.id,
            },
          },
          update: { impactScore, confidenceScore: 0.5 },
          create: {
            newsArticleId: stored.id,
            goldPriceId: latestPrice.id,
            impactScore,
            confidenceScore: 0.5,
          },
        });
        
        results.push({
          ...stored,
          impactScore,
        });
      }
      
      return NextResponse.json({
        success: true,
        count: results.length,
        articles: results,
      });
    }
    
    if (action === 'stored') {
      // Get stored news with quantifications
      const articles = await prisma.newsArticle.findMany({
        include: { quantifications: true },
        orderBy: { publishedAt: 'desc' },
        take: limit,
      });
      
      return NextResponse.json({
        success: true,
        count: articles.length,
        articles,
      });
    }
    
    if (action === 'unreviewed') {
      // Get articles needing human review
      const quantifications = await prisma.newsQuantification.findMany({
        where: { humanVerified: false },
        include: { newsArticle: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      
      return NextResponse.json({
        success: true,
        count: quantifications.length,
        items: quantifications,
      });
    }
    
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('News API error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { quantificationId, humanScore, verified, feedback } = body;
    
    if (!quantificationId) {
      return NextResponse.json({ error: 'quantificationId required' }, { status: 400 });
    }
    
    // Update human feedback
    const updated = await prisma.newsQuantification.update({
      where: { id: quantificationId },
      data: {
        humanScore: humanScore !== undefined ? humanScore : undefined,
        humanVerified: verified !== undefined ? verified : true,
        humanFeedback: feedback,
        verifiedAt: new Date(),
      },
    });
    
    return NextResponse.json({
      success: true,
      quantification: updated,
    });
  } catch (error) {
    console.error('News feedback error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
