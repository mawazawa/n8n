/**
 * Trend Detector
 * Detects trends, patterns, and anomalies in time series data
 */

import type { TimeSeriesData } from '../analytics/types.js';
import type { Trend, TrendData } from './types.js';
import { v4 as uuidv4 } from 'uuid';

export class TrendDetector {
  /**
   * Detect trends in metrics over a time window
   */
  async detectTrends(
    metrics: TimeSeriesData[],
    windowMs: number = 7 * 24 * 60 * 60 * 1000, // 7 days
  ): Promise<Trend[]> {
    const trends: Trend[] = [];
    const now = Date.now();
    const windowStart = now - windowMs;

    for (const metric of metrics) {
      // Filter data points within window
      const windowData = metric.dataPoints.filter(
        (dp) => dp.timestamp >= windowStart && dp.timestamp <= now,
      );

      if (windowData.length < 2) continue;

      // Calculate trend data
      const trendData = this.analyzeTrendData(metric.metric, windowData);

      // Detect pattern
      const pattern = this.detectPattern(windowData);

      // Detect seasonality
      const seasonality = this.detectSeasonality(windowData);

      // Generate forecast
      const forecast = this.generateForecast(windowData, pattern);

      const trend: Trend = {
        id: uuidv4(),
        workflowId: 'global', // Can be specialized per workflow
        metric: metric.metric,
        data: trendData,
        pattern,
        seasonality,
        forecast,
        detectedAt: now,
      };

      trends.push(trend);
    }

    return trends;
  }

  /**
   * Analyze trend data statistics
   */
  private analyzeTrendData(
    metricName: string,
    dataPoints: Array<{ timestamp: number; value: number }>,
  ): TrendData {
    const values = dataPoints.map((dp) => dp.value);
    const current = values[values.length - 1];
    const previous = values[values.length - 2] || current;

    // Statistics
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Standard deviation
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Trend direction
    const changePercent = previous !== 0 ? ((current - previous) / previous) * 100 : 0;
    let direction: 'up' | 'down' | 'stable' = 'stable';

    if (changePercent > 5) {
      direction = 'up';
    } else if (changePercent < -5) {
      direction = 'down';
    }

    return {
      metric: metricName,
      values: dataPoints,
      direction,
      changePercent,
      current,
      previous,
      average,
      min,
      max,
      stdDev,
    };
  }

  /**
   * Detect pattern in time series
   */
  private detectPattern(
    dataPoints: Array<{ timestamp: number; value: number }>,
  ): Trend['pattern'] {
    if (dataPoints.length < 3) return 'stable';

    const values = dataPoints.map((dp) => dp.value);

    // Check for linear trend
    const linearTrend = this.calculateLinearTrend(values);
    if (Math.abs(linearTrend) > 0.1) {
      return 'linear';
    }

    // Check for exponential growth
    const exponentialGrowth = this.detectExponentialGrowth(values);
    if (exponentialGrowth) {
      return 'exponential';
    }

    // Check for seasonality
    const hasSeasonal = this.hasSeasonalPattern(dataPoints);
    if (hasSeasonal) {
      return 'seasonal';
    }

    // Check for anomalies
    const hasAnomaly = this.hasAnomalies(values);
    if (hasAnomaly) {
      return 'anomaly';
    }

    return 'stable';
  }

  /**
   * Detect seasonality in data
   */
  private detectSeasonality(
    dataPoints: Array<{ timestamp: number; value: number }>,
  ): Trend['seasonality'] {
    if (dataPoints.length < 7) return undefined;

    // Check for daily pattern (24 hour cycle)
    const dailyStrength = this.calculateSeasonalStrength(dataPoints, 24 * 60 * 60 * 1000);

    // Check for weekly pattern (7 day cycle)
    const weeklyStrength = this.calculateSeasonalStrength(
      dataPoints,
      7 * 24 * 60 * 60 * 1000,
    );

    // Check for monthly pattern (30 day cycle)
    const monthlyStrength = this.calculateSeasonalStrength(
      dataPoints,
      30 * 24 * 60 * 60 * 1000,
    );

    const maxStrength = Math.max(dailyStrength, weeklyStrength, monthlyStrength);

    if (maxStrength < 0.3) return undefined;

    if (maxStrength === dailyStrength) {
      return { period: 'daily', strength: dailyStrength };
    } else if (maxStrength === weeklyStrength) {
      return { period: 'weekly', strength: weeklyStrength };
    } else {
      return { period: 'monthly', strength: monthlyStrength };
    }
  }

