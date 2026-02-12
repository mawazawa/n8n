/**
 * CronParser - Parse and validate cron expressions
 * Supports both standard 5-field and extended 6-field (with seconds) cron syntax
 */

import type { CronParseResult, CronFields } from './types.js';

interface CronRange {
  min: number;
  max: number;
  name: string;
}

/**
 * Cron field ranges and names
 */
const CRON_RANGES: Record<string, CronRange> = {
  second: { min: 0, max: 59, name: 'second' },
  minute: { min: 0, max: 59, name: 'minute' },
  hour: { min: 0, max: 23, name: 'hour' },
  dayOfMonth: { min: 1, max: 31, name: 'day of month' },
  month: { min: 1, max: 12, name: 'month' },
  dayOfWeek: { min: 0, max: 7, name: 'day of week' }, // 0 and 7 both represent Sunday
};

/**
 * Month name mappings
 */
const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * Day name mappings
 */
const DAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

export class CronParser {
  /**
   * Parse a cron expression
   */
  parse(expression: string): CronParseResult {
    try {
      const trimmed = expression.trim();
      if (!trimmed) {
        return {
          valid: false,
          fields: this.emptyFields(),
          description: '',
          error: 'Cron expression cannot be empty',
        };
      }

      const parts = trimmed.split(/\s+/);

      // Determine if this is a 5-field or 6-field expression
      const has6Fields = parts.length === 6;
      const has5Fields = parts.length === 5;

      if (!has5Fields && !has6Fields) {
        return {
          valid: false,
          fields: this.emptyFields(),
          description: '',
          error: `Invalid cron expression: expected 5 or 6 fields, got ${parts.length}`,
        };
      }

      const fields = has6Fields ? this.parse6Fields(parts) : this.parse5Fields(parts);

      // Validate each field
      const validation = this.validateFields(fields);
      if (!validation.valid) {
        return {
          valid: false,
          fields,
          description: '',
          error: validation.error,
        };
      }

      const description = this.describeSchedule(fields);

      return {
        valid: true,
        fields,
        description,
      };
    } catch (error) {
      return {
        valid: false,
        fields: this.emptyFields(),
        description: '',
        error: error instanceof Error ? error.message : 'Unknown parsing error',
      };
    }
  }

  /**
   * Validate a cron expression
   */
  validate(expression: string): boolean {
    return this.parse(expression).valid;
  }

  /**
   * Get the next N run times for a cron expression
   */
  getNextRuns(expression: string, from: number = Date.now(), count: number = 5): number[] {
    const parseResult = this.parse(expression);
    if (!parseResult.valid) {
      throw new Error(`Invalid cron expression: ${parseResult.error}`);
    }

    const runs: number[] = [];
    let current = new Date(from);

    // Limit iterations to prevent infinite loops
    const maxIterations = 1000;
    let iterations = 0;

    while (runs.length < count && iterations < maxIterations) {
      current = this.getNextRun(parseResult.fields, current);
      runs.push(current.getTime());
      iterations++;
    }

    return runs;
  }

  /**
   * Get the next single run time
   */
  getNextRunTime(expression: string, from: number = Date.now()): number {
    const runs = this.getNextRuns(expression, from, 1);
    return runs[0];
  }

  /**
   * Parse 5-field cron expression (minute hour day month weekday)
   */
  private parse5Fields(parts: string[]): CronFields {
    return {
      minute: parts[0],
      hour: parts[1],
      dayOfMonth: parts[2],
      month: parts[3],
      dayOfWeek: parts[4],
    };
  }

  /**
   * Parse 6-field cron expression (second minute hour day month weekday)
   */
  private parse6Fields(parts: string[]): CronFields {
    return {
      second: parts[0],
      minute: parts[1],
      hour: parts[2],
      dayOfMonth: parts[3],
      month: parts[4],
      dayOfWeek: parts[5],
    };
  }

