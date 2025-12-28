import React, { useEffect, useState } from 'react';

interface EmbeddingStats {
  totalWorkflows: number;
  totalNodeChunks: number;
  pendingEmbeddings: number;
  processingEmbeddings: number;
  completedEmbeddings: number;
  failedEmbeddings: number;
}

interface FailedWorkflow {
  id: string;
  name: string;
  retry_count: number;
  error: string;
  error_code: string;
  last_retry_at: string;
  can_retry: boolean;
  created_at: string;
}

interface PerformanceMetrics {
  total_processed: number;
  total_completed: number;
  total_failed: number;
  success_rate: number;
  avg_duration_ms: number;
  median_duration_ms: number;
  p95_duration_ms: number;
  avg_retries: number;
}

interface WebhookStats {
  total_requests: number;
  failed_requests: number;
  success_rate: number;
  last_24h_requests: number;
}

interface VersionStats {
  model_version: string;
  workflow_count: number;
  avg_quality_score: number;
  last_updated: string;
}

interface QueueItem {
  id: string;
  name: string;
  embedding_status: 'pending' | 'processing' | 'completed' | 'failed';
  embedding_retry_count: number;
  embedding_error: string;
  is_stuck: boolean;
  created_at: string;
}

interface EmbeddingStatusProps {
  supabaseUrl: string;
  supabaseKey: string;
  refreshInterval?: number;
}

