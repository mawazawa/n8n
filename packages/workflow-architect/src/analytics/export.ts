/**
 * Data Exporter
 * Export analytics data with streaming support for large datasets
 */

import { createWriteStream, type WriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { ExportOptions, Report, Metric, AnalyticsEvent } from './types.js';

interface ExportProgress {
  total: number;
  exported: number;
  percentage: number;
  startTime: number;
  estimatedTimeRemaining: number;
}

type ExportData = Metric[] | AnalyticsEvent[] | Report[] | Record<string, unknown>[];

/**
 * DataExporter - Export analytics data to various formats
 *
 * Features:
 * - Export to JSON and CSV formats
 * - Streaming export for large datasets (>100k records)
 * - Date range filtering
 * - Custom field selection
 * - Progress tracking for long exports
 * - Memory-efficient processing
 */
export class DataExporter {
  private exportDir: string;

  constructor(exportDir = './exports') {
    this.exportDir = exportDir;
  }

  /**
   * Export data to CSV format
   */
  async exportToCSV(data: ExportData, filename: string, options?: Partial<ExportOptions>): Promise<string> {
    const fullPath = this.getFullPath(filename, 'csv');
    await this.ensureDirectoryExists(fullPath);

    if (options?.streaming && data.length > 100000) {
      return this.streamToCSV(data, fullPath, options);
    }

    return this.directExportToCSV(data, fullPath, options);
  }

  /**
   * Export data to JSON format
   */
  async exportToJSON(data: ExportData, filename: string, options?: Partial<ExportOptions>): Promise<string> {
    const fullPath = this.getFullPath(filename, 'json');
    await this.ensureDirectoryExists(fullPath);

    if (options?.streaming && data.length > 100000) {
      return this.streamToJSON(data, fullPath, options);
    }

    return this.directExportToJSON(data, fullPath, options);
  }

  /**
   * Export report to file
   */
  async exportReport(report: Report, format: 'json' | 'csv' = 'json'): Promise<string> {
    const filename = `report_${report.id}_${Date.now()}`;

    if (format === 'json') {
      return this.exportToJSON([report], filename);
    }

    // Flatten report data for CSV
    const flattenedData = this.flattenReportData(report);
    return this.exportToCSV(flattenedData, filename);
  }

  /**
   * Export with date range filtering
   */
  async exportWithDateRange(
    data: ExportData,
    filename: string,
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' = 'json',
  ): Promise<string> {
    const filtered = this.filterByDateRange(data, startDate, endDate);

    const options: Partial<ExportOptions> = {
      format,
      filename,
      dateRange: { start: startDate, end: endDate },
      streaming: filtered.length > 100000,
    };

    if (format === 'json') {
      return this.exportToJSON(filtered, filename, options);
    }
    return this.exportToCSV(filtered, filename, options);
  }

  /**
   * Export with custom field selection
   */
  async exportWithFields(
    data: ExportData,
    filename: string,
    fields: string[],
    format: 'json' | 'csv' = 'json',
  ): Promise<string> {
    const selected = this.selectFields(data, fields);

    const options: Partial<ExportOptions> = {
      format,
      filename,
      fields,
    };

    if (format === 'json') {
      return this.exportToJSON(selected, filename, options);
    }
    return this.exportToCSV(selected, filename, options);
  }

  /**
   * Get export progress (for streaming exports)
   */
  getProgress(): ExportProgress | null {
    // This would be tracked in a streaming context
    return null;
  }

  /**
   * Direct (non-streaming) CSV export
   */
  private async directExportToCSV(
    data: ExportData,
    fullPath: string,
    options?: Partial<ExportOptions>,
  ): Promise<string> {
    if (data.length === 0) {
      throw new Error('No data to export');
    }

    const fields = options?.fields || this.extractFields(data[0]);
    const rows: string[] = [];

    // Add header
    rows.push(fields.map(f => this.escapeCsvValue(f)).join(','));

    // Add data rows
    for (const item of data) {
      const row = fields.map(field => {
        const value = this.getNestedValue(item, field);
        return this.escapeCsvValue(value);
      });
      rows.push(row.join(','));
    }

    const csv = rows.join('\n');
    const { writeFile } = await import('fs/promises');
    await writeFile(fullPath, csv, 'utf-8');

    return fullPath;
  }

  /**
   * Streaming CSV export for large datasets
   */
  private async streamToCSV(
    data: ExportData,
    fullPath: string,
    options?: Partial<ExportOptions>,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = createWriteStream(fullPath, { encoding: 'utf-8' });
      const fields = options?.fields || this.extractFields(data[0]);

      // Write header
      stream.write(fields.map(f => this.escapeCsvValue(f)).join(',') + '\n');

      // Stream data in chunks
      const chunkSize = 10000;
      let index = 0;

      const writeChunk = () => {
        let canContinue = true;

        while (index < data.length && canContinue) {
          const endIndex = Math.min(index + chunkSize, data.length);
          const chunk = data.slice(index, endIndex);

          for (const item of chunk) {
            const row = fields.map(field => {
              const value = this.getNestedValue(item, field);
              return this.escapeCsvValue(value);
            });

            canContinue = stream.write(row.join(',') + '\n');
          }

          index = endIndex;
        }

        if (index < data.length) {
          stream.once('drain', writeChunk);
        } else {
          stream.end();
        }
      };

      stream.on('finish', () => resolve(fullPath));
      stream.on('error', reject);

      writeChunk();
    });
  }

  /**
   * Direct (non-streaming) JSON export
   */
  private async directExportToJSON(
    data: ExportData,
    fullPath: string,
    options?: Partial<ExportOptions>,
  ): Promise<string> {
    let exportData = data;

    if (options?.fields) {
      exportData = this.selectFields(data, options.fields);
    }

    const json = JSON.stringify(exportData, null, 2);
    const { writeFile } = await import('fs/promises');
    await writeFile(fullPath, json, 'utf-8');

    return fullPath;
  }

  /**
   * Streaming JSON export for large datasets
   */
  private async streamToJSON(
    data: ExportData,
    fullPath: string,
    options?: Partial<ExportOptions>,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = createWriteStream(fullPath, { encoding: 'utf-8' });

      stream.write('[\n');

      const chunkSize = 10000;
      let index = 0;

      const writeChunk = () => {
        let canContinue = true;

        while (index < data.length && canContinue) {
          const endIndex = Math.min(index + chunkSize, data.length);
          const chunk = data.slice(index, endIndex);

          for (let i = 0; i < chunk.length; i++) {
            const item = chunk[i];
            let itemData: any = item;
            if (options?.fields) {
              const selected: Record<string, unknown> = {};
              for (const field of options.fields) {
                const value = this.getNestedValue(item, field);
                selected[field] = value;
              }
              itemData = selected;
            }
            const json = JSON.stringify(itemData, null, 2);
            const isLast = index + i === data.length - 1;

            canContinue = stream.write('  ' + json + (isLast ? '\n' : ',\n'));
          }

          index = endIndex;
        }

        if (index < data.length) {
          stream.once('drain', writeChunk);
        } else {
          stream.write(']');
          stream.end();
        }
      };

      stream.on('finish', () => resolve(fullPath));
      stream.on('error', reject);

      writeChunk();
    });
  }

  /**
   * Filter data by date range
   */
  private filterByDateRange(data: ExportData, startDate: Date, endDate: Date): ExportData {
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();

    return data.filter((item: any) => {
      const timestamp = item.timestamp || item.generatedAt;
      if (!timestamp) return true;

      const itemTime = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
      return itemTime >= startMs && itemTime <= endMs;
    }) as ExportData;
  }

  /**
   * Select specific fields from data
   */
  private selectFields(data: ExportData, fields: string[]): Record<string, unknown>[] {
    return data.map(item => {
      const selected: Record<string, unknown> = {};

      for (const field of fields) {
        const value = this.getNestedValue(item, field);
        selected[field] = value;
      }

      return selected;
    });
  }

  /**
   * Extract field names from an object
   */
  private extractFields(item: any): string[] {
    const fields: string[] = [];

    const extract = (obj: any, prefix = '') => {
      for (const key in obj) {
        const value = obj[key];
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          // Don't recursively expand objects for now, treat as single field
          fields.push(fullKey);
        } else {
          fields.push(fullKey);
        }
      }
    };

    extract(item);
    return fields;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let value = obj;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * Escape CSV value
   */
  private escapeCsvValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    let str = typeof value === 'object' ? JSON.stringify(value) : String(value);

    // Escape quotes and wrap in quotes if necessary
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }

    return str;
  }

  /**
   * Flatten report data for CSV export
   */
  private flattenReportData(report: Report): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];

    // Create a row for each metric
    for (const metric of report.metrics) {
      const metricData = (report.data.metrics as any)?.[metric];

      rows.push({
        report_id: report.id,
        report_name: report.name,
        metric: metric,
        generated_at: report.generatedAt,
        ...metricData,
      });
    }

    return rows;
  }

  /**
   * Get full file path
   */
  private getFullPath(filename: string, extension: string): string {
    const cleanFilename = filename.replace(/\.[^.]+$/, '');
    return `${this.exportDir}/${cleanFilename}.${extension}`;
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectoryExists(filePath: string): Promise<void> {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Singleton instance for convenience
 */
let globalExporter: DataExporter | null = null;

export function getGlobalExporter(exportDir?: string): DataExporter {
  if (!globalExporter) {
    globalExporter = new DataExporter(exportDir);
  }
  return globalExporter;
}

export function setGlobalExporter(exporter: DataExporter): void {
  globalExporter = exporter;
}
