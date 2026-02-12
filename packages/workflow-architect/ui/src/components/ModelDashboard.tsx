/**
 * Model Selection Dashboard
 * Displays model performance, cost, and selection metrics
 */

import React, { useState, useEffect } from 'react';

interface ModelMetrics {
  modelId: string;
  requests: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  totalCost: number;
  avgCost: number;
  successRate: number;
  currentLoad: number;
}

interface CostBreakdown {
  modelId: string;
  totalCost: number;
  requests: number;
  avgCostPerRequest: number;
  inputTokens: number;
  outputTokens: number;
}

interface LatencyTrend {
  timestamp: number;
  avgLatency: number;
  count: number;
}

export const ModelDashboard: React.FC = () => {
  const [selectedView, setSelectedView] = useState<'overview' | 'latency' | 'cost' | 'health'>('overview');
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [timeWindow, setTimeWindow] = useState<'1h' | '24h' | '7d' | '30d'>('24h');

  // Mock data - in real implementation, fetch from API
  const [modelMetrics, setModelMetrics] = useState<ModelMetrics[]>([
    {
      modelId: 'claude-sonnet-4',
      requests: 1250,
      avgLatency: 1200,
      p95Latency: 2400,
      p99Latency: 3800,
      totalCost: 4.52,
      avgCost: 0.0036,
      successRate: 99.2,
      currentLoad: 3,
    },
    {
      modelId: 'gpt-4o',
      requests: 856,
      avgLatency: 980,
      p95Latency: 1950,
      p99Latency: 2800,
      totalCost: 3.14,
      avgCost: 0.0037,
      successRate: 98.8,
      currentLoad: 2,
    },
    {
      modelId: 'grok-4.2',
      requests: 432,
      avgLatency: 1450,
      p95Latency: 2850,
      p99Latency: 4200,
      totalCost: 1.29,
      avgCost: 0.003,
      successRate: 97.5,
      currentLoad: 1,
    },
    {
      modelId: 'gemini-2-flash',
      requests: 2145,
      avgLatency: 650,
      p95Latency: 1200,
      p99Latency: 1800,
      totalCost: 0.64,
      avgCost: 0.0003,
      successRate: 99.5,
      currentLoad: 5,
    },
  ]);

  const formatCurrency = (value: number): string => {
    return `$${value.toFixed(3)}`;
  };

  const formatLatency = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getHealthColor = (successRate: number): string => {
    if (successRate >= 99) return '#22c55e'; // green
    if (successRate >= 95) return '#eab308'; // yellow
    return '#ef4444'; // red
  };

  const getLatencyColor = (p95: number): string => {
    if (p95 < 2000) return '#22c55e';
    if (p95 < 4000) return '#eab308';
    return '#ef4444';
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#f9fafb', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '8px' }}>
          Model Performance Dashboard
        </h1>
        <p style={{ color: '#6b7280' }}>
          Monitor model performance, costs, and health across all AI providers
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        {/* View Selector */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['overview', 'latency', 'cost', 'health'] as const).map(view => (
            <button
              key={view}
              onClick={() => setSelectedView(view)}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: selectedView === view ? '#3b82f6' : '#ffffff',
                color: selectedView === view ? '#ffffff' : '#374151',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                textTransform: 'capitalize',
              }}
            >
              {view}
            </button>
          ))}
        </div>

        {/* Time Window Selector */}
        <select
          value={timeWindow}
          onChange={e => setTimeWindow(e.target.value as typeof timeWindow)}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            backgroundColor: '#ffffff',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          <option value="1h">Last Hour</option>
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
        </select>
      </div>

      {/* Overview View */}
      {selectedView === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          {modelMetrics.map(model => (
            <div
              key={model.modelId}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                cursor: 'pointer',
                transition: 'transform 0.2s',
              }}
              onClick={() => setSelectedModel(model.modelId)}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
                    {model.modelId}
                  </h3>
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>
                    {model.requests.toLocaleString()} requests
                  </p>
                </div>
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: getHealthColor(model.successRate),
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Avg Latency</p>
                  <p style={{ fontSize: '18px', fontWeight: '600' }}>{formatLatency(model.avgLatency)}</p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>P95 Latency</p>
                  <p style={{ fontSize: '18px', fontWeight: '600', color: getLatencyColor(model.p95Latency) }}>
                    {formatLatency(model.p95Latency)}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Total Cost</p>
                  <p style={{ fontSize: '18px', fontWeight: '600' }}>{formatCurrency(model.totalCost)}</p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Success Rate</p>
                  <p style={{ fontSize: '18px', fontWeight: '600' }}>{model.successRate}%</p>
                </div>
              </div>

              {model.currentLoad > 0 && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>
                    Current Load: <span style={{ fontWeight: '600' }}>{model.currentLoad} requests</span>
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Latency View */}
      {selectedView === 'latency' && (
        <div>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Latency Comparison</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600' }}>Model</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600' }}>Avg</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600' }}>P95</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600' }}>P99</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600' }}>Requests</th>
                </tr>
              </thead>
              <tbody>
                {modelMetrics
                  .sort((a, b) => a.avgLatency - b.avgLatency)
                  .map(model => (
                    <tr key={model.modelId} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '12px', fontSize: '14px', fontWeight: '500' }}>{model.modelId}</td>
                      <td style={{ textAlign: 'right', padding: '12px', fontSize: '14px' }}>{formatLatency(model.avgLatency)}</td>
                      <td style={{ textAlign: 'right', padding: '12px', fontSize: '14px', color: getLatencyColor(model.p95Latency) }}>
                        {formatLatency(model.p95Latency)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '12px', fontSize: '14px' }}>{formatLatency(model.p99Latency)}</td>
                      <td style={{ textAlign: 'right', padding: '12px', fontSize: '14px' }}>{model.requests.toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cost View */}
      {selectedView === 'cost' && (
        <div>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Cost Breakdown</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              <div>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Total Cost</p>
                <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {formatCurrency(modelMetrics.reduce((sum, m) => sum + m.totalCost, 0))}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Total Requests</p>
                <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {modelMetrics.reduce((sum, m) => sum + m.requests, 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Avg Cost/Request</p>
                <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {formatCurrency(
                    modelMetrics.reduce((sum, m) => sum + m.totalCost, 0) /
                    modelMetrics.reduce((sum, m) => sum + m.requests, 0)
                  )}
                </p>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: '12px', fontSize: '14px', fontWeight: '600' }}>Model</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600' }}>Total Cost</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600' }}>Requests</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600' }}>Avg Cost</th>
                  <th style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600' }}>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {modelMetrics
                  .sort((a, b) => b.totalCost - a.totalCost)
                  .map(model => {
                    const totalCost = modelMetrics.reduce((sum, m) => sum + m.totalCost, 0);
                    const percentage = (model.totalCost / totalCost) * 100;
                    return (
                      <tr key={model.modelId} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '12px', fontSize: '14px', fontWeight: '500' }}>{model.modelId}</td>
                        <td style={{ textAlign: 'right', padding: '12px', fontSize: '14px', fontWeight: '600' }}>
                          {formatCurrency(model.totalCost)}
                        </td>
                        <td style={{ textAlign: 'right', padding: '12px', fontSize: '14px' }}>{model.requests.toLocaleString()}</td>
                        <td style={{ textAlign: 'right', padding: '12px', fontSize: '14px' }}>{formatCurrency(model.avgCost)}</td>
                        <td style={{ textAlign: 'right', padding: '12px', fontSize: '14px' }}>{percentage.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Health View */}
      {selectedView === 'health' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          {modelMetrics.map(model => (
            <div
              key={model.modelId}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: `2px solid ${getHealthColor(model.successRate)}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: getHealthColor(model.successRate),
                    marginRight: '8px',
                  }}
                />
                <h3 style={{ fontSize: '16px', fontWeight: '600' }}>{model.modelId}</h3>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Success Rate</p>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <p style={{ fontSize: '28px', fontWeight: 'bold', marginRight: '4px' }}>{model.successRate}</p>
                  <p style={{ fontSize: '16px', color: '#6b7280' }}>%</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>Current Load</p>
                  <p style={{ fontSize: '16px', fontWeight: '600' }}>{model.currentLoad}</p>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>Total Requests</p>
                  <p style={{ fontSize: '16px', fontWeight: '600' }}>{model.requests.toLocaleString()}</p>
                </div>
              </div>

              {model.successRate < 99 && (
                <div style={{ marginTop: '12px', padding: '8px', backgroundColor: '#fef3c7', borderRadius: '4px' }}>
                  <p style={{ fontSize: '12px', color: '#92400e' }}>
                    ⚠️ Success rate below 99%
                  </p>
                </div>
              )}

              {model.p95Latency > 3000 && (
                <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#fee2e2', borderRadius: '4px' }}>
                  <p style={{ fontSize: '12px', color: '#991b1b' }}>
                    ⚠️ High P95 latency ({formatLatency(model.p95Latency)})
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ModelDashboard;
