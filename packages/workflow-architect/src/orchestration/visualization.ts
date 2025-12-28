/**
 * Visualization Builder
 * Creates visual representations of team interactions and execution
 */

import {
  type GraphData,
  type TimelineData,
  type AgentTeam,
  type ExecutionPlan,
  type TaskAssignment,
  type AgentMessage,
} from './types.js';

/**
 * Visualization Builder Class
 */
export class VisualizationBuilder {
  /**
   * Build interaction graph from team
   */
  buildInteractionGraph(
    team: AgentTeam,
    messages: AgentMessage[]
  ): GraphData {
    const nodes = team.agents.map(agent => ({
      id: agent.id,
      label: agent.name,
      type: agent.role,
      metadata: {
        workload: agent.workload,
        status: agent.status,
        specializations: agent.capabilities.specializations,
      },
    }));

    // Build edges from message interactions
    const edgeMap = new Map<string, number>();

    for (const message of messages) {
      const key = `${message.fromAgentId}->${message.toAgentId}`;
      edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
    }

    const edges = Array.from(edgeMap.entries()).map(([key, count]) => {
      const [from, to] = key.split('->');
      return {
        from,
        to,
        label: `${count} messages`,
        metadata: { count },
      };
    });

    return { nodes, edges };
  }

  /**
   * Build execution timeline
   */
  buildTimeline(
    assignments: TaskAssignment[],
    messages: AgentMessage[]
  ): TimelineData {
    const events: TimelineData['events'] = [];

    // Add task assignment events
    for (const assignment of assignments) {
      events.push({
        id: `assignment-${assignment.id}`,
        timestamp: assignment.assignedAt,
        agentId: assignment.agentId,
        taskId: assignment.taskId,
        type: 'task_assigned',
        description: `Task assigned to agent`,
        metadata: { assignment },
      });
    }

    // Add message events
    for (const message of messages) {
      events.push({
        id: `message-${message.id}`,
        timestamp: message.timestamp,
        agentId: message.fromAgentId,
        type: `message_${message.type}`,
        description: `${message.type} from ${message.fromAgentId} to ${message.toAgentId}`,
        metadata: { message },
      });
    }

    // Sort by timestamp
    events.sort((a, b) => a.timestamp - b.timestamp);

    const timestamps = events.map(e => e.timestamp);
    const range = {
      start: timestamps.length > 0 ? Math.min(...timestamps) : Date.now(),
      end: timestamps.length > 0 ? Math.max(...timestamps) : Date.now(),
    };

    return { events, range };
  }

  /**
   * Build dependency graph visualization
   */
  buildDependencyGraph(plan: ExecutionPlan): GraphData {
    const nodes = plan.tasks.map(task => ({
      id: task.id,
      label: task.name,
      type: task.type,
      metadata: {
        priority: task.priority,
        status: task.status,
        estimatedDuration: task.estimatedDuration,
      },
    }));

    const edges = plan.graph.edges.map(edge => ({
      from: edge.from,
      to: edge.to,
      label: 'depends on',
      metadata: {},
    }));

    return { nodes, edges };
  }

  /**
   * Build workload heatmap data
   */
  buildWorkloadHeatmap(
    team: AgentTeam,
    timeSeriesData: Array<{ timestamp: number; agentWorkloads: Map<string, number> }>
  ): {
    agents: string[];
    timestamps: number[];
    data: number[][];
  } {
    const agents = team.agents.map(a => a.name);
    const timestamps = timeSeriesData.map(d => d.timestamp);

    const data: number[][] = [];

    for (const agent of team.agents) {
      const agentData = timeSeriesData.map(d =>
        d.agentWorkloads.get(agent.id) || 0
      );
      data.push(agentData);
    }

    return { agents, timestamps, data };
  }

