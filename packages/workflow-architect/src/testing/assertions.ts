/**
 * Assertion Library for Workflow Testing
 * Provides comprehensive assertion methods for validating workflow outputs
 */

import { Assertion, AssertionResult, AssertionError } from './types.js';

/**
 * Evaluates JSONPath expressions to extract values from nested data
 */
export class JSONPathEvaluator {
  /**
   * Evaluate a JSONPath expression against data
   * Simple implementation supporting basic paths like "$.data.items[0].name"
   */
  static evaluate(path: string, data: unknown): unknown {
    if (!path.startsWith('$')) {
      throw new Error('JSONPath must start with $');
    }

    // Remove leading $
    const normalizedPath = path.substring(1);

    if (!normalizedPath || normalizedPath === '.') {
      return data;
    }

    // Split path into segments
    const segments = normalizedPath
      .split('.')
      .filter(s => s.length > 0)
      .flatMap(segment => {
        // Handle array notation like "items[0]"
        const arrayMatch = segment.match(/^([^[]+)\[(\d+)\]$/);
        if (arrayMatch) {
          return [arrayMatch[1], parseInt(arrayMatch[2], 10)];
        }
        return segment;
      });

    let current: any = data;

    for (const segment of segments) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (typeof segment === 'number') {
        if (!Array.isArray(current)) {
          return undefined;
        }
        current = current[segment];
      } else {
        if (typeof current !== 'object') {
          return undefined;
        }
        current = current[segment];
      }
    }

    return current;
  }
}

/**
 * Main assertion library for workflow testing
 */
export class AssertionLibrary {
  /**
   * Execute an assertion and return the result
   */
  static async execute(
    assertion: Assertion,
    data: unknown
  ): Promise<AssertionResult> {
    try {
      const actual = JSONPathEvaluator.evaluate(assertion.target, data);

      switch (assertion.type) {
        case 'equals':
          return this.equals(assertion, actual);
        case 'contains':
          return this.contains(assertion, actual);
        case 'matches':
          return this.matches(assertion, actual);
        case 'exists':
          return this.exists(assertion, actual);
        case 'type':
          return this.isType(assertion, actual);
        case 'length':
          return this.hasLength(assertion, actual);
        case 'range':
          return this.inRange(assertion, actual);
        case 'custom':
          return this.custom(assertion, actual);
        default:
          throw new Error(`Unknown assertion type: ${assertion.type}`);
      }
    } catch (error) {
      return {
        assertionId: assertion.id,
        passed: false,
        message: error instanceof Error ? error.message : 'Assertion failed',
      };
    }
  }

  /**
   * Assert that actual equals expected
   */
  private static equals(assertion: Assertion, actual: unknown): AssertionResult {
    const passed = this.deepEqual(actual, assertion.expected);

    return {
      assertionId: assertion.id,
      passed,
      actual,
      expected: assertion.expected,
      message: passed
        ? assertion.message ?? 'Values are equal'
        : assertion.message ?? `Expected ${JSON.stringify(assertion.expected)} but got ${JSON.stringify(actual)}`,
    };
  }

  /**
   * Assert that actual contains expected (for strings, arrays, objects)
   */
  private static contains(assertion: Assertion, actual: unknown): AssertionResult {
    let passed = false;

    if (typeof actual === 'string' && typeof assertion.expected === 'string') {
      passed = actual.includes(assertion.expected);
    } else if (Array.isArray(actual)) {
      passed = actual.some(item => this.deepEqual(item, assertion.expected));
    } else if (typeof actual === 'object' && actual !== null && typeof assertion.expected === 'object') {
      // Check if all expected properties exist in actual
      passed = this.objectContains(actual, assertion.expected as Record<string, unknown>);
    }

    return {
      assertionId: assertion.id,
      passed,
      actual,
      expected: assertion.expected,
      message: passed
        ? assertion.message ?? 'Contains expected value'
        : assertion.message ?? `Expected to contain ${JSON.stringify(assertion.expected)}`,
    };
  }

  /**
   * Assert that actual matches a regex pattern
   */
  private static matches(assertion: Assertion, actual: unknown): AssertionResult {
    if (typeof actual !== 'string') {
      return {
        assertionId: assertion.id,
        passed: false,
        actual,
        expected: assertion.expected,
        message: 'Value must be a string for regex matching',
      };
    }

    const pattern = new RegExp(assertion.expected as string);
    const passed = pattern.test(actual);

    return {
      assertionId: assertion.id,
      passed,
      actual,
      expected: assertion.expected,
      message: passed
        ? assertion.message ?? 'Matches pattern'
        : assertion.message ?? `Expected to match pattern ${assertion.expected}`,
    };
  }

  /**
   * Assert that value exists (not null or undefined)
   */
  private static exists(assertion: Assertion, actual: unknown): AssertionResult {
    const passed = actual !== null && actual !== undefined;

    return {
      assertionId: assertion.id,
      passed,
      actual,
      message: passed
        ? assertion.message ?? 'Value exists'
        : assertion.message ?? 'Expected value to exist',
    };
  }

  /**
   * Assert that value is of expected type
   */
  private static isType(assertion: Assertion, actual: unknown): AssertionResult {
    const expectedType = assertion.expected as string;
    let actualType = typeof actual;

    // Handle special cases
    if (actual === null) {
      actualType = 'null';
    } else if (Array.isArray(actual)) {
      actualType = 'array';
    }

    const passed = actualType === expectedType;

    return {
      assertionId: assertion.id,
      passed,
      actual: actualType,
      expected: expectedType,
      message: passed
        ? assertion.message ?? `Value is of type ${expectedType}`
        : assertion.message ?? `Expected type ${expectedType} but got ${actualType}`,
    };
  }

