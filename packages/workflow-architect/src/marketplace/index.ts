/**
 * Workflow Marketplace
 *
 * A complete platform for sharing, discovering, and installing workflows.
 *
 * Features:
 * - Full-text and semantic search
 * - Category management with hierarchical structure
 * - Publisher profiles and verification
 * - Review and rating system with helpful voting
 * - One-click installation with dependency resolution
 * - Featured, trending, and personalized recommendations
 * - REST API with authentication
 *
 * @example
 * ```typescript
 * import { createMarketplaceAPI, ListingManager } from './marketplace';
 * import { createClient } from '@supabase/supabase-js';
 *
 * const supabase = createClient(url, key);
 * const router = createMarketplaceAPI(supabase);
 * app.use('/api/marketplace', router);
 * ```
 */

// Export types
export * from './types';

// Export managers
export { ListingManager } from './listings';
export { MarketplaceSearch } from './search';
export { CategoryManager } from './categories';
export { ReviewManager } from './reviews';
export { PublisherManager } from './publisher';
export { InstallationManager } from './installation';
export { FeaturedManager } from './featured';

// Export API
export { MarketplaceAPI, createMarketplaceAPI } from './api';