  /**
   * Export to JSON
   */
  exportToJSON(data: GraphData | TimelineData): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Export graph to SVG
   */
  exportToSVG(graph: GraphData, options: {
    width?: number;
    height?: number;
    nodeRadius?: number;
  } = {}): string {
    const width = options.width || 800;
    const height = options.height || 600;
    const nodeRadius = options.nodeRadius || 30;

    // Simple force-directed layout (simplified)
    const positions = this.calculateLayout(graph, width, height);

    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;

    // Draw edges
    for (const edge of graph.edges) {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);

      if (from && to) {
        svg += `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#999" stroke-width="2"/>`;
      }
    }

    // Draw nodes
    for (const node of graph.nodes) {
      const pos = positions.get(node.id);

      if (pos) {
        const color = this.getNodeColor(node.type);
        svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${nodeRadius}" fill="${color}" stroke="#333" stroke-width="2"/>`;
        svg += `<text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="12">${node.label}</text>`;
      }
    }

    svg += '</svg>';

    return svg;
  }

  /**
   * Export timeline to SVG
   */
  exportTimelineToSVG(timeline: TimelineData, options: {
    width?: number;
    height?: number;
  } = {}): string {
    const width = options.width || 1000;
    const height = options.height || 400;

    const { start, end } = timeline.range;
    const duration = end - start;

    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;

    // Draw timeline axis
    svg += `<line x1="50" y1="${height - 50}" x2="${width - 50}" y2="${height - 50}" stroke="#333" stroke-width="2"/>`;

    // Draw events
    const agents = new Set(timeline.events.map(e => e.agentId));
    const agentY = new Map(Array.from(agents).map((id, i) => [id, 50 + i * 40]));

    for (const event of timeline.events) {
      const x = 50 + ((event.timestamp - start) / duration) * (width - 100);
      const y = agentY.get(event.agentId) || 50;

      const color = this.getEventColor(event.type);
      svg += `<circle cx="${x}" cy="${y}" r="5" fill="${color}"/>`;
      svg += `<title>${event.description}</title>`;
    }

    // Draw agent labels
    for (const [agentId, y] of agentY) {
      svg += `<text x="10" y="${y}" font-size="12">${agentId}</text>`;
    }

    svg += '</svg>';

    return svg;
  }

  /**
   * Calculate simple circular layout
   */
  private calculateLayout(
    graph: GraphData,
    width: number,
    height: number
  ): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    graph.nodes.forEach((node, index) => {
      const angle = (2 * Math.PI * index) / graph.nodes.length;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      positions.set(node.id, { x, y });
    });

    return positions;
  }

  /**
   * Get color for node type
   */
  private getNodeColor(type: string): string {
    const colors: Record<string, string> = {
      coordinator: '#4CAF50',
      specialist: '#2196F3',
      supervisor: '#FF9800',
      worker: '#9E9E9E',
    };

    return colors[type] || '#757575';
  }

  /**
   * Get color for event type
   */
  private getEventColor(type: string): string {
    const colors: Record<string, string> = {
      task_assigned: '#4CAF50',
      task_started: '#2196F3',
      task_completed: '#8BC34A',
      task_failed: '#F44336',
      message_request: '#9C27B0',
      message_response: '#673AB7',
    };

    return colors[type] || '#757575';
  }

  /**
   * Generate Mermaid diagram
   */
  generateMermaidDiagram(graph: GraphData): string {
    let mermaid = 'graph LR\n';

    // Add nodes
    for (const node of graph.nodes) {
      const shape = node.type === 'coordinator' ? '([' : node.type === 'supervisor' ? '{{' : '[';
      const endShape = node.type === 'coordinator' ? '])' : node.type === 'supervisor' ? '}}' : ']';
      mermaid += `  ${node.id}${shape}${node.label}${endShape}\n`;
    }

    // Add edges
    for (const edge of graph.edges) {
      const label = edge.label ? `|${edge.label}|` : '';
      mermaid += `  ${edge.from} --${label}--> ${edge.to}\n`;
    }

    return mermaid;
  }
}

/**
 * Create a visualization builder
 */
export function createVisualizationBuilder(): VisualizationBuilder {
  return new VisualizationBuilder();
}
