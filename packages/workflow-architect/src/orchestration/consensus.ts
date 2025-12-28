/**
 * Consensus Decision Making
 * Enables multi-agent voting and conflict resolution
 */

import { v4 as uuid } from 'uuid';
import { type Agent, type Decision } from './types.js';

/**
 * Voting strategy types
 */
export enum VotingStrategy {
  MAJORITY = 'majority',
  UNANIMOUS = 'unanimous',
  WEIGHTED = 'weighted',
  SUPER_MAJORITY = 'super_majority', // 2/3
}

/**
 * Proposal for voting
 */
export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposedBy: string;
  options: string[];
  createdAt: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Vote cast by agent
 */
export interface Vote {
  agentId: string;
  choice: 'yes' | 'no' | 'abstain';
  weight?: number;
  reasoning?: string;
  timestamp: number;
}

/**
 * Consensus Manager Class
 */
export class ConsensusManager {
  private proposals: Map<string, Proposal>;
  private votes: Map<string, Vote[]>;
  private defaultTimeout: number;

  constructor(defaultTimeout = 30000) { // 30 seconds
    this.proposals = new Map();
    this.votes = new Map();
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Create a proposal
   */
  createProposal(
    title: string,
    description: string,
    proposedBy: string,
    options: string[] = ['approve', 'reject'],
    timeout?: number
  ): Proposal {
    const proposal: Proposal = {
      id: uuid(),
      title,
      description,
      proposedBy,
      options,
      createdAt: Date.now(),
      expiresAt: timeout ? Date.now() + timeout : Date.now() + this.defaultTimeout,
    };

    this.proposals.set(proposal.id, proposal);
    this.votes.set(proposal.id, []);

    console.log(`[Consensus] Created proposal: ${title}`);
    return proposal;
  }

  /**
   * Cast vote on proposal
   */
  castVote(
    proposalId: string,
    agentId: string,
    choice: 'yes' | 'no' | 'abstain',
    weight = 1,
    reasoning?: string
  ): void {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    // Check if already voted
    const existingVotes = this.votes.get(proposalId) || [];
    if (existingVotes.some(v => v.agentId === agentId)) {
      throw new Error(`Agent ${agentId} has already voted on proposal ${proposalId}`);
    }

    const vote: Vote = {
      agentId,
      choice,
      weight,
      reasoning,
      timestamp: Date.now(),
    };

    existingVotes.push(vote);
    this.votes.set(proposalId, existingVotes);

    console.log(`[Consensus] Agent ${agentId} voted ${choice} on proposal ${proposal.title}`);
  }

  /**
   * Conduct voting with specified strategy
   */
  async voting(
    agents: Agent[],
    proposal: Proposal,
    strategy: VotingStrategy = VotingStrategy.MAJORITY
  ): Promise<Decision> {
    console.log(`[Consensus] Starting ${strategy} voting for: ${proposal.title}`);

    // Wait for votes or timeout
    await this.waitForVotes(proposal.id, agents.length);

    const votes = this.votes.get(proposal.id) || [];
    const voteCounts = this.countVotes(votes);

    const decision = this.makeDecision(
      proposal,
      votes,
      voteCounts,
      agents.length,
      strategy
    );

    console.log(`[Consensus] Decision: ${decision.outcome} (${voteCounts.yes} yes, ${voteCounts.no} no, ${voteCounts.abstain} abstain)`);

    return decision;
  }

  /**
   * Majority vote - more than 50%
   */
  majorityVote(proposalId: string, totalAgents: number): Decision {
    return this.voting(
      Array(totalAgents).fill(null).map((_, i) => ({ id: `agent-${i}` })) as Agent[],
      this.proposals.get(proposalId)!,
      VotingStrategy.MAJORITY
    );
  }

  /**
   * Unanimous vote - 100% agreement
   */
  unanimousVote(proposalId: string, totalAgents: number): Decision {
    return this.voting(
      Array(totalAgents).fill(null).map((_, i) => ({ id: `agent-${i}` })) as Agent[],
      this.proposals.get(proposalId)!,
      VotingStrategy.UNANIMOUS
    );
  }

  /**
   * Weighted vote - considers agent weights
   */
  weightedVote(proposalId: string, agents: Agent[]): Decision {
    return this.voting(
      agents,
      this.proposals.get(proposalId)!,
      VotingStrategy.WEIGHTED
    );
  }

  /**
   * Get proposal status
   */
  getProposalStatus(proposalId: string): {
    proposal: Proposal;
    votes: Vote[];
    voteCounts: { yes: number; no: number; abstain: number };
  } | undefined {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      return undefined;
    }

    const votes = this.votes.get(proposalId) || [];
    const voteCounts = this.countVotes(votes);

    return { proposal, votes, voteCounts };
  }