  /**
   * Generate forecast
   */
  private generateForecast(
    dataPoints: Array<{ timestamp: number; value: number }>,
    pattern: Trend['pattern'],
  ): Trend['forecast'] {
    if (dataPoints.length < 3) return undefined;

    const forecastPoints = 5;
    const forecast: NonNullable<Trend['forecast']> = [];

    const values = dataPoints.map((dp) => dp.value);
    const timestamps = dataPoints.map((dp) => dp.timestamp);
    const timeInterval =
      (timestamps[timestamps.length - 1] - timestamps[0]) / (timestamps.length - 1);

    switch (pattern) {
      case 'linear': {
        const slope = this.calculateLinearTrend(values);
        const lastValue = values[values.length - 1];
        const lastTimestamp = timestamps[timestamps.length - 1];

        for (let i = 1; i <= forecastPoints; i++) {
          forecast.push({
            timestamp: lastTimestamp + i * timeInterval,
            value: lastValue + slope * i,
            confidence: Math.max(0, 100 - i * 10), // Decreasing confidence
          });
        }
        break;
      }

      case 'exponential': {
        const growthRate = this.calculateGrowthRate(values);
        const lastValue = values[values.length - 1];
        const lastTimestamp = timestamps[timestamps.length - 1];

        for (let i = 1; i <= forecastPoints; i++) {
          forecast.push({
            timestamp: lastTimestamp + i * timeInterval,
            value: lastValue * Math.pow(1 + growthRate, i),
            confidence: Math.max(0, 100 - i * 15),
          });
        }
        break;
      }

      default: {
        // Simple average-based forecast
        const average = values.reduce((a, b) => a + b, 0) / values.length;
        const lastTimestamp = timestamps[timestamps.length - 1];

        for (let i = 1; i <= forecastPoints; i++) {
          forecast.push({
            timestamp: lastTimestamp + i * timeInterval,
            value: average,
            confidence: Math.max(0, 90 - i * 10),
          });
        }
      }
    }

    return forecast;
  }

  // Helper methods

  private calculateLinearTrend(values: number[]): number {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  private detectExponentialGrowth(values: number[]): boolean {
    if (values.length < 3) return false;

    // Check if values are consistently increasing at an increasing rate
    const growthRates: number[] = [];

    for (let i = 1; i < values.length; i++) {
      if (values[i - 1] === 0) continue;
      const rate = (values[i] - values[i - 1]) / values[i - 1];
      growthRates.push(rate);
    }

    if (growthRates.length < 2) return false;

    // Check if growth rates are increasing
    let increasing = 0;
    for (let i = 1; i < growthRates.length; i++) {
      if (growthRates[i] > growthRates[i - 1]) {
        increasing++;
      }
    }

    return increasing / (growthRates.length - 1) > 0.6;
  }

  private hasSeasonalPattern(
    dataPoints: Array<{ timestamp: number; value: number }>,
  ): boolean {
    // Simple check for repeating patterns
    if (dataPoints.length < 7) return false;

    const values = dataPoints.map((dp) => dp.value);
    const avgValue = values.reduce((a, b) => a + b, 0) / values.length;

    // Check for oscillation around mean
    let crossings = 0;
    for (let i = 1; i < values.length; i++) {
      if (
        (values[i - 1] < avgValue && values[i] >= avgValue) ||
        (values[i - 1] >= avgValue && values[i] < avgValue)
      ) {
        crossings++;
      }
    }

    // If we cross the mean multiple times, likely seasonal
    return crossings >= 4;
  }

  private hasAnomalies(values: number[]): boolean {
    if (values.length < 3) return false;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Check if any value is more than 3 standard deviations from mean
    return values.some((val) => Math.abs(val - mean) > 3 * stdDev);
  }

  private calculateSeasonalStrength(
    dataPoints: Array<{ timestamp: number; value: number }>,
    periodMs: number,
  ): number {
    if (dataPoints.length < 2) return 0;

    // Group data points by period
    const periods = new Map<number, number[]>();

    for (const dp of dataPoints) {
      const periodIndex = Math.floor(dp.timestamp / periodMs);
      if (!periods.has(periodIndex)) {
        periods.set(periodIndex, []);
      }
      periods.get(periodIndex)!.push(dp.value);
    }

    if (periods.size < 2) return 0;

    // Calculate average for each period
    const periodAverages = Array.from(periods.values()).map(
      (values) => values.reduce((a, b) => a + b, 0) / values.length,
    );

    // Calculate variance between periods
    const overallMean =
      periodAverages.reduce((a, b) => a + b, 0) / periodAverages.length;
    const betweenVariance =
      periodAverages.reduce((sum, avg) => sum + Math.pow(avg - overallMean, 2), 0) /
      periodAverages.length;

    // Calculate total variance
    const allValues = dataPoints.map((dp) => dp.value);
    const totalMean = allValues.reduce((a, b) => a + b, 0) / allValues.length;
    const totalVariance =
      allValues.reduce((sum, val) => sum + Math.pow(val - totalMean, 2), 0) /
      allValues.length;

    // Strength is ratio of between-variance to total variance
    return totalVariance > 0 ? Math.min(betweenVariance / totalVariance, 1) : 0;
  }

  private calculateGrowthRate(values: number[]): number {
    if (values.length < 2) return 0;

    const rates: number[] = [];
    for (let i = 1; i < values.length; i++) {
      if (values[i - 1] !== 0) {
        rates.push((values[i] - values[i - 1]) / values[i - 1]);
      }
    }

    return rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  }
}
