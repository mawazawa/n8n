/**
 * Test Reporters for Workflow Testing
 * Various output formats for test results
 */

import fs from 'fs/promises';
import { TestResult, TestReport, TestSummary } from './types.js';

/**
 * Base reporter interface
 */
export interface Reporter {
  onTestStart?(testId: string): void;
  onTestComplete?(result: TestResult): void;
  onRunComplete?(results: TestResult[]): void;
  generateReport(results: TestResult[]): Promise<string>;
}

/**
 * Console reporter with pretty output
 */
export class ConsoleReporter implements Reporter {
  private startTime = 0;
  private verbose = false;

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  onTestStart(testId: string): void {
    if (this.verbose) {
      console.log(`\n▶ Running test: ${testId}`);
    }
  }

  onTestComplete(result: TestResult): void {
    const symbol = result.status === 'passed' ? '✓' : '✗';
    const color = result.status === 'passed' ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';

    console.log(`${color}${symbol}${reset} ${result.testId} (${result.duration}ms)`);

    if (this.verbose && result.error) {
      console.log(`  Error: ${result.error.message}`);
    }

    if (this.verbose && result.assertions.length > 0) {
      for (const assertion of result.assertions) {
        const assertSymbol = assertion.passed ? '  ✓' : '  ✗';
        console.log(`${assertSymbol} ${assertion.message ?? 'Assertion'}`);
      }
    }
  }

  onRunComplete(results: TestResult[]): void {
    this.startTime = Date.now();
  }

  async generateReport(results: TestResult[]): Promise<string> {
    const summary = this.calculateSummary(results);
    const duration = results.reduce((sum, r) => sum + r.duration, 0);

    const lines: string[] = [];
    lines.push('\n' + '='.repeat(60));
    lines.push('Test Summary');
    lines.push('='.repeat(60));
    lines.push(`Total Tests: ${summary.total}`);
    lines.push(`Passed: \x1b[32m${summary.passed}\x1b[0m`);
    lines.push(`Failed: \x1b[31m${summary.failed}\x1b[0m`);
    lines.push(`Skipped: ${summary.skipped}`);
    lines.push(`Pass Rate: ${summary.passRate.toFixed(1)}%`);
    lines.push(`Total Duration: ${duration}ms`);
    lines.push('='.repeat(60));

    // Show failed tests
    const failed = results.filter(r => r.status === 'failed');
    if (failed.length > 0) {
      lines.push('\nFailed Tests:');
      for (const result of failed) {
        lines.push(`\n✗ ${result.testId}`);
        if (result.error) {
          lines.push(`  Error: ${result.error.message}`);
          if (result.error.stack) {
            lines.push(`  ${result.error.stack}`);
          }
        }

        // Show failed assertions
        const failedAssertions = result.assertions.filter(a => !a.passed);
        for (const assertion of failedAssertions) {
          lines.push(`  ✗ ${assertion.message ?? 'Assertion failed'}`);
          if (assertion.expected !== undefined && assertion.actual !== undefined) {
            lines.push(`    Expected: ${JSON.stringify(assertion.expected)}`);
            lines.push(`    Actual: ${JSON.stringify(assertion.actual)}`);
          }
        }
      }
    }

    return lines.join('\n');
  }

  private calculateSummary(results: TestResult[]): TestSummary {
    const total = results.length;
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const passRate = total > 0 ? (passed / total) * 100 : 0;

    return { total, passed, failed, skipped, passRate };
  }
}

/**
 * JSON reporter for CI/CD integration
 */
export class JsonReporter implements Reporter {
  private outputPath?: string;

  constructor(outputPath?: string) {
    this.outputPath = outputPath;
  }

  async generateReport(results: TestResult[]): Promise<string> {
    const summary = this.calculateSummary(results);

    const report: TestReport = {
      summary,
      results,
      duration: results.reduce((sum, r) => sum + r.duration, 0),
      timestamp: new Date().toISOString(),
    };

    const json = JSON.stringify(report, null, 2);

    if (this.outputPath) {
      await fs.writeFile(this.outputPath, json, 'utf-8');
    }

    return json;
  }

  private calculateSummary(results: TestResult[]): TestSummary {
    const total = results.length;
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const passRate = total > 0 ? (passed / total) * 100 : 0;

    return { total, passed, failed, skipped, passRate };
  }
}

/**
 * JUnit XML reporter for CI systems
 */
