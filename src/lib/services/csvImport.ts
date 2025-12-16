/**
 * CSV Import Service
 * Imports historical gold prices from CSV files
 */

import { parse } from 'date-fns';
import prisma from '../db';

interface CsvRow {
  Date: string;
  Close: string;
  Open?: string;
  High?: string;
  Low?: string;
  Volume?: string;
}

function parseCsvDate(dateStr: string): Date {
  const normalized = dateStr.replace(/Sept/g, 'Sep');
  const formats = ['d MMM yyyy', 'dd MMM yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy'];
  
  for (const format of formats) {
    try {
      const parsed = parse(normalized, format, new Date());
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  
  throw new Error(`Unable to parse date: ${dateStr}`);
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  const rows: CsvRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row: Record<string, string> = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    rows.push(row as CsvRow);
  }
  
  return rows;
}

export class CsvImportService {
  async importFromCsvContent(content: string): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const rows = parseCsv(content);
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    
    for (const row of rows) {
      try {
        if (!row.Date || !row.Close) {
          skipped++;
          continue;
        }
        
        const date = parseCsvDate(row.Date);
        date.setHours(0, 0, 0, 0);
        
        const closePrice = parseFloat(row.Close);
        if (isNaN(closePrice)) {
          errors.push(`Invalid price for date ${row.Date}: ${row.Close}`);
          continue;
        }
        
        await prisma.goldPrice.upsert({
          where: { date },
          update: {
            closePrice,
            openPrice: row.Open ? parseFloat(row.Open) : null,
            highPrice: row.High ? parseFloat(row.High) : null,
            lowPrice: row.Low ? parseFloat(row.Low) : null,
            volume: row.Volume ? parseFloat(row.Volume) : null,
            source: 'csv',
          },
          create: {
            date,
            closePrice,
            openPrice: row.Open ? parseFloat(row.Open) : null,
            highPrice: row.High ? parseFloat(row.High) : null,
            lowPrice: row.Low ? parseFloat(row.Low) : null,
            volume: row.Volume ? parseFloat(row.Volume) : null,
            source: 'csv',
          },
        });
        
        imported++;
      } catch (error) {
        errors.push(`Error processing row ${row.Date}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return { imported, skipped, errors };
  }

  async importFromFile(filePath: string): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');
    return this.importFromCsvContent(content);
  }

  async calculateDerivedMetrics(): Promise<number> {
    const prices = await prisma.goldPrice.findMany({
      orderBy: { date: 'asc' },
    });
    
    let updated = 0;
    
    for (let i = 0; i < prices.length; i++) {
      const current = prices[i];
      const prev = i > 0 ? prices[i - 1] : null;
      
      const dailyChange = prev ? current.closePrice - prev.closePrice : null;
      const dailyChangePct = prev && prev.closePrice !== 0 
        ? ((current.closePrice - prev.closePrice) / prev.closePrice) * 100 
        : null;
      
      let volatility7d: number | null = null;
      if (i >= 7) {
        const returns7d = [];
        for (let j = i - 6; j <= i; j++) {
          if (j > 0) {
            const ret = (prices[j].closePrice - prices[j - 1].closePrice) / prices[j - 1].closePrice;
            returns7d.push(ret);
          }
        }
        if (returns7d.length > 0) {
          const mean = returns7d.reduce((a, b) => a + b, 0) / returns7d.length;
          const variance = returns7d.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns7d.length;
          volatility7d = Math.sqrt(variance) * 100;
        }
      }
      
      let volatility30d: number | null = null;
      if (i >= 30) {
        const returns30d = [];
        for (let j = i - 29; j <= i; j++) {
          if (j > 0) {
            const ret = (prices[j].closePrice - prices[j - 1].closePrice) / prices[j - 1].closePrice;
            returns30d.push(ret);
          }
        }
        if (returns30d.length > 0) {
          const mean = returns30d.reduce((a, b) => a + b, 0) / returns30d.length;
          const variance = returns30d.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns30d.length;
          volatility30d = Math.sqrt(variance) * 100;
        }
      }
      
      const sma20 = i >= 19 
        ? prices.slice(i - 19, i + 1).reduce((a, b) => a + b.closePrice, 0) / 20 
        : null;
      const sma50 = i >= 49 
        ? prices.slice(i - 49, i + 1).reduce((a, b) => a + b.closePrice, 0) / 50 
        : null;
      const sma200 = i >= 199 
        ? prices.slice(i - 199, i + 1).reduce((a, b) => a + b.closePrice, 0) / 200 
        : null;
      
      await prisma.goldPrice.update({
        where: { id: current.id },
        data: {
          dailyChange,
          dailyChangePct,
          volatility7d,
          volatility30d,
          sma20,
          sma50,
          sma200,
        },
      });
      
      updated++;
    }
    
    return updated;
  }
}

export const csvImportService = new CsvImportService();
export default csvImportService;