  /**
   * Assert that value has expected length (for strings, arrays)
   */
  private static hasLength(assertion: Assertion, actual: unknown): AssertionResult {
    let actualLength: number | undefined;

    if (typeof actual === 'string' || Array.isArray(actual)) {
      actualLength = actual.length;
    } else if (typeof actual === 'object' && actual !== null) {
      actualLength = Object.keys(actual).length;
    }

    const expectedLength = assertion.expected as number;
    const passed = actualLength === expectedLength;

    return {
      assertionId: assertion.id,
      passed,
      actual: actualLength,
      expected: expectedLength,
      message: passed
        ? assertion.message ?? `Length is ${expectedLength}`
        : assertion.message ?? `Expected length ${expectedLength} but got ${actualLength}`,
    };
  }

  /**
   * Assert that value is within expected range
   */
  private static inRange(assertion: Assertion, actual: unknown): AssertionResult {
    if (typeof actual !== 'number') {
      return {
        assertionId: assertion.id,
        passed: false,
        actual,
        expected: assertion.expected,
        message: 'Value must be a number for range comparison',
      };
    }

    const [min, max] = assertion.expected as [number, number];
    const passed = actual >= min && actual <= max;

    return {
      assertionId: assertion.id,
      passed,
      actual,
      expected: assertion.expected,
      message: passed
        ? assertion.message ?? `Value is in range [${min}, ${max}]`
        : assertion.message ?? `Expected value to be in range [${min}, ${max}] but got ${actual}`,
    };
  }

  /**
   * Execute custom assertion function
   */
  private static custom(assertion: Assertion, actual: unknown): AssertionResult {
    try {
      // Custom assertions should provide a function as expected
      const customFn = assertion.expected as (value: unknown) => boolean;
      const passed = customFn(actual);

      return {
        assertionId: assertion.id,
        passed,
        actual,
        message: passed
          ? assertion.message ?? 'Custom assertion passed'
          : assertion.message ?? 'Custom assertion failed',
      };
    } catch (error) {
      return {
        assertionId: assertion.id,
        passed: false,
        actual,
        message: error instanceof Error ? error.message : 'Custom assertion error',
      };
    }
  }

  /**
   * Deep equality check
   */
  private static deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (a === undefined || b === undefined) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((val, idx) => this.deepEqual(val, b[idx]));
      }

      if (Array.isArray(a) || Array.isArray(b)) return false;

      const keysA = Object.keys(a as object);
      const keysB = Object.keys(b as object);

      if (keysA.length !== keysB.length) return false;

      return keysA.every(key =>
        this.deepEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key]
        )
      );
    }

    return false;
  }

  /**
   * Check if object contains all properties from expected
   */
  private static objectContains(
    actual: unknown,
    expected: Record<string, unknown>
  ): boolean {
    if (typeof actual !== 'object' || actual === null) {
      return false;
    }

    const actualObj = actual as Record<string, unknown>;

    return Object.entries(expected).every(([key, value]) => {
      if (!(key in actualObj)) return false;

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return this.objectContains(actualObj[key], value as Record<string, unknown>);
      }

      return this.deepEqual(actualObj[key], value);
    });
  }
}

/**
 * Fluent assertion API for more readable tests
 */
export class Expect {
  constructor(private actual: unknown, private path: string = '$') {}

  /**
   * Assert equality
   */
  toEqual(expected: unknown): AssertionResult {
    return AssertionLibrary['equals'](
      {
        id: crypto.randomUUID(),
        type: 'equals',
        target: this.path,
        expected,
      },
      this.actual
    );
  }

  /**
   * Assert contains
   */
  toContain(expected: unknown): AssertionResult {
    return AssertionLibrary['contains'](
      {
        id: crypto.randomUUID(),
        type: 'contains',
        target: this.path,
        expected,
      },
      this.actual
    );
  }

  /**
   * Assert pattern match
   */
  toMatch(pattern: string | RegExp): AssertionResult {
    return AssertionLibrary['matches'](
      {
        id: crypto.randomUUID(),
        type: 'matches',
        target: this.path,
        expected: pattern instanceof RegExp ? pattern.source : pattern,
      },
      this.actual
    );
  }

  /**
   * Assert existence
   */
  toExist(): AssertionResult {
    return AssertionLibrary['exists'](
      {
        id: crypto.randomUUID(),
        type: 'exists',
        target: this.path,
      },
      this.actual
    );
  }

  /**
   * Assert type
   */
  toBeType(type: string): AssertionResult {
    return AssertionLibrary['isType'](
      {
        id: crypto.randomUUID(),
        type: 'type',
        target: this.path,
        expected: type,
      },
      this.actual
    );
  }

  /**
   * Assert length
   */
  toHaveLength(length: number): AssertionResult {
    return AssertionLibrary['hasLength'](
      {
        id: crypto.randomUUID(),
        type: 'length',
        target: this.path,
        expected: length,
      },
      this.actual
    );
  }

  /**
   * Assert range
   */
  toBeInRange(min: number, max: number): AssertionResult {
    return AssertionLibrary['inRange'](
      {
        id: crypto.randomUUID(),
        type: 'range',
        target: this.path,
        expected: [min, max],
      },
      this.actual
    );
  }
}

/**
 * Create an expectation for a value
 */
export function expect(actual: unknown, path: string = '$'): Expect {
  return new Expect(actual, path);
}