export class JUnitReporter implements Reporter {
  private outputPath?: string;

  constructor(outputPath?: string) {
    this.outputPath = outputPath;
  }

  async generateReport(results: TestResult[]): Promise<string> {
    const summary = this.calculateSummary(results);
    const duration = results.reduce((sum, r) => sum + r.duration, 0) / 1000; // Convert to seconds

    const xml: string[] = [];
    xml.push('<?xml version="1.0" encoding="UTF-8"?>');
    xml.push(`<testsuites tests="${summary.total}" failures="${summary.failed}" skipped="${summary.skipped}" time="${duration}">`);
    xml.push(`  <testsuite name="Workflow Tests" tests="${summary.total}" failures="${summary.failed}" skipped="${summary.skipped}" time="${duration}">`);

    for (const result of results) {
      const testDuration = result.duration / 1000;
      xml.push(`    <testcase name="${this.escapeXml(result.testId)}" time="${testDuration}">`);

      if (result.status === 'failed') {
        const message = result.error?.message ?? 'Test failed';
        const details = result.error?.stack ?? '';

        xml.push(`      <failure message="${this.escapeXml(message)}">`);
        xml.push(this.escapeXml(details));
        xml.push('      </failure>');
      } else if (result.status === 'skipped') {
        xml.push('      <skipped/>');
      }

      xml.push('    </testcase>');
    }

    xml.push('  </testsuite>');
    xml.push('</testsuites>');

    const xmlString = xml.join('\n');

    if (this.outputPath) {
      await fs.writeFile(this.outputPath, xmlString, 'utf-8');
    }

    return xmlString;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private calculateSummary(results: TestResult[]): TestSummary {
    const total = results.length;
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const passRate = total > 0 ? (passed / total) * 100 : 0;

    return { total, passed, failed, skipped, passRate };
  }
}

/**
 * HTML reporter with interactive visualization
 */
export class HtmlReporter implements Reporter {
  private outputPath?: string;

  constructor(outputPath?: string) {
    this.outputPath = outputPath;
  }

