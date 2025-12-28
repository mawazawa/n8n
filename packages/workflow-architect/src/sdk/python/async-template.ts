/**
 * Python async SDK client code generator
 * Generates async/await Python client with connection pooling
 */

/**
 * Generate async Python SDK client code
 * Integration: const pythonAsyncCode = generatePythonAsyncClient();
 */
export function generatePythonAsyncClient(): string {
	return `"""
Workflow Architect Python Async SDK
Async client with connection pooling and streaming
"""

from typing import Optional, List, Dict, Any, AsyncGenerator
from datetime import datetime
from pydantic import BaseModel
import httpx


class AsyncWorkflowArchitectClient:
    """Async client for Workflow Architect API"""

    def __init__(self, base_url: str, api_key: Optional[str] = None):
        self.base_url = base_url
        self.api_key = api_key
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers=headers,
            timeout=30.0,
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10)
        )
        return self

    async def __aexit__(self, *args):
        if self._client:
            await self._client.aclose()

    async def get_workflow(self, workflow_id: str) -> Dict[str, Any]:
        """Get a workflow by ID"""
        response = await self._client.get(f"/workflows/{workflow_id}")
        response.raise_for_status()
        return response.json()

    async def list_workflows(self, limit: int = 20) -> List[Dict[str, Any]]:
        """List all workflows"""
        response = await self._client.get("/workflows", params={"limit": limit})
        response.raise_for_status()
        return response.json()["items"]

    async def stream_execution_events(self, execution_id: str) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream execution events using SSE"""
        async with self._client.stream("GET", f"/executions/{execution_id}/stream") as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    yield {"data": line[6:]}
`;
}
