/**
 * Data Inspector
 * Inspects and formats data for debugging visualization
 */

import type { InspectionResult, DataType } from './types.js';

export class DataInspector {
  private readonly MAX_STRING_LENGTH = 1000;
  private readonly MAX_ARRAY_ITEMS = 100;
  private readonly MAX_OBJECT_PROPS = 50;
  private readonly MAX_DEPTH = 10;

  /**
   * Inspect data and return formatted result
   */
  inspect(data: unknown, depth: number = 0): InspectionResult {
    const type = this.detectType(data);

    // Handle primitives
    if (this.isPrimitive(type)) {
      return this.inspectPrimitive(data, type);
    }

    // Handle complex types
    switch (type) {
      case 'array':
        return this.inspectArray(data as unknown[], depth);
      case 'object':
        return this.inspectObject(data as Record<string, unknown>, depth);
      case 'date':
        return this.inspectDate(data as Date);
      case 'regexp':
        return this.inspectRegExp(data as RegExp);
      case 'error':
        return this.inspectError(data as Error);
      case 'buffer':
        return this.inspectBuffer(data as Buffer);
      case 'json':
        return this.inspectJSON(data as string);
      case 'xml':
        return this.inspectXML(data as string);
      default:
        return this.inspectUnknown(data);
    }
  }

  /**
   * Detect the type of data
   */
  private detectType(data: unknown): DataType {
    if (data === null) return 'null';
    if (data === undefined) return 'undefined';

    const typeofData = typeof data;

    if (typeofData === 'string') {
      // Check if it's JSON
      if (this.isJSON(data as string)) return 'json';
      // Check if it's XML
      if (this.isXML(data as string)) return 'xml';
      return 'string';
    }

    if (typeofData === 'number') return 'number';
    if (typeofData === 'boolean') return 'boolean';
    if (typeofData === 'function') return 'function';

    if (Array.isArray(data)) return 'array';
    if (data instanceof Date) return 'date';
    if (data instanceof RegExp) return 'regexp';
    if (data instanceof Error) return 'error';
    if (Buffer.isBuffer(data)) return 'buffer';

    if (typeofData === 'object') return 'object';

    return 'unknown';
  }

  /**
   * Check if type is primitive
   */
  private isPrimitive(type: DataType): boolean {
    return ['string', 'number', 'boolean', 'null', 'undefined'].includes(type);
  }

  /**
   * Inspect primitive value
   */
  private inspectPrimitive(data: unknown, type: DataType): InspectionResult {
    const strValue = String(data);
    const truncated = strValue.length > this.MAX_STRING_LENGTH;
    const preview = truncated
      ? strValue.substring(0, this.MAX_STRING_LENGTH) + '...'
      : strValue;

    return {
      type,
      value: data,
      size: strValue.length,
      truncated,
      preview,
      formatted: preview,
    };
  }

  /**
   * Inspect array
   */
  private inspectArray(data: unknown[], depth: number): InspectionResult {
    const truncated = data.length > this.MAX_ARRAY_ITEMS;
    const items = truncated ? data.slice(0, this.MAX_ARRAY_ITEMS) : data;

    const children = depth < this.MAX_DEPTH
      ? items.map((item) => this.inspect(item, depth + 1))
      : [];

    const preview = `Array(${data.length})`;
    const formatted = JSON.stringify(data, null, 2);

    return {
      type: 'array',
      value: data,
      size: data.length,
      truncated,
      preview,
      formatted,
      children,
      metadata: {
        length: data.length,
        itemsShown: items.length,
      },
    };
  }

  /**
   * Inspect object
   */
  private inspectObject(data: Record<string, unknown>, depth: number): InspectionResult {
    const keys = Object.keys(data);
    const truncated = keys.length > this.MAX_OBJECT_PROPS;
    const shownKeys = truncated ? keys.slice(0, this.MAX_OBJECT_PROPS) : keys;

    const children = depth < this.MAX_DEPTH
      ? shownKeys.map((key) => ({
          ...this.inspect(data[key], depth + 1),
          metadata: { key },
        }))
      : [];

    const preview = `Object(${keys.length} properties)`;
    const formatted = JSON.stringify(data, null, 2);

    return {
      type: 'object',
      value: data,
      size: keys.length,
      truncated,
      preview,
      formatted,
      children,
      metadata: {
        keys: shownKeys,
        totalKeys: keys.length,
      },
    };
  }