  async generateReport(results: TestResult[]): Promise<string> {
    const summary = this.calculateSummary(results);
    const duration = results.reduce((sum, r) => sum + r.duration, 0);

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workflow Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { background: white; padding: 30px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; margin-bottom: 20px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 20px; }
    .summary-card { background: #f9f9f9; padding: 20px; border-radius: 4px; border-left: 4px solid #ddd; }
    .summary-card.passed { border-left-color: #4caf50; }
    .summary-card.failed { border-left-color: #f44336; }
    .summary-card h3 { color: #666; font-size: 14px; margin-bottom: 10px; text-transform: uppercase; }
    .summary-card .value { font-size: 32px; font-weight: bold; color: #333; }
    .tests { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .test { border-bottom: 1px solid #eee; padding: 15px 0; }
    .test:last-child { border-bottom: none; }
    .test-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .test-name { font-weight: 600; color: #333; }
    .test-duration { color: #999; font-size: 14px; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .status.passed { background: #e8f5e9; color: #4caf50; }
    .status.failed { background: #ffebee; color: #f44336; }
    .status.skipped { background: #fff3e0; color: #ff9800; }
    .error { background: #ffebee; padding: 15px; border-radius: 4px; margin-top: 10px; color: #d32f2f; font-family: monospace; font-size: 12px; }
    .assertions { margin-top: 10px; padding-left: 20px; }
    .assertion { padding: 5px 0; font-size: 14px; color: #666; }
    .assertion.failed { color: #f44336; }
    .progress-bar { width: 100%; height: 8px; background: #eee; border-radius: 4px; overflow: hidden; margin-top: 20px; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #4caf50, #66bb6a); transition: width 0.3s; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Workflow Test Report</h1>
      <p>Generated on ${new Date().toLocaleString()}</p>

      <div class="summary">
        <div class="summary-card">
          <h3>Total Tests</h3>
          <div class="value">${summary.total}</div>
        </div>
        <div class="summary-card passed">
          <h3>Passed</h3>
          <div class="value">${summary.passed}</div>
        </div>
        <div class="summary-card failed">
          <h3>Failed</h3>
          <div class="value">${summary.failed}</div>
        </div>
        <div class="summary-card">
          <h3>Pass Rate</h3>
          <div class="value">${summary.passRate.toFixed(1)}%</div>
        </div>
        <div class="summary-card">
          <h3>Duration</h3>
          <div class="value">${(duration / 1000).toFixed(2)}s</div>
        </div>
      </div>

      <div class="progress-bar">
        <div class="progress-fill" style="width: ${summary.passRate}%"></div>
      </div>
    </div>

    <div class="tests">
      <h2 style="margin-bottom: 20px;">Test Results</h2>
      ${results.map(result => this.renderTest(result)).join('\n')}
    </div>
  </div>
</body>
</html>`;

    if (this.outputPath) {
      await fs.writeFile(this.outputPath, html, 'utf-8');
    }

    return html;
  }

  private renderTest(result: TestResult): string {
    const failedAssertions = result.assertions.filter(a => !a.passed);

    return `
      <div class="test">
        <div class="test-header">
          <div>
            <span class="test-name">${this.escapeHtml(result.testId)}</span>
            <span class="status ${result.status}">${result.status}</span>
          </div>
          <span class="test-duration">${result.duration}ms</span>
        </div>

        ${result.error ? `
          <div class="error">
            <strong>Error:</strong> ${this.escapeHtml(result.error.message)}
            ${result.error.stack ? `<br><br>${this.escapeHtml(result.error.stack)}` : ''}
          </div>
        ` : ''}

        ${failedAssertions.length > 0 ? `
          <div class="assertions">
            <strong>Failed Assertions:</strong>
            ${failedAssertions.map(a => `
              <div class="assertion failed">
                ✗ ${this.escapeHtml(a.message ?? 'Assertion failed')}
                ${a.expected !== undefined ? `<br>Expected: ${this.escapeHtml(JSON.stringify(a.expected))}` : ''}
                ${a.actual !== undefined ? `<br>Actual: ${this.escapeHtml(JSON.stringify(a.actual))}` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${result.coverage ? `
          <div style="margin-top: 10px; font-size: 14px; color: #666;">
            Coverage: ${result.coverage.executedNodes}/${result.coverage.totalNodes} nodes (${result.coverage.percentage.toFixed(1)}%)
          </div>
        ` : ''}
      </div>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private calculateSummary(results: TestResult[]): TestSummary {
    const total = results.length;
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const passRate = total > 0 ? (passed / total) * 100 : 0;

    return { total, passed, failed, skipped, passRate };
  }
}

/**
 * TAP (Test Anything Protocol) reporter
 */
export class TapReporter implements Reporter {
  private outputPath?: string;

  constructor(outputPath?: string) {
    this.outputPath = outputPath;
  }

  async generateReport(results: TestResult[]): Promise<string> {
    const lines: string[] = [];
    lines.push('TAP version 13');
    lines.push(`1..${results.length}`);

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const testNumber = i + 1;

      if (result.status === 'passed') {
        lines.push(`ok ${testNumber} - ${result.testId}`);
      } else if (result.status === 'failed') {
        lines.push(`not ok ${testNumber} - ${result.testId}`);
        if (result.error) {
          lines.push(`  ---`);
          lines.push(`  message: ${result.error.message}`);
          if (result.error.stack) {
            lines.push(`  stack: |`);
            const stackLines = result.error.stack.split('\n');
            for (const line of stackLines) {
              lines.push(`    ${line}`);
            }
          }
          lines.push(`  ...`);
        }
      } else if (result.status === 'skipped') {
        lines.push(`ok ${testNumber} - ${result.testId} # SKIP`);
      }
    }

    const tap = lines.join('\n');

    if (this.outputPath) {
      await fs.writeFile(this.outputPath, tap, 'utf-8');
    }

    return tap;
  }
}

/**
 * Multi-reporter that combines multiple reporters
 */
export class MultiReporter implements Reporter {
  private reporters: Reporter[];

  constructor(reporters: Reporter[]) {
    this.reporters = reporters;
  }

  onTestStart(testId: string): void {
    for (const reporter of this.reporters) {
      reporter.onTestStart?.(testId);
    }
  }

  onTestComplete(result: TestResult): void {
    for (const reporter of this.reporters) {
      reporter.onTestComplete?.(result);
    }
  }

  onRunComplete(results: TestResult[]): void {
    for (const reporter of this.reporters) {
      reporter.onRunComplete?.(results);
    }
  }

  async generateReport(results: TestResult[]): Promise<string> {
    const reports: string[] = [];

    for (const reporter of this.reporters) {
      const report = await reporter.generateReport(results);
      reports.push(report);
    }

    return reports.join('\n\n');
  }
}
