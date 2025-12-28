/**
 * Content-Based Filtering
 *
 * Implements content-based filtering using workflow features, TF-IDF for text,
 * and category/tag matching to find similar workflows based on content.
 */

import type {
	Recommendation,
	RecommendationContext,
	WorkflowFeatures,
} from './types.js';

interface TFIDFVector {
	workflowId: string;
	vector: Map<string, number>;
}

interface WorkflowSimilarity {
	workflowId: string;
	similarity: number;
	matchingFeatures: string[];
}

export class ContentFilter {
	private featureCache: Map<string, WorkflowFeatures> = new Map();
	private tfidfCache: Map<string, TFIDFVector> = new Map();
	private idfScores: Map<string, number> = new Map();
	private cacheTimeout = 3600000; // 1 hour

	/**
	 * Generate content-based recommendations
	 */
	async recommend(context: RecommendationContext): Promise<Recommendation[]> {
		const { userId, currentWorkflow } = context;

		// Get user's workflow history
		const userWorkflows = await this.getUserWorkflows(userId);

		// If user is viewing a specific workflow, use it as reference
		const referenceWorkflows = currentWorkflow
			? [currentWorkflow]
			: userWorkflows.slice(-5); // Use last 5 workflows

		if (referenceWorkflows.length === 0) {
			return []; // No reference for content-based filtering
		}

		// Extract features for reference workflows
		const referenceFeatures = await Promise.all(
			referenceWorkflows.map((id) => this.extractFeatures(id)),
		);

		// Find similar workflows
		const similar = await this.findSimilarWorkflows(referenceFeatures, userWorkflows);

		// Convert to recommendations
		return similar.map((item) => ({
			id: this.generateRecommendationId(),
			workflowId: item.workflowId,
			type: 'similar' as const,
			score: item.similarity,
			reason: this.generateReason(item.matchingFeatures),
			confidence: this.calculateConfidence(item.similarity, item.matchingFeatures),
			metadata: {
				matchingFeatures: item.matchingFeatures,
				similarity: item.similarity,
			},
			createdAt: new Date().toISOString(),
		}));
	}

	/**
	 * Extract features from a workflow
	 */
	async extractFeatures(workflowId: string): Promise<WorkflowFeatures> {
		// Check cache first
		const cached = this.featureCache.get(workflowId);
		if (cached) {
			return cached;
		}

		// Fetch workflow data
		const workflow = await this.fetchWorkflow(workflowId);

		// Extract features
		const features: WorkflowFeatures = {
			workflowId,
			category: workflow.category ?? 'general',
			tags: workflow.tags ?? [],
			complexity: this.inferComplexity(workflow),
			nodeTypes: this.extractNodeTypes(workflow),
			nodeCount: workflow.nodes?.length ?? 0,
			connectionCount: this.countConnections(workflow),
			textFeatures: await this.extractTextFeatures(workflow),
			embedding: undefined, // Could use embeddings in production
			popularity: workflow.popularity ?? 0,
			rating: workflow.rating ?? 0,
			extractedAt: new Date().toISOString(),
		};

		// Cache features
		this.featureCache.set(workflowId, features);
		setTimeout(() => this.featureCache.delete(workflowId), this.cacheTimeout);

		return features;
	}

	/**
	 * Compute similarity between two workflows
	 */
	computeSimilarity(a: WorkflowFeatures, b: WorkflowFeatures): number {
		// Multiple similarity metrics
		const categorySim = a.category === b.category ? 1 : 0;
		const tagSim = this.jaccardSimilarity(a.tags, b.tags);
		const nodeTypeSim = this.jaccardSimilarity(a.nodeTypes, b.nodeTypes);
		const complexitySim = this.complexitySimilarity(a.complexity, b.complexity);
		const textSim = this.cosineSimilarity(a.textFeatures, b.textFeatures);

		// Weighted combination
		const weights = {
			category: 0.25,
			tags: 0.2,
			nodeTypes: 0.3,
			complexity: 0.1,
			text: 0.15,
		};

		return (
			categorySim * weights.category +
			tagSim * weights.tags +
			nodeTypeSim * weights.nodeTypes +
			complexitySim * weights.complexity +
			textSim * weights.text
		);
	}