  /**
   * Wait for votes with timeout
   */
  private async waitForVotes(proposalId: string, expectedVotes: number): Promise<void> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    const timeout = proposal.expiresAt || Date.now() + this.defaultTimeout;
    const checkInterval = 100;

    while (Date.now() < timeout) {
      const votes = this.votes.get(proposalId) || [];
      if (votes.length >= expectedVotes) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    console.log(`[Consensus] Voting timeout for proposal ${proposal.title}`);
  }

  /**
   * Count votes
   */
  private countVotes(votes: Vote[]): { yes: number; no: number; abstain: number } {
    return votes.reduce(
      (acc, vote) => {
        const weight = vote.weight || 1;
        acc[vote.choice] += weight;
        return acc;
      },
      { yes: 0, no: 0, abstain: 0 }
    );
  }

  /**
   * Make decision based on strategy
   */
  private makeDecision(
    proposal: Proposal,
    votes: Vote[],
    voteCounts: { yes: number; no: number; abstain: number },
    totalAgents: number,
    strategy: VotingStrategy
  ): Decision {
    let outcome: 'approved' | 'rejected' | 'deferred' = 'deferred';

    const totalVotes = voteCounts.yes + voteCounts.no + voteCounts.abstain;
    const yesPercentage = totalVotes > 0 ? voteCounts.yes / totalVotes : 0;

    switch (strategy) {
      case VotingStrategy.MAJORITY:
        outcome = yesPercentage > 0.5 ? 'approved' : 'rejected';
        break;

      case VotingStrategy.UNANIMOUS:
        outcome = voteCounts.yes === totalAgents && voteCounts.no === 0
          ? 'approved'
          : 'rejected';
        break;

      case VotingStrategy.SUPER_MAJORITY:
        outcome = yesPercentage >= 2/3 ? 'approved' : 'rejected';
        break;

      case VotingStrategy.WEIGHTED:
        // For weighted, use same as majority but with weights applied
        outcome = yesPercentage > 0.5 ? 'approved' : 'rejected';
        break;
    }

    const voteMap = new Map<string, 'yes' | 'no' | 'abstain'>();
    votes.forEach(v => voteMap.set(v.agentId, v.choice));

    return {
      id: uuid(),
      proposalId: proposal.id,
      outcome,
      votes: voteMap,
      voteCounts,
      requiredVotes: totalAgents,
      timestamp: Date.now(),
      metadata: {
        strategy,
        yesPercentage,
      },
    };
  }

  /**
   * Clean up old proposals
   */
  cleanup(): void {
    const now = Date.now();
    let deletedCount = 0;

    for (const [id, proposal] of this.proposals) {
      if (proposal.expiresAt && now > proposal.expiresAt) {
        this.proposals.delete(id);
        this.votes.delete(id);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[Consensus] Cleaned up ${deletedCount} expired proposals`);
    }
  }
}

/**
 * Create a consensus manager
 */
export function createConsensusManager(defaultTimeout?: number): ConsensusManager {
  return new ConsensusManager(defaultTimeout);
}
