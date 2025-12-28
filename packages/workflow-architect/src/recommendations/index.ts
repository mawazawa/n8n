/**
 * Workflow Recommendations System
 *
 * Comprehensive recommendation engine for workflow discovery with collaborative
 * filtering, content-based filtering, contextual recommendations, and A/B testing.
 *
 * @packageDocumentation
 */

// Main engine
export { RecommendationEngine } from './engine.js';

// Recommendation strategies
export { CollaborativeFilter } from './collaborative.js';
export { ContentFilter } from './content.js';
export { HybridRecommender } from './hybrid.js';
export { ContextualRecommender } from './context.js';
export { TrendingCalculator } from './trending.js';

// Personalization and optimization
export { PersonalizationEngine } from './personalization.js';
export { DiversityOptimizer } from './diversity.js';
export { ExplanationBuilder } from './explanation.js';

// Feedback and testing
export { FeedbackProcessor } from './feedback.js';
export { ABTestManager } from './ab-testing.js';

// API
export { RecommendationsAPI, createRecommendationsAPI } from './api.js';

// Types
export type {
	Recommendation,
	RecommendationType,
	FeedbackType,
	ComplexityLevel,
	UserPreference,
	UsagePattern,
	RecommendationContext,
	RecentActivity,
	FeedbackSignal,
	WorkflowFeatures,
	UserProfile,
	UserInteraction,
	RecommendationExplanation,
	SimilarUser,
	TrendingWorkflow,
	RecommendationStrategy,
	RecommendationRequest,
	RecommendationResponse,
	ABExperiment,
	ABVariant,
	ABAssignment,
	ABMetric,
	DiversityConfig,
	RecommendationScore,
} from './types.js';