	/**
	 * Find similar workflows to a set of reference workflows
	 */
	private async findSimilarWorkflows(
		referenceFeatures: WorkflowFeatures[],
		excludeIds: string[],
	): Promise<WorkflowSimilarity[]> {
		const excludeSet = new Set(excludeIds);

		// Get all candidate workflows
		const candidates = await this.getAllWorkflows();

		const similarities: WorkflowSimilarity[] = [];

		for (const candidate of candidates) {
			if (excludeSet.has(candidate.id)) continue;

			const candidateFeatures = await this.extractFeatures(candidate.id);

			// Calculate similarity to each reference
			let maxSimilarity = 0;
			let bestMatchingFeatures: string[] = [];

			for (const reference of referenceFeatures) {
				const similarity = this.computeSimilarity(reference, candidateFeatures);

				if (similarity > maxSimilarity) {
					maxSimilarity = similarity;
					bestMatchingFeatures = this.getMatchingFeatures(reference, candidateFeatures);
				}
			}

			if (maxSimilarity > 0.3) {
				// Threshold for relevance
				similarities.push({
					workflowId: candidate.id,
					similarity: maxSimilarity,
					matchingFeatures: bestMatchingFeatures,
				});
			}
		}

		return similarities.sort((a, b) => b.similarity - a.similarity);
	}

	/**
	 * Extract text features using TF-IDF
	 */
	private async extractTextFeatures(workflow: any): Promise<number[]> {
		// Combine all text fields
		const text = [
			workflow.name ?? '',
			workflow.description ?? '',
			...(workflow.tags ?? []),
		].join(' ');

		// Tokenize
		const tokens = this.tokenize(text);

		// Get TF-IDF vector
		const tfidf = await this.calculateTFIDF(workflow.id, tokens);

		// Convert to dense vector (top 100 terms)
		const topTerms = Array.from(tfidf.vector.entries())
			.sort((a, b) => b[1] - a[1])
			.slice(0, 100);

		return topTerms.map(([_, score]) => score);
	}

	/**
	 * Calculate TF-IDF for a document
	 */
	private async calculateTFIDF(
		workflowId: string,
		tokens: string[],
	): Promise<TFIDFVector> {
		// Calculate term frequency
		const tf = new Map<string, number>();
		for (const token of tokens) {
			tf.set(token, (tf.get(token) ?? 0) + 1);
		}

		// Normalize by document length
		const totalTerms = tokens.length;
		for (const [term, count] of tf) {
			tf.set(term, count / totalTerms);
		}

		// Calculate TF-IDF
		const tfidf = new Map<string, number>();
		for (const [term, tfScore] of tf) {
			const idf = await this.getIDF(term);
			tfidf.set(term, tfScore * idf);
		}

		const vector: TFIDFVector = { workflowId, vector: tfidf };
		this.tfidfCache.set(workflowId, vector);

		return vector;
	}

	/**
	 * Get IDF score for a term
	 */
	private async getIDF(term: string): Promise<number> {
		// Check cache
		if (this.idfScores.has(term)) {
			return this.idfScores.get(term)!;
		}

		// Calculate IDF: log(N / df)
		// Where N = total documents, df = documents containing term
		const totalDocs = await this.getTotalDocumentCount();
		const docFreq = await this.getDocumentFrequency(term);

		const idf = Math.log((totalDocs + 1) / (docFreq + 1)); // Add 1 to avoid division by zero

		this.idfScores.set(term, idf);
		return idf;
	}

	/**
	 * Tokenize text
	 */
	private tokenize(text: string): string[] {
		return text
			.toLowerCase()
			.replace(/[^\w\s]/g, ' ')
			.split(/\s+/)
			.filter((token) => token.length > 2); // Remove short tokens
	}

	/**
	 * Calculate Jaccard similarity
	 */
	private jaccardSimilarity(set1: string[], set2: string[]): number {
		const s1 = new Set(set1);
		const s2 = new Set(set2);

		const intersection = new Set([...s1].filter((x) => s2.has(x)));
		const union = new Set([...s1, ...s2]);

		return union.size === 0 ? 0 : intersection.size / union.size;
	}

	/**
	 * Calculate cosine similarity
	 */
	private cosineSimilarity(a: number[], b: number[]): number {
		if (a.length === 0 || b.length === 0) return 0;

		const minLength = Math.min(a.length, b.length);

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < minLength; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		const denominator = Math.sqrt(normA) * Math.sqrt(normB);
		return denominator === 0 ? 0 : dotProduct / denominator;
	}