  /**
   * Validate cron fields
   */
  private validateFields(fields: CronFields): { valid: boolean; error?: string } {
    const fieldsToValidate: Array<[keyof CronFields, string]> = [
      ['minute', fields.minute],
      ['hour', fields.hour],
      ['dayOfMonth', fields.dayOfMonth],
      ['month', fields.month],
      ['dayOfWeek', fields.dayOfWeek],
    ];

    if (fields.second) {
      fieldsToValidate.unshift(['second', fields.second]);
    }

    for (const [fieldName, fieldValue] of fieldsToValidate) {
      const range = CRON_RANGES[fieldName];
      const validation = this.validateField(fieldValue, range);
      if (!validation.valid) {
        return { valid: false, error: `Invalid ${range.name}: ${validation.error}` };
      }
    }

    return { valid: true };
  }

  /**
   * Validate a single cron field
   */
  private validateField(
    value: string,
    range: CronRange,
  ): { valid: boolean; error?: string } {
    // Handle wildcards
    if (value === '*' || value === '?') {
      return { valid: true };
    }

    // Handle ranges (e.g., "1-5")
    if (value.includes('-')) {
      const [start, end] = value.split('-');
      const startNum = this.parseValue(start, range);
      const endNum = this.parseValue(end, range);

      if (startNum === null || endNum === null) {
        return { valid: false, error: 'Invalid range values' };
      }

      if (startNum < range.min || endNum > range.max || startNum > endNum) {
        return {
          valid: false,
          error: `Range must be between ${range.min}-${range.max} and start <= end`,
        };
      }

      return { valid: true };
    }

    // Handle lists (e.g., "1,3,5")
    if (value.includes(',')) {
      const parts = value.split(',');
      for (const part of parts) {
        const validation = this.validateField(part.trim(), range);
        if (!validation.valid) {
          return validation;
        }
      }
      return { valid: true };
    }

    // Handle steps (e.g., "*/5" or "1-10/2")
    if (value.includes('/')) {
      const [rangeOrWildcard, step] = value.split('/');
      const stepNum = parseInt(step, 10);

      if (isNaN(stepNum) || stepNum <= 0) {
        return { valid: false, error: 'Step value must be a positive integer' };
      }

      if (rangeOrWildcard !== '*') {
        const validation = this.validateField(rangeOrWildcard, range);
        if (!validation.valid) {
          return validation;
        }
      }

      return { valid: true };
    }

    // Handle single values
    const num = this.parseValue(value, range);
    if (num === null || num < range.min || num > range.max) {
      return {
        valid: false,
        error: `Value must be between ${range.min} and ${range.max}`,
      };
    }

    return { valid: true };
  }

  /**
   * Parse a value to number, handling named values (months/days)
   */
  private parseValue(value: string, range: CronRange): number | null {
    const lower = value.toLowerCase();

    // Handle month names
    if (range.name === 'month' && MONTH_NAMES[lower] !== undefined) {
      return MONTH_NAMES[lower];
    }

    // Handle day names
    if (range.name === 'day of week' && DAY_NAMES[lower] !== undefined) {
      return DAY_NAMES[lower];
    }

    const num = parseInt(value, 10);
    return isNaN(num) ? null : num;
  }

  /**
   * Generate human-readable description of the schedule
   */
  private describeSchedule(fields: CronFields): string {
    const parts: string[] = [];

    // Frequency
    if (fields.minute === '*' && fields.hour === '*') {
      parts.push('Every minute');
    } else if (fields.minute.includes('/')) {
      const step = fields.minute.split('/')[1];
      parts.push(`Every ${step} minutes`);
    } else if (fields.minute === '0' && fields.hour.includes('/')) {
      const step = fields.hour.split('/')[1];
      parts.push(`Every ${step} hours`);
    } else {
      parts.push('At');
      if (fields.hour !== '*') {
        parts.push(this.describeField(fields.hour, 'hour'));
      }
      if (fields.minute !== '*') {
        parts.push(this.describeField(fields.minute, 'minute'));
      }
    }

    // Day specifications
    if (fields.dayOfMonth !== '*' && fields.dayOfMonth !== '?') {
      parts.push('on day');
      parts.push(this.describeField(fields.dayOfMonth, 'day'));
    }

    if (fields.dayOfWeek !== '*' && fields.dayOfWeek !== '?') {
      parts.push('on');
      parts.push(this.describeDayOfWeek(fields.dayOfWeek));
    }

    // Month
    if (fields.month !== '*') {
      parts.push('in');
      parts.push(this.describeMonth(fields.month));
    }

    return parts.join(' ');
  }