export function EmbeddingStatus({
  supabaseUrl,
  supabaseKey,
  refreshInterval = 10000,
}: EmbeddingStatusProps) {
  const [stats, setStats] = useState<EmbeddingStats | null>(null);
  const [failedWorkflows, setFailedWorkflows] = useState<FailedWorkflow[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [webhookStats, setWebhookStats] = useState<WebhookStats | null>(null);
  const [versionStats, setVersionStats] = useState<VersionStats[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'queue' | 'performance' | 'versions'>('overview');

  const fetchStats = async () => {
    try {
      const headers = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      };

      // Fetch queue statistics using new database function
      const queueStatsRes = await fetch(
        `${supabaseUrl}/rest/v1/rpc/get_embedding_queue_stats`,
        {
          method: 'POST',
          headers,
        }
      );
      const queueStatsData = await queueStatsRes.json();

      // Parse queue stats
      let pending = 0, processing = 0, completed = 0, failed = 0;
      if (Array.isArray(queueStatsData)) {
        queueStatsData.forEach((stat: { status: string; count: number }) => {
          if (stat.status === 'pending') pending = stat.count;
          if (stat.status === 'processing') processing = stat.count;
          if (stat.status === 'completed') completed = stat.count;
          if (stat.status === 'failed') failed = stat.count;
        });
      }

      // Fetch node chunks count
      const nodeChunksRes = await fetch(
        `${supabaseUrl}/rest/v1/workflow_node_chunks?select=id`,
        { headers }
      );
      const nodeChunks = await nodeChunksRes.json();

      setStats({
        totalWorkflows: pending + processing + completed + failed,
        totalNodeChunks: Array.isArray(nodeChunks) ? nodeChunks.length : 0,
        pendingEmbeddings: pending,
        processingEmbeddings: processing,
        completedEmbeddings: completed,
        failedEmbeddings: failed,
      });

      // Fetch failed workflows using new function
      const failedRes = await fetch(
        `${supabaseUrl}/rest/v1/rpc/get_failed_embeddings`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ p_limit: 50, p_max_retries: 3 }),
        }
      );
      const failedData = await failedRes.json();
      setFailedWorkflows(Array.isArray(failedData) ? failedData : []);

      // Fetch performance metrics
      const perfRes = await fetch(
        `${supabaseUrl}/rest/v1/rpc/get_embedding_performance_metrics`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ p_hours: 24 }),
        }
      );
      const perfData = await perfRes.json();
      if (Array.isArray(perfData) && perfData.length > 0) {
        setPerformanceMetrics(perfData[0]);
      }

      // Fetch webhook stats
      const webhookRes = await fetch(
        `${supabaseUrl}/rest/v1/rpc/get_webhook_stats`,
        {
          method: 'POST',
          headers,
        }
      );
      const webhookData = await webhookRes.json();
      if (Array.isArray(webhookData) && webhookData.length > 0) {
        setWebhookStats(webhookData[0]);
      }

      // Fetch version stats
      const versionRes = await fetch(
        `${supabaseUrl}/rest/v1/rpc/get_embedding_version_stats`,
        {
          method: 'POST',
          headers,
        }
      );
      const versionData = await versionRes.json();
      setVersionStats(Array.isArray(versionData) ? versionData : []);

      // Fetch queue monitor view
      const queueRes = await fetch(
        `${supabaseUrl}/rest/v1/embedding_queue_monitor?limit=20`,
        { headers }
      );
      const queueData = await queueRes.json();
      setQueueItems(Array.isArray(queueData) ? queueData : []);

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
    } finally {
      setLoading(false);
    }
  };

  const retryWorkflow = async (workflowId: string) => {
    setRetrying(workflowId);
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-embedding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ workflow_id: workflowId, force: true }),
      });

      if (!response.ok) {
        throw new Error('Retry failed');
      }

      // Refresh stats after retry
      await fetchStats();
    } catch (err) {
      setError(`Retry failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setRetrying(null);
    }
  };

  const retryAllFailed = async () => {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/batch-embed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ status_filter: 'failed' }),
      });

      if (!response.ok) {
        throw new Error('Batch retry failed');
      }

      // Refresh stats after batch retry
      await fetchStats();
    } catch (err) {
      setError(`Batch retry failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, refreshInterval);
    return () => clearInterval(interval);
  }, [supabaseUrl, supabaseKey, refreshInterval]);

  if (loading) {
    return (
      <div className="p-4 bg-gray-800 rounded-lg">
        <div className="animate-pulse">Loading embedding stats...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/50 rounded-lg">
        <p className="text-red-400">Error: {error}</p>
        <button
          onClick={fetchStats}
          className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const completionPercentage =
    stats.totalWorkflows > 0
      ? Math.round((stats.completedEmbeddings / stats.totalWorkflows) * 100)
      : 0;

  const TabButton = ({ id, label }: { id: typeof activeTab; label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
        activeTab === id
          ? 'bg-gray-700 text-white'
          : 'bg-gray-900 text-gray-400 hover:text-white'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-6 bg-gray-800 rounded-lg space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Embedding Pipeline Status</h2>
        <button
          onClick={fetchStats}
          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white"
        >
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700">
        <TabButton id="overview" label="Overview" />
        <TabButton id="queue" label="Queue Monitor" />
        <TabButton id="performance" label="Performance" />
        <TabButton id="versions" label="Versions" />
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-400">
              <span>Embedding Progress</span>
              <span>{completionPercentage}%</span>
            </div>
            <div className="w-full h-4 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gray-700 rounded-lg">
              <div className="text-3xl font-bold text-white">{stats.totalWorkflows}</div>
              <div className="text-sm text-gray-400">Total Workflows</div>
            </div>
            <div className="p-4 bg-gray-700 rounded-lg">
              <div className="text-3xl font-bold text-green-400">{stats.completedEmbeddings}</div>
              <div className="text-sm text-gray-400">Completed</div>
            </div>
            <div className="p-4 bg-gray-700 rounded-lg">
              <div className="text-3xl font-bold text-yellow-400">
                {stats.pendingEmbeddings + stats.processingEmbeddings}
              </div>
              <div className="text-sm text-gray-400">Pending/Processing</div>
            </div>
            <div className="p-4 bg-gray-700 rounded-lg">
              <div className="text-3xl font-bold text-red-400">{stats.failedEmbeddings}</div>
              <div className="text-sm text-gray-400">Failed</div>
            </div>
          </div>

          {/* Node Chunks & Webhook Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-blue-400">{stats.totalNodeChunks}</div>
              <div className="text-sm text-gray-400">Node Chunks (Fine-grained embeddings)</div>
            </div>
            {webhookStats && (
              <div className="p-4 bg-gray-700 rounded-lg">
                <div className="text-2xl font-bold text-purple-400">
                  {webhookStats.success_rate.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-400">
                  Webhook Success Rate ({webhookStats.last_24h_requests} last 24h)
                </div>
              </div>
            )}
          </div>

          {/* Failed Workflows */}
          {failedWorkflows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-red-400">Failed Workflows</h3>
                <button
                  onClick={retryAllFailed}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white text-sm"
                >
                  Retry All
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {failedWorkflows.map((workflow) => (
                  <div
                    key={workflow.id}
                    className="flex items-center justify-between p-3 bg-gray-700 rounded"
                  >
                    <div className="flex-1">
                      <div className="text-white">{workflow.name}</div>
                      <div className="text-xs text-gray-400">
                        Retries: {workflow.retry_count} | {workflow.error_code || 'Unknown error'}
                      </div>
                      {workflow.error && (
                        <div className="text-xs text-red-400 mt-1 truncate">{workflow.error}</div>
                      )}
                    </div>
                    <button
                      onClick={() => retryWorkflow(workflow.id)}
                      disabled={retrying === workflow.id || !workflow.can_retry}
                      className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white text-sm ml-4"
                    >
                      {retrying === workflow.id ? 'Retrying...' : workflow.can_retry ? 'Retry' : 'Max Retries'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'queue' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Real-time Queue Monitor</h3>
          {queueItems.length === 0 ? (
            <div className="text-gray-400 text-center py-8">Queue is empty</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {queueItems.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 rounded-lg ${
                    item.is_stuck ? 'bg-orange-900/30 border-2 border-orange-500' :
                    item.embedding_status === 'processing' ? 'bg-blue-900/30' :
                    item.embedding_status === 'pending' ? 'bg-gray-700' :
                    'bg-red-900/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{item.name}</span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          item.embedding_status === 'processing' ? 'bg-blue-600' :
                          item.embedding_status === 'pending' ? 'bg-yellow-600' :
                          'bg-red-600'
                        }`}>
                          {item.embedding_status.toUpperCase()}
                        </span>
                        {item.is_stuck && (
                          <span className="px-2 py-1 rounded text-xs bg-orange-600">STUCK</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Retries: {item.embedding_retry_count} | Created: {new Date(item.created_at).toLocaleString()}
                      </div>
                      {item.embedding_error && (
                        <div className="text-xs text-red-400 mt-1">{item.embedding_error}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'performance' && performanceMetrics && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Performance Metrics (Last 24h)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-green-400">
                {performanceMetrics.success_rate.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-400">Success Rate</div>
            </div>
            <div className="p-4 bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-blue-400">
                {performanceMetrics.avg_duration_ms.toFixed(0)}ms
              </div>
              <div className="text-sm text-gray-400">Avg Duration</div>
            </div>
            <div className="p-4 bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-purple-400">
                {performanceMetrics.median_duration_ms.toFixed(0)}ms
              </div>
              <div className="text-sm text-gray-400">Median Duration</div>
            </div>
            <div className="p-4 bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-orange-400">
                {performanceMetrics.p95_duration_ms.toFixed(0)}ms
              </div>
              <div className="text-sm text-gray-400">P95 Duration</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-white">{performanceMetrics.total_processed}</div>
              <div className="text-sm text-gray-400">Total Processed</div>
            </div>
            <div className="p-4 bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-green-400">{performanceMetrics.total_completed}</div>
              <div className="text-sm text-gray-400">Completed</div>
            </div>
            <div className="p-4 bg-gray-700 rounded-lg">
              <div className="text-2xl font-bold text-yellow-400">
                {performanceMetrics.avg_retries.toFixed(2)}
              </div>
              <div className="text-sm text-gray-400">Avg Retries</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'versions' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Embedding Model Versions</h3>
          {versionStats.length === 0 ? (
            <div className="text-gray-400 text-center py-8">No version data available</div>
          ) : (
            <div className="space-y-2">
              {versionStats.map((version, idx) => (
                <div key={idx} className="p-4 bg-gray-700 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-medium">
                        {version.model_version || 'unknown'}
                      </div>
                      <div className="text-sm text-gray-400">
                        {version.workflow_count} workflows
                        {version.avg_quality_score && ` | Quality: ${version.avg_quality_score.toFixed(2)}`}
                      </div>
                    </div>
                    {version.last_updated && (
                      <div className="text-xs text-gray-400">
                        Last: {new Date(version.last_updated).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EmbeddingStatus;