	/**
	 * Calculate complexity similarity
	 */
	private complexitySimilarity(c1: string, c2: string): number {
		const levels = ['beginner', 'intermediate', 'advanced', 'expert'];
		const diff = Math.abs(levels.indexOf(c1) - levels.indexOf(c2));
		return 1 - diff / (levels.length - 1);
	}

	/**
	 * Get matching features between two workflows
	 */
	private getMatchingFeatures(a: WorkflowFeatures, b: WorkflowFeatures): string[] {
		const features: string[] = [];

		if (a.category === b.category) {
			features.push(`category:${a.category}`);
		}

		const commonTags = a.tags.filter((t) => b.tags.includes(t));
		features.push(...commonTags.map((t) => `tag:${t}`));

		const commonNodes = a.nodeTypes.filter((n) => b.nodeTypes.includes(n));
		features.push(...commonNodes.slice(0, 3).map((n) => `node:${n}`));

		if (a.complexity === b.complexity) {
			features.push(`complexity:${a.complexity}`);
		}

		return features;
	}

	/**
	 * Generate reason text from matching features
	 */
	private generateReason(features: string[]): string {
		if (features.length === 0) {
			return 'Similar workflow structure';
		}

		const categories = features.filter((f) => f.startsWith('category:'));
		const tags = features.filter((f) => f.startsWith('tag:'));
		const nodes = features.filter((f) => f.startsWith('node:'));

		const parts = [];
		if (categories.length > 0) {
			parts.push(`same category`);
		}
		if (tags.length > 0) {
			parts.push(`similar tags`);
		}
		if (nodes.length > 0) {
			parts.push(`uses similar nodes`);
		}

		return parts.length > 0
			? `Matches your workflow: ${parts.join(', ')}`
			: 'Similar workflow structure';
	}

	/**
	 * Calculate confidence based on similarity and features
	 */
	private calculateConfidence(similarity: number, features: string[]): number {
		const featureBonus = Math.min(features.length / 5, 0.3);
		return Math.min(similarity + featureBonus, 1);
	}

	/**
	 * Infer workflow complexity
	 */
	private inferComplexity(workflow: any): 'beginner' | 'intermediate' | 'advanced' | 'expert' {
		const nodeCount = workflow.nodes?.length ?? 0;

		if (nodeCount <= 3) return 'beginner';
		if (nodeCount <= 7) return 'intermediate';
		if (nodeCount <= 15) return 'advanced';
		return 'expert';
	}

	/**
	 * Extract node types from workflow
	 */
	private extractNodeTypes(workflow: any): string[] {
		return workflow.nodes?.map((node: any) => node.type) ?? [];
	}

	/**
	 * Count connections in workflow
	 */
	private countConnections(workflow: any): number {
		if (!workflow.connections) return 0;

		let count = 0;
		for (const node of Object.values(workflow.connections)) {
			for (const outputs of Object.values(node as any)) {
				count += (outputs as any[]).length;
			}
		}
		return count;
	}

	/**
	 * Fetch workflow data
	 */
	private async fetchWorkflow(workflowId: string): Promise<any> {
		// In real implementation, fetch from database
		return {
			id: workflowId,
			name: '',
			description: '',
			category: 'general',
			tags: [],
			nodes: [],
			connections: {},
			popularity: 0,
			rating: 0,
		};
	}

	/**
	 * Get user's workflows
	 */
	private async getUserWorkflows(userId: string): Promise<string[]> {
		// In real implementation, query database
		return [];
	}

	/**
	 * Get all workflows
	 */
	private async getAllWorkflows(): Promise<Array<{ id: string }>> {
		// In real implementation, query database
		return [];
	}

	/**
	 * Get total document count
	 */
	private async getTotalDocumentCount(): Promise<number> {
		// In real implementation, query database
		return 1000;
	}

	/**
	 * Get document frequency for a term
	 */
	private async getDocumentFrequency(term: string): Promise<number> {
		// In real implementation, query database
		return 10;
	}

	/**
	 * Generate unique recommendation ID
	 */
	private generateRecommendationId(): string {
		return `rec_content_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}
}