  /**
   * Inspect Date
   */
  private inspectDate(data: Date): InspectionResult {
    const preview = data.toISOString();

    return {
      type: 'date',
      value: data,
      preview,
      formatted: preview,
      metadata: {
        timestamp: data.getTime(),
        utc: data.toUTCString(),
        local: data.toLocaleString(),
      },
    };
  }

  /**
   * Inspect RegExp
   */
  private inspectRegExp(data: RegExp): InspectionResult {
    const preview = data.toString();

    return {
      type: 'regexp',
      value: data,
      preview,
      formatted: preview,
      metadata: {
        source: data.source,
        flags: data.flags,
      },
    };
  }

  /**
   * Inspect Error
   */
  private inspectError(data: Error): InspectionResult {
    const preview = `${data.name}: ${data.message}`;

    return {
      type: 'error',
      value: data,
      preview,
      formatted: data.stack || preview,
      metadata: {
        name: data.name,
        message: data.message,
        stack: data.stack,
      },
    };
  }

  /**
   * Inspect Buffer
   */
  private inspectBuffer(data: Buffer): InspectionResult {
    const preview = `Buffer(${data.length} bytes)`;
    const formatted = data.toString('hex');
    const truncated = data.length > 1000;

    return {
      type: 'buffer',
      value: data,
      size: data.length,
      truncated,
      preview,
      formatted: truncated ? formatted.substring(0, 1000) + '...' : formatted,
      metadata: {
        length: data.length,
        hex: formatted,
        base64: data.toString('base64'),
      },
    };
  }

  /**
   * Inspect JSON string
   */
  private inspectJSON(data: string): InspectionResult {
    try {
      const parsed = JSON.parse(data);
      const formatted = JSON.stringify(parsed, null, 2);

      return {
        type: 'json',
        value: data,
        size: data.length,
        preview: 'JSON',
        formatted,
        metadata: {
          parsed,
        },
      };
    } catch (error) {
      return this.inspectPrimitive(data, 'string');
    }
  }

  /**
   * Inspect XML string
   */
  private inspectXML(data: string): InspectionResult {
    // Basic XML formatting (without external parser)
    const formatted = this.formatXML(data);

    return {
      type: 'xml',
      value: data,
      size: data.length,
      preview: 'XML',
      formatted,
    };
  }

  /**
   * Inspect unknown type
   */
  private inspectUnknown(data: unknown): InspectionResult {
    const preview = String(data);

    return {
      type: 'unknown',
      value: data,
      preview,
      formatted: preview,
    };
  }

  /**
   * Check if string is valid JSON
   */
  private isJSON(str: string): boolean {
    if (typeof str !== 'string') return false;
    const trimmed = str.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;

    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if string is XML
   */
  private isXML(str: string): boolean {
    if (typeof str !== 'string') return false;
    const trimmed = str.trim();
    return trimmed.startsWith('<') && trimmed.includes('</');
  }

  /**
   * Format XML with indentation
   */
  private formatXML(xml: string): string {
    let formatted = '';
    let indent = 0;
    const tab = '  ';

    xml.split(/>\s*</).forEach((node) => {
      if (node.match(/^\/\w/)) indent--;
      formatted += tab.repeat(indent) + '<' + node + '>\n';
      if (node.match(/^<?\w[^>]*[^\/]$/)) indent++;
    });

    return formatted.substring(1, formatted.length - 2);
  }

  /**
   * Get a summary of the data
   */
  getSummary(data: unknown): string {
    const type = this.detectType(data);

    switch (type) {
      case 'null':
        return 'null';
      case 'undefined':
        return 'undefined';
      case 'string':
        return `"${(data as string).substring(0, 50)}${(data as string).length > 50 ? '...' : ''}"`;
      case 'number':
      case 'boolean':
        return String(data);
      case 'array':
        return `Array(${(data as unknown[]).length})`;
      case 'object':
        return `Object(${Object.keys(data as object).length} properties)`;
      case 'date':
        return (data as Date).toISOString();
      case 'error':
        return `${(data as Error).name}: ${(data as Error).message}`;
      case 'buffer':
        return `Buffer(${(data as Buffer).length} bytes)`;
      default:
        return String(data);
    }
  }
}

/**
 * Create a data inspector instance
 */
export function createDataInspector(): DataInspector {
  return new DataInspector();
}
