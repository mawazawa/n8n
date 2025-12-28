/**
 * Input Sanitization
 * Protection against injection attacks (XSS, SQL injection, command injection)
 */

import type { Request, Response, NextFunction } from 'express';
import { SecurityError, ErrorCode, ValidationError } from '../errors/index.js';

/**
 * HTML special characters map
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

/**
 * Escape HTML to prevent XSS attacks
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"'/]/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Remove HTML tags from string
 */
export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

/**
 * Sanitize string for safe output
 */
export function sanitizeString(input: string, options?: {
  maxLength?: number;
  allowHtml?: boolean;
  trim?: boolean;
}): string {
  const { maxLength = 10000, allowHtml = false, trim = true } = options || {};

  let sanitized = input;

  // Trim whitespace
  if (trim) {
    sanitized = sanitized.trim();
  }

  // Remove HTML tags if not allowed
  if (!allowHtml) {
    sanitized = stripHtml(sanitized);
    sanitized = escapeHtml(sanitized);
  }

  // Enforce max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

/**
 * Detect potential SQL injection patterns
 */
export function detectSqlInjection(input: string): boolean {
  const sqlPatterns = [
    /(\bunion\b.*\bselect\b)/i,
    /(\bselect\b.*\bfrom\b)/i,
    /(\binsert\b.*\binto\b)/i,
    /(\bupdate\b.*\bset\b)/i,
    /(\bdelete\b.*\bfrom\b)/i,
    /(\bdrop\b.*\btable\b)/i,
    /(\bexec\b|\bexecute\b)/i,
    /(;.*--)/,
    /('.*or.*'.*=.*')/i,
    /(\bor\b.*\b1\s*=\s*1\b)/i,
    /(\/\*.*\*\/)/,
  ];

  return sqlPatterns.some((pattern) => pattern.test(input));
}

/**
 * Detect potential NoSQL injection patterns
 */
export function detectNoSqlInjection(input: string): boolean {
  const noSqlPatterns = [
    /(\$where)/i,
    /(\$ne)/i,
    /(\$gt)/i,
    /(\$gte)/i,
    /(\$lt)/i,
    /(\$lte)/i,
    /(\$regex)/i,
    /(\$or)/i,
    /(\$and)/i,
    /(\$not)/i,
    /(\$nor)/i,
  ];

  return noSqlPatterns.some((pattern) => pattern.test(input));
}

/**
 * Detect potential command injection patterns
 */
export function detectCommandInjection(input: string): boolean {
  const commandPatterns = [
    /[;&|`$()]/,
    /(\bcat\b|\bls\b|\bcp\b|\bmv\b|\brm\b)/i,
    /(\bcurl\b|\bwget\b)/i,
    /(\bchmod\b|\bchown\b)/i,
    /(\beval\b|\bexec\b)/i,
    /(\.\.\/)/,
    /(\bsudo\b)/i,
  ];

  return commandPatterns.some((pattern) => pattern.test(input));
}

/**
 * Detect potential XSS patterns
 */
export function detectXss(input: string): boolean {
  const xssPatterns = [
    /<script[^>]*>.*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // event handlers like onclick=
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
    /<img[^>]+src/gi,
    /eval\(/gi,
    /expression\(/gi,
  ];

  return xssPatterns.some((pattern) => pattern.test(input));
}

/**
 * Detect potential path traversal
 */
export function detectPathTraversal(input: string): boolean {
  const pathPatterns = [
    /\.\.\//,
    /\.\.\\/,
    /%2e%2e%2f/i,
    /%2e%2e\\/i,
    /\.\./,
  ];

  return pathPatterns.some((pattern) => pattern.test(input));
}

/**
 * Comprehensive injection detection
 */
export function detectInjection(input: string): {
  detected: boolean;
  type?: string;
} {
  if (detectSqlInjection(input)) {
    return { detected: true, type: 'SQL injection' };
  }

  if (detectNoSqlInjection(input)) {
    return { detected: true, type: 'NoSQL injection' };
  }

  if (detectCommandInjection(input)) {
    return { detected: true, type: 'Command injection' };
  }

  if (detectXss(input)) {
    return { detected: true, type: 'XSS' };
  }

  if (detectPathTraversal(input)) {
    return { detected: true, type: 'Path traversal' };
  }

  return { detected: false };
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject(obj: any, options?: {
  maxDepth?: number;
  currentDepth?: number;
}): any {
  const { maxDepth = 10, currentDepth = 0 } = options || {};

  // Prevent deep recursion
  if (currentDepth >= maxDepth) {
    return '[Max depth exceeded]';
  }

  // Handle null/undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) =>
      sanitizeObject(item, { maxDepth, currentDepth: currentDepth + 1 }),
    );
  }

  // Handle objects
  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key
      const sanitizedKey = sanitizeString(key, { maxLength: 100, allowHtml: false });

      // Sanitize value
      if (typeof value === 'string') {
        sanitized[sanitizedKey] = sanitizeString(value);
      } else {
        sanitized[sanitizedKey] = sanitizeObject(value, {
          maxDepth,
          currentDepth: currentDepth + 1,
        });
      }
    }
    return sanitized;
  }

  // Handle strings
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  // Return primitives as-is
  return obj;
}

/**
 * Validate and sanitize input
 */
export function validateAndSanitize(input: string, options?: {
  allowPatterns?: RegExp[];
  denyPatterns?: RegExp[];
  maxLength?: number;
  required?: boolean;
}): string {
  const {
    allowPatterns,
    denyPatterns,
    maxLength = 10000,
    required = false,
  } = options || {};

  // Check required
  if (required && (!input || input.trim().length === 0)) {
    throw new ValidationError('Input is required');
  }

  // Check length
  if (input.length > maxLength) {
    throw new ValidationError(`Input exceeds maximum length of ${maxLength}`);
  }

  // Check deny patterns
  if (denyPatterns) {
    for (const pattern of denyPatterns) {
      if (pattern.test(input)) {
        throw new SecurityError(
          'Input contains forbidden patterns',
          ErrorCode.INVALID_INPUT,
          { pattern: pattern.toString() },
        );
      }
    }
  }

  // Check allow patterns (if specified, input must match at least one)
  if (allowPatterns && allowPatterns.length > 0) {
    const matches = allowPatterns.some((pattern) => pattern.test(input));
    if (!matches) {
      throw new ValidationError('Input does not match allowed patterns');
    }
  }

  // Detect injection attempts
  const injection = detectInjection(input);
  if (injection.detected) {
    throw new SecurityError(
      `Potential ${injection.type} detected`,
      ErrorCode.INJECTION_DETECTED,
      { input: input.substring(0, 100) },
    );
  }

  return sanitizeString(input);
}

/**
 * Express middleware for input sanitization
 */
export function sanitizeMiddleware(options?: {
  checkQuery?: boolean;
  checkBody?: boolean;
  checkParams?: boolean;
  strict?: boolean;
}) {
  const {
    checkQuery = true,
    checkBody = true,
    checkParams = true,
    strict = true,
  } = options || {};

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Sanitize query parameters
      if (checkQuery && req.query) {
        for (const [key, value] of Object.entries(req.query)) {
          if (typeof value === 'string') {
            const injection = detectInjection(value);
            if (injection.detected) {
              if (strict) {
                throw new SecurityError(
                  `Potential ${injection.type} in query parameter: ${key}`,
                  ErrorCode.INJECTION_DETECTED,
                );
              }
              // Sanitize instead of rejecting
              req.query[key] = sanitizeString(value);
            }
          }
        }
      }

      // Sanitize body
      if (checkBody && req.body) {
        if (strict) {
          // Strict mode: detect and reject
          const checkForInjection = (obj: any): void => {
            if (typeof obj === 'string') {
              const injection = detectInjection(obj);
              if (injection.detected) {
                throw new SecurityError(
                  `Potential ${injection.type} in request body`,
                  ErrorCode.INJECTION_DETECTED,
                );
              }
            } else if (Array.isArray(obj)) {
              obj.forEach(checkForInjection);
            } else if (typeof obj === 'object' && obj !== null) {
              Object.values(obj).forEach(checkForInjection);
            }
          };

          checkForInjection(req.body);
        } else {
          // Non-strict mode: sanitize
          req.body = sanitizeObject(req.body);
        }
      }

      // Sanitize params
      if (checkParams && req.params) {
        for (const [key, value] of Object.entries(req.params)) {
          if (typeof value === 'string') {
            const injection = detectInjection(value);
            if (injection.detected) {
              if (strict) {
                throw new SecurityError(
                  `Potential ${injection.type} in path parameter: ${key}`,
                  ErrorCode.INJECTION_DETECTED,
                );
              }
              req.params[key] = sanitizeString(value);
            }
          }
        }
      }

      next();
    } catch (error) {
      if (error instanceof SecurityError) {
        return res.status(400).json({
          error: {
            code: error.code,
            message: error.message,
          },
        });
      }
      next(error);
    }
  };
}

export default sanitizeMiddleware;
