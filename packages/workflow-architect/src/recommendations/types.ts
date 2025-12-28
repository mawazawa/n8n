/**
 * Recommendation System Type Definitions
 *
 * Defines core types for the workflow recommendation engine including
 * recommendations, user preferences, context, and feedback signals.
 */

export type RecommendationType = 'similar' | 'complementary' | 'trending' | 'personalized';
export type FeedbackType = 'click' | 'save' | 'use' | 'dismiss' | 'rate' | 'view' | 'time_spent';
export type ComplexityLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface Recommendation {
	id: string;
	workflowId: string;
	type: RecommendationType;
	score: number;
	reason: string;
	confidence: number;
	metadata: Record<string, unknown>;
	createdAt: string;
}

export interface UserPreference {
	userId: string;
	categories: string[];
	tags: string[];
	complexity: ComplexityLevel;
	usagePatterns: UsagePattern[];
	explicitPreferences: Record<string, number>;
	implicitPreferences: Record<string, number>;
	updatedAt: string;
}

export interface UsagePattern {
	category: string;
	frequency: number;
	recency: number;
	duration: number;
	successRate: number;
}

export interface RecommendationContext {
	userId: string;
	currentWorkflow?: string;
	recentActivity: RecentActivity[];
	timeOfDay: number;
	dayOfWeek: number;
	userTier: 'free' | 'premium' | 'enterprise';
	location?: string;
}

export interface RecentActivity {
	workflowId: string;
	action: 'view' | 'edit' | 'execute' | 'save' | 'share';
	timestamp: string;
	duration?: number;
}

export interface FeedbackSignal {
	userId: string;
	recommendationId: string;
	workflowId: string;
	type: FeedbackType;
	value?: number;
	timestamp: string;
	context: Record<string, unknown>;
}

export interface WorkflowFeatures {
	workflowId: string;
	category: string;
	tags: string[];
	complexity: ComplexityLevel;
	nodeTypes: string[];
	nodeCount: number;
	connectionCount: number;
	textFeatures: number[];
	embedding?: number[];
	popularity: number;
	rating: number;
	extractedAt: string;
}

export interface UserProfile {
	userId: string;
	preferences: UserPreference;
	interactionHistory: UserInteraction[];
	segmentations: string[];
	cohort?: string;
	createdAt: string;
	updatedAt: string;
}

export interface UserInteraction {
	workflowId: string;
	type: FeedbackType;
	timestamp: string;
	value?: number;
	context: Record<string, unknown>;
}

export interface RecommendationExplanation {
	recommendationId: string;
	primaryReason: string;
	supportingReasons: string[];
	transparency: number;
	userFacing: string;
}

export interface SimilarUser {
	userId: string;
	similarity: number;
	commonWorkflows: string[];
	commonCategories: string[];
}

export interface TrendingWorkflow {
	workflowId: string;
	trendingScore: number;
	velocity: number;
	recentViews: number;
	recentUses: number;
	growthRate: number;
	category: string;
	calculatedAt: string;
}

export interface RecommendationStrategy {
	name: string;
	weight: number;
	enabled: boolean;
	config: Record<string, unknown>;
}

export interface RecommendationRequest {
	userId: string;
	context?: Partial<RecommendationContext>;
	strategies?: string[];
	limit?: number;
	excludeWorkflows?: string[];
}

export interface RecommendationResponse {
	recommendations: Recommendation[];
	explanations: Map<string, RecommendationExplanation>;
	requestId: string;
	generatedAt: string;
	performanceMs: number;
}

export interface ABExperiment {
	id: string;
	name: string;
	description: string;
	variants: ABVariant[];
	startDate: string;
	endDate?: string;
	status: 'draft' | 'active' | 'paused' | 'completed';
	targetMetric: string;
	sampleSize: number;
	createdAt: string;
}

export interface ABVariant {
	id: string;
	name: string;
	description: string;
	config: Record<string, unknown>;
	weight: number;
	conversions: number;
	impressions: number;
}

export interface ABAssignment {
	userId: string;
	experimentId: string;
	variantId: string;
	assignedAt: string;
}

export interface ABMetric {
	experimentId: string;
	variantId: string;
	metric: string;
	value: number;
	count: number;
	updatedAt: string;
}

export interface DiversityConfig {
	categoryThreshold: number;
	typeThreshold: number;
	noveltyWeight: number;
	minNovelty: number;
}

export interface RecommendationScore {
	workflowId: string;
	baseScore: number;
	diversityBonus: number;
	noveltyBonus: number;
	contextBonus: number;
	finalScore: number;
	components: Record<string, number>;
}
