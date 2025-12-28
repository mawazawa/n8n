/**
 * Marketplace API
 *
 * REST API endpoints for the workflow marketplace with authentication
 * and rate limiting.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { ListingManager } from './listings';
import { MarketplaceSearch } from './search';
import { CategoryManager } from './categories';
import { ReviewManager } from './reviews';
import { PublisherManager } from './publisher';
import { InstallationManager } from './installation';
import { FeaturedManager } from './featured';

interface AuthRequest extends Request {
  userId?: string;
}

export class MarketplaceAPI {
  private readonly router: Router;
  private readonly listingManager: ListingManager;
  private readonly searchManager: MarketplaceSearch;
  private readonly categoryManager: CategoryManager;
  private readonly reviewManager: ReviewManager;
  private readonly publisherManager: PublisherManager;
  private readonly installationManager: InstallationManager;
  private readonly featuredManager: FeaturedManager;

  constructor(private readonly supabase: SupabaseClient) {
    this.router = Router();
    this.listingManager = new ListingManager(supabase);
    this.searchManager = new MarketplaceSearch(supabase);
    this.categoryManager = new CategoryManager(supabase);
    this.reviewManager = new ReviewManager(supabase);
    this.publisherManager = new PublisherManager(supabase);
    this.installationManager = new InstallationManager(supabase);
    this.featuredManager = new FeaturedManager(supabase);

    this.setupRoutes();
  }

  /**
   * Get Express router
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Setup all API routes
   */
  private setupRoutes(): void {
    // ========================================================================
    // Public Routes
    // ========================================================================

    // Search and discovery
    this.router.get('/search', this.handleSearch.bind(this));
    this.router.get('/suggest', this.handleSuggest.bind(this));
    this.router.get('/featured', this.handleGetFeatured.bind(this));
    this.router.get('/trending', this.handleGetTrending.bind(this));
    this.router.get('/popular', this.handleGetPopular.bind(this));
    this.router.get('/new', this.handleGetNew.bind(this));
    this.router.get('/top-rated', this.handleGetTopRated.bind(this));

    // Listings
    this.router.get('/listings', this.handleGetListings.bind(this));
    this.router.get('/listings/:id', this.handleGetListing.bind(this));
    this.router.get('/listings/:id/related', this.handleGetRelated.bind(this));

    // Categories
    this.router.get('/categories', this.handleGetCategories.bind(this));
    this.router.get('/categories/tree', this.handleGetCategoryTree.bind(this));
    this.router.get('/categories/:id', this.handleGetCategory.bind(this));
    this.router.get('/categories/:id/listings', this.handleGetCategoryListings.bind(this));

    // Reviews
    this.router.get('/listings/:id/reviews', this.handleGetReviews.bind(this));
    this.router.get('/listings/:id/reviews/stats', this.handleGetReviewStats.bind(this));

    // Publishers
    this.router.get('/publishers', this.handleGetPublishers.bind(this));
    this.router.get('/publishers/:id', this.handleGetPublisher.bind(this));
    this.router.get('/publishers/:id/listings', this.handleGetPublisherListings.bind(this));

    // ========================================================================
    // Authenticated Routes
    // ========================================================================

    // Publisher management
    this.router.post('/publishers', this.authMiddleware.bind(this), this.handleRegisterPublisher.bind(this));
    this.router.put('/publishers/:id', this.authMiddleware.bind(this), this.handleUpdatePublisher.bind(this));
    this.router.get('/publishers/:id/analytics', this.authMiddleware.bind(this), this.handleGetPublisherAnalytics.bind(this));

    // Listing management
    this.router.post('/listings', this.authMiddleware.bind(this), this.handleCreateListing.bind(this));
    this.router.put('/listings/:id', this.authMiddleware.bind(this), this.handleUpdateListing.bind(this));
    this.router.post('/listings/:id/publish', this.authMiddleware.bind(this), this.handlePublishListing.bind(this));
    this.router.post('/listings/:id/unpublish', this.authMiddleware.bind(this), this.handleUnpublishListing.bind(this));
    this.router.delete('/listings/:id', this.authMiddleware.bind(this), this.handleDeleteListing.bind(this));

    // Reviews
    this.router.post('/listings/:id/reviews', this.authMiddleware.bind(this), this.handleAddReview.bind(this));
    this.router.put('/reviews/:id', this.authMiddleware.bind(this), this.handleUpdateReview.bind(this));
    this.router.delete('/reviews/:id', this.authMiddleware.bind(this), this.handleDeleteReview.bind(this));
    this.router.post('/reviews/:id/vote', this.authMiddleware.bind(this), this.handleVoteReview.bind(this));

    // Installations
    this.router.post('/listings/:id/install', this.authMiddleware.bind(this), this.handleInstall.bind(this));
    this.router.delete('/listings/:id/uninstall', this.authMiddleware.bind(this), this.handleUninstall.bind(this));
    this.router.get('/installations', this.authMiddleware.bind(this), this.handleGetInstallations.bind(this));
    this.router.get('/installations/updates', this.authMiddleware.bind(this), this.handleCheckUpdates.bind(this));

    // Personalized recommendations
    this.router.get('/recommended', this.authMiddleware.bind(this), this.handleGetRecommended.bind(this));
    this.router.get('/homepage', this.optionalAuthMiddleware.bind(this), this.handleGetHomepage.bind(this));
  }

  // ==========================================================================
  // Middleware
  // ==========================================================================

  private async authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { data, error } = await this.supabase.auth.getUser(token);
      if (error || !data.user) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }

      req.userId = data.user.id;
      next();
    } catch (error) {
      res.status(500).json({ error: 'Authentication failed' });
    }
  }

  private async optionalAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (token) {
        const { data } = await this.supabase.auth.getUser(token);
        if (data.user) {
          req.userId = data.user.id;
        }
      }
      next();
    } catch {
      next();
    }
  }

  // ==========================================================================
  // Search & Discovery Handlers
  // ==========================================================================

  private async handleSearch(req: Request, res: Response): Promise<void> {
    try {
      const query = req.query.q as string ?? '';
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      const filters = {
        category: req.query.category as string,
        pricing: req.query.pricing ? (req.query.pricing as string).split(',') : undefined,
        minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      };

      const sort = {
        field: (req.query.sortBy as string) || 'relevance',
        direction: (req.query.sortDir as 'asc' | 'desc') || 'desc',
      };

      const result = await this.searchManager.search(query, { filters, sort, page, pageSize });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleSuggest(req: Request, res: Response): Promise<void> {
    try {
      const partial = req.query.q as string;
      const suggestions = await this.searchManager.suggest(partial);
      res.json({ suggestions });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleGetFeatured(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const featured = await this.featuredManager.getFeatured(limit);
      res.json(featured);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleGetTrending(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const trending = await this.featuredManager.getTrending(limit);
      res.json(trending);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleGetPopular(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const popular = await this.featuredManager.getPopular(limit);
      res.json(popular);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleGetNew(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const newListings = await this.featuredManager.getNew(limit);
      res.json(newListings);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleGetTopRated(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const topRated = await this.featuredManager.getTopRated(limit);
      res.json(topRated);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleGetRecommended(req: AuthRequest, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const recommended = await this.featuredManager.getRecommended(req.userId!, limit);
      res.json(recommended);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleGetHomepage(req: AuthRequest, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const homepage = await this.featuredManager.getPersonalizedHomepage(req.userId, limit);
      res.json(homepage);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // ==========================================================================
  // Listing Handlers
  // ==========================================================================

  private async handleGetListings(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const listings = await this.listingManager.getPublished(limit, offset);
      res.json(listings);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleGetListing(req: Request, res: Response): Promise<void> {
    try {
      const listing = await this.listingManager.getById(req.params.id);
      if (!listing) {
        res.status(404).json({ error: 'Listing not found' });
        return;
      }
      res.json(listing);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleGetRelated(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const related = await this.searchManager.getRelated(req.params.id, limit);
      res.json(related);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleCreateListing(req: AuthRequest, res: Response): Promise<void> {
    try {
      const listing = await this.listingManager.create(req.body);
      res.status(201).json(listing);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }

  private async handleUpdateListing(req: AuthRequest, res: Response): Promise<void> {
    try {
      const listing = await this.listingManager.update(req.params.id, req.body);
      res.json(listing);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }

  private async handlePublishListing(req: AuthRequest, res: Response): Promise<void> {
    try {
      const listing = await this.listingManager.publish(req.params.id);
      res.json(listing);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }

  private async handleUnpublishListing(req: AuthRequest, res: Response): Promise<void> {
    try {
      const listing = await this.listingManager.unpublish(req.params.id);
      res.json(listing);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }

  private async handleDeleteListing(req: AuthRequest, res: Response): Promise<void> {
    try {
      await this.listingManager.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }

  // ==========================================================================
  // Category Handlers
  // ==========================================================================

  private async handleGetCategories(req: Request, res: Response): Promise<void> {
    try {
      const categories = await this.categoryManager.getCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleGetCategoryTree(req: Request, res: Response): Promise<void> {
    try {
      const tree = await this.categoryManager.getCategoryTree();
      res.json(tree);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleGetCategory(req: Request, res: Response): Promise<void> {
    try {
      const category = await this.categoryManager.getCategory(req.params.id);
      if (!category) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleGetCategoryListings(req: Request, res: Response): Promise<void> {
    try {
      const includeSubcategories = req.query.includeSubcategories !== 'false';
      const listings = await this.categoryManager.getListingsByCategory(
        req.params.id,
        includeSubcategories
      );
      res.json(listings);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // ==========================================================================
  // Review Handlers
  // ==========================================================================

  private async handleGetReviews(req: Request, res: Response): Promise<void> {
    try {
      const sortBy = req.query.sortBy as 'recent' | 'rating' | 'helpful' ?? 'recent';
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      const reviews = await this.reviewManager.getReviews(req.params.id, {
        sortBy,
        limit,
        offset,
      });
      res.json(reviews);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleGetReviewStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.reviewManager.getReviewStats(req.params.id);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleAddReview(req: AuthRequest, res: Response): Promise<void> {
    try {
      const review = await this.reviewManager.addReview({
        listingId: req.params.id,
        userId: req.userId!,
        ...req.body,
      });
      res.status(201).json(review);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }

  private async handleUpdateReview(req: AuthRequest, res: Response): Promise<void> {
    try {
      const review = await this.reviewManager.updateReview(
        req.params.id,
        req.userId!,
        req.body
      );
      res.json(review);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }

  private async handleDeleteReview(req: AuthRequest, res: Response): Promise<void> {
    try {
      await this.reviewManager.deleteReview(req.params.id, req.userId!);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }

  private async handleVoteReview(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { isHelpful } = req.body;
      await this.reviewManager.voteHelpful(req.params.id, req.userId!, isHelpful);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }

  // ==========================================================================
  // Publisher Handlers
  // ==========================================================================

  private async handleGetPublishers(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const publishers = await this.publisherManager.getTopPublishers(limit);
      res.json(publishers);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleGetPublisher(req: Request, res: Response): Promise<void> {
    try {
      const publisher = await this.publisherManager.getPublisher(req.params.id);
      if (!publisher) {
        res.status(404).json({ error: 'Publisher not found' });
        return;
      }
      res.json(publisher);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleGetPublisherListings(req: Request, res: Response): Promise<void> {
    try {
      const status = req.query.status as string;
      const listings = await this.publisherManager.getListings(req.params.id, status);
      res.json(listings);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleRegisterPublisher(req: AuthRequest, res: Response): Promise<void> {
    try {
      const publisher = await this.publisherManager.register({
        userId: req.userId!,
        ...req.body,
      });
      res.status(201).json(publisher);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }

  private async handleUpdatePublisher(req: AuthRequest, res: Response): Promise<void> {
    try {
      const publisher = await this.publisherManager.updateProfile(
        req.params.id,
        req.userId!,
        req.body
      );
      res.json(publisher);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }

  private async handleGetPublisherAnalytics(req: AuthRequest, res: Response): Promise<void> {
    try {
      const analytics = await this.publisherManager.getAnalytics(req.params.id);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // ==========================================================================
  // Installation Handlers
  // ==========================================================================

  private async handleInstall(req: AuthRequest, res: Response): Promise<void> {
    try {
      const installation = await this.installationManager.install({
        userId: req.userId!,
        listingId: req.params.id,
        version: req.body.version,
      });
      res.status(201).json(installation);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }

  private async handleUninstall(req: AuthRequest, res: Response): Promise<void> {
    try {
      await this.installationManager.uninstall(req.userId!, req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }

  private async handleGetInstallations(req: AuthRequest, res: Response): Promise<void> {
    try {
      const installations = await this.installationManager.getInstalled(req.userId!);
      res.json(installations);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  private async handleCheckUpdates(req: AuthRequest, res: Response): Promise<void> {
    try {
      const updates = await this.installationManager.checkForUpdates(req.userId!);
      res.json(updates);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }
}

/**
 * Create and configure marketplace API router
 */
export function createMarketplaceAPI(supabase: SupabaseClient): Router {
  const api = new MarketplaceAPI(supabase);
  return api.getRouter();
}
