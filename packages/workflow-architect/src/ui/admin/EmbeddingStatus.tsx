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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const headers = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      };

      // Fetch counts for each status
      const [pending, processing, completed, failed, nodeChunks] = await Promise.all([
        fetch(
          `${supabaseUrl}/rest/v1/workflow_examples?embedding_status=eq.pending&select=id`,
          { headers },
        ).then((r) => r.json()),
        fetch(
          `${supabaseUrl}/rest/v1/workflow_examples?embedding_status=eq.processing&select=id`,
          { headers },
        ).then((r) => r.json()),
        fetch(
          `${supabaseUrl}/rest/v1/workflow_examples?embedding_status=eq.completed&select=id`,
          { headers },
        ).then((r) => r.json()),
        fetch(
          `${supabaseUrl}/rest/v1/workflow_examples?embedding_status=eq.failed&select=id,name,created_at`,
          { headers },
        ).then((r) => r.json()),
        fetch(`${supabaseUrl}/rest/v1/workflow_node_chunks?select=id`, { headers }).then((r) =>
          r.json(),
        ),
      ]);

      setStats({
        totalWorkflows: pending.length + processing.length + completed.length + failed.length,
        totalNodeChunks: nodeChunks.length,
        pendingEmbeddings: pending.length,
        processingEmbeddings: processing.length,
        completedEmbeddings: completed.length,
        failedEmbeddings: failed.length,
      });

      setFailedWorkflows(failed);
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

      {/* Node Chunks */}
      <div className="p-4 bg-gray-700 rounded-lg">
        <div className="text-2xl font-bold text-blue-400">{stats.totalNodeChunks}</div>
        <div className="text-sm text-gray-400">Node Chunks (Fine-grained embeddings)</div>
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
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {failedWorkflows.map((workflow) => (
              <div
                key={workflow.id}
                className="flex items-center justify-between p-3 bg-gray-700 rounded"
              >
                <div>
                  <div className="text-white">{workflow.name}</div>
                  <div className="text-xs text-gray-400">
                    {new Date(workflow.created_at).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => retryWorkflow(workflow.id)}
                  disabled={retrying === workflow.id}
                  className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 rounded text-white text-sm"
                >
                  {retrying === workflow.id ? 'Retrying...' : 'Retry'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default EmbeddingStatus;