  /**
   * Describe a generic field
   */
  private describeField(value: string, type: string): string {
    if (value === '*') return 'every ' + type;
    if (value.includes(',')) return value;
    if (value.includes('-')) return value;
    if (value.includes('/')) {
      const [, step] = value.split('/');
      return `every ${step} ${type}s`;
    }
    return value;
  }

  /**
   * Describe day of week field
   */
  private describeDayOfWeek(value: string): string {
    const dayMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    if (value.includes(',')) {
      const days = value.split(',').map((d) => {
        const num = parseInt(d.trim(), 10);
        return dayMap[num] || d;
      });
      return days.join(', ');
    }

    const num = parseInt(value, 10);
    return dayMap[num] || value;
  }

  /**
   * Describe month field
   */
  private describeMonth(value: string): string {
    const monthMap = [
      '',
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    if (value.includes(',')) {
      const months = value.split(',').map((m) => {
        const num = parseInt(m.trim(), 10);
        return monthMap[num] || m;
      });
      return months.join(', ');
    }

    const num = parseInt(value, 10);
    return monthMap[num] || value;
  }

  /**
   * Get the next run time based on cron fields
   */
  private getNextRun(fields: CronFields, from: Date): Date {
    const next = new Date(from);
    next.setMilliseconds(0);

    // If we have seconds field, reset seconds, otherwise set to 0
    if (fields.second) {
      next.setSeconds(next.getSeconds() + 1);
    } else {
      next.setSeconds(0);
      next.setMinutes(next.getMinutes() + 1);
    }

    // Find next matching time (max 4 years to prevent infinite loop)
    const maxDate = new Date(from);
    maxDate.setFullYear(maxDate.getFullYear() + 4);

    while (next < maxDate) {
      if (this.matchesSchedule(next, fields)) {
        return next;
      }

      // Increment by smallest unit
      if (fields.second) {
        next.setSeconds(next.getSeconds() + 1);
      } else {
        next.setMinutes(next.getMinutes() + 1);
      }
    }

    throw new Error('Could not find next run time within 4 years');
  }

  /**
   * Check if a date matches the cron schedule
   */
  private matchesSchedule(date: Date, fields: CronFields): boolean {
    const checks = [
      fields.second ? this.matches(date.getSeconds(), fields.second, CRON_RANGES.second) : true,
      this.matches(date.getMinutes(), fields.minute, CRON_RANGES.minute),
      this.matches(date.getHours(), fields.hour, CRON_RANGES.hour),
      this.matches(date.getDate(), fields.dayOfMonth, CRON_RANGES.dayOfMonth),
      this.matches(date.getMonth() + 1, fields.month, CRON_RANGES.month),
      this.matches(date.getDay(), fields.dayOfWeek, CRON_RANGES.dayOfWeek),
    ];

    return checks.every((check) => check);
  }

  /**
   * Check if a value matches a cron field
   */
  private matches(value: number, field: string, range: CronRange): boolean {
    // Wildcard or question mark matches everything
    if (field === '*' || field === '?') {
      return true;
    }

    // List (e.g., "1,3,5")
    if (field.includes(',')) {
      const values = field.split(',').map((v) => this.parseValue(v.trim(), range));
      return values.includes(value);
    }

    // Range (e.g., "1-5")
    if (field.includes('-') && !field.includes('/')) {
      const [start, end] = field.split('-').map((v) => this.parseValue(v, range));
      return start !== null && end !== null && value >= start && value <= end;
    }

    // Step (e.g., "*/5" or "1-10/2")
    if (field.includes('/')) {
      const [rangeOrWildcard, stepStr] = field.split('/');
      const step = parseInt(stepStr, 10);

      if (rangeOrWildcard === '*') {
        return value % step === range.min % step;
      }

      if (rangeOrWildcard.includes('-')) {
        const [start, end] = rangeOrWildcard.split('-').map((v) => this.parseValue(v, range));
        if (start === null || end === null) return false;
        return value >= start && value <= end && (value - start) % step === 0;
      }
    }

    // Single value
    const parsed = this.parseValue(field, range);
    return parsed === value;
  }

  /**
   * Get empty fields object
   */
  private emptyFields(): CronFields {
    return {
      minute: '',
      hour: '',
      dayOfMonth: '',
      month: '',
      dayOfWeek: '',
    };
  }
}
