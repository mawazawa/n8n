/**
 * Python SDK client code generator
 * Generates type-safe Python client with httpx
 */

/**
 * Generate Python SDK client code
 * Integration: const pythonCode = generatePythonClient();
 */
export function generatePythonClient(): string {
	return `"""
Workflow Architect Python SDK
Type-safe client with Pydantic models and httpx
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
import httpx


class SDKConfig(BaseModel):
    base_url: str = "http://localhost:3000"
    api_key: Optional[str] = None
    timeout: int = 30


class Workflow(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    nodes: List[Dict[str, Any]]
    connections: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


class Execution(BaseModel):
    id: str
    workflow_id: str
    status: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    input: Dict[str, Any]
    output: Optional[Dict[str, Any]] = None


class WorkflowArchitectClient:
    """Main client for Workflow Architect API"""

    def __init__(self, config: SDKConfig):
        self.config = config
        self.client = httpx.Client(
            base_url=config.base_url,
            timeout=config.timeout,
            headers=self._build_headers()
        )

    def _build_headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return headers

    def get_workflow(self, workflow_id: str) -> Workflow:
        """Get a workflow by ID"""
        response = self.client.get(f"/workflows/{workflow_id}")
        response.raise_for_status()
        return Workflow(**response.json())

    def list_workflows(self, limit: int = 20) -> List[Workflow]:
        """List all workflows"""
        response = self.client.get("/workflows", params={"limit": limit})
        response.raise_for_status()
        return [Workflow(**w) for w in response.json()["items"]]

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.client.close()
`;
}
