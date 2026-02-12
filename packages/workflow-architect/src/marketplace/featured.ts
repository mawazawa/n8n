/**
 * Featured Manager
 *
 * Manages featured listings, trending workflows, and personalized recommendations
 * with score calculation based on downloads, ratings, and recency.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { FeaturedListing, TrendingListing, MarketplaceListing } from './types';

interface AddFeaturedInput {
  listingId: string;
  reason: string;
  score?: number;
  endDate?: string;
}

export class FeaturedManager {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Get featured listings (editorial picks)
   */
  async getFeatured(limit = 10): Promise<FeaturedListing[]> {
    const { data, error } = await this.supabase
      .from('featured_listings')
      .select('*, marketplace_listings(*)')
      .or('end_date.is.null,end_date.gt.now()')
      .order('featured_score', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get featured listings: ${error.message}`);
    }

    return data.map((item) => ({
      ...this.mapToListing(item.marketplace_listings),
      featuredScore: item.featured_score ?? 0,
      featuredReason: item.featured_reason,
    }));
  }

  /**
   * Get trending listings (based on recent activity)
   */
  async getTrending(limit = 10): Promise<TrendingListing[]> {
    const { data, error } = await this.supabase.rpc('get_trending_listings', {
      limit_count: limit,
    });

    if (error) {
      throw new Error(`Failed to get trending listings: ${error.message}`);
    }

    // Get full listing details
    const listingIds = data.map((item: { id: string }) => item.id);

    if (listingIds.length === 0) {
      return [];
    }

    const { data: listings, error: listingsError } = await this.supabase
      .from('marketplace_listings')
      .select('*')
      .in('id', listingIds);

    if (listingsError) {
      throw new Error(`Failed to fetch trending listings: ${listingsError.message}`);
    }

    // Combine with trending data
    return data.map((trendingData: {
      id: string;
      recent_downloads: number;
      download_growth: number;
    }) => {
      const listing = listings.find((l) => l.id === trendingData.id);
      if (!listing) {
        throw new Error(`Listing ${trendingData.id} not found`);
      }

      return {
        ...this.mapToListing(listing),
        trendingScore: this.calculateTrendingScore(
          trendingData.recent_downloads,
          trendingData.download_growth
        ),
        recentDownloads: trendingData.recent_downloads,
        downloadGrowth: trendingData.download_growth,
      };
    });
  }

  /**
   * Get recommended listings for a user based on their activity
   */
  async getRecommended(userId: string, limit = 10): Promise<MarketplaceListing[]> {
    // Get user's installed listings
    const { data: installations, error: installError } = await this.supabase
      .from('marketplace_installations')
      .select('listing_id')
      .eq('user_id', userId);

    if (installError) {
      throw new Error(`Failed to get user installations: ${installError.message}`);
    }

    const installedIds = installations.map((i) => i.listing_id);

    if (installedIds.length === 0) {
      // No installations, return popular listings
      return this.getPopular(limit);
    }

    // Get categories and tags of installed listings
    const { data: installedListings, error: listingError } = await this.supabase
      .from('marketplace_listings')
      .select('category_id, tags')
      .in('id', installedIds);

    if (listingError) {
      throw new Error(`Failed to get installed listings: ${listingError.message}`);
    }

    // Extract unique categories and tags
    const categories = [...new Set(installedListings.map((l) => l.category_id).filter(Boolean))];
    const allTags = installedListings.flatMap((l) => l.tags ?? []);
    const tags = [...new Set(allTags)];

    // Find similar listings
    let query = this.supabase
      .from('marketplace_listings')
      .select('*')
      .eq('status', 'published')
      .not('id', 'in', `(${installedIds.join(',')})`);

    // Filter by categories or overlapping tags
    if (categories.length > 0 || tags.length > 0) {
      const conditions = [];
      if (categories.length > 0) {
        conditions.push(`category_id.in.(${categories.join(',')})`);
      }
      if (tags.length > 0) {
        conditions.push(`tags.ov.{${tags.join(',')}}`);
      }
      query = query.or(conditions.join(','));
    }

    const { data, error } = await query
      .order('rating', { ascending: false })
      .order('downloads', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get recommendations: ${error.message}`);
    }

    return data.map(this.mapToListing);
  }

  /**
   * Get popular listings (by downloads and rating)
   */
  async getPopular(limit = 10): Promise<MarketplaceListing[]> {
    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .select('*')
      .eq('status', 'published')
      .order('downloads', { ascending: false })
      .order('rating', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get popular listings: ${error.message}`);
    }

    return data.map(this.mapToListing);
  }

  /**
   * Get new listings (recently published)
   */
  async getNew(limit = 10): Promise<MarketplaceListing[]> {
    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .select('*')
      .eq('status', 'published')
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get new listings: ${error.message}`);
    }

    return data.map(this.mapToListing);
  }

  /**
   * Get top rated listings
   */
  async getTopRated(limit = 10, minReviews = 5): Promise<MarketplaceListing[]> {
    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .select('*')
      .eq('status', 'published')
      .gte('review_count', minReviews)
      .order('rating', { ascending: false })
      .order('review_count', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get top rated listings: ${error.message}`);
    }

    return data.map(this.mapToListing);
  }

  /**
   * Add a listing to featured (admin only)
   */
  async addToFeatured(input: AddFeaturedInput): Promise<void> {
    const { data, error } = await this.supabase
      .from('featured_listings')
      .insert({
        listing_id: input.listingId,
        featured_reason: input.reason,
        featured_score: input.score ?? 0,
        end_date: input.endDate,
      });

    if (error) {
      throw new Error(`Failed to add featured listing: ${error.message}`);
    }
  }

  /**
   * Remove a listing from featured
   */
  async removeFromFeatured(listingId: string): Promise<void> {
    const { error } = await this.supabase
      .from('featured_listings')
      .delete()
      .eq('listing_id', listingId);

    if (error) {
      throw new Error(`Failed to remove featured listing: ${error.message}`);
    }
  }

  /**
   * Update featured listing score
   */
  async updateFeaturedScore(listingId: string, score: number): Promise<void> {
    const { error } = await this.supabase
      .from('featured_listings')
      .update({ featured_score: score })
      .eq('listing_id', listingId);

    if (error) {
      throw new Error(`Failed to update featured score: ${error.message}`);
    }
  }

  /**
   * Get curated collections (combinations of featured/trending/new)
   */
  async getCollection(
    collection: 'featured' | 'trending' | 'new' | 'popular' | 'top-rated',
    limit = 10
  ): Promise<MarketplaceListing[] | FeaturedListing[] | TrendingListing[]> {
    switch (collection) {
      case 'featured':
        return this.getFeatured(limit);
      case 'trending':
        return this.getTrending(limit);
      case 'new':
        return this.getNew(limit);
      case 'popular':
        return this.getPopular(limit);
      case 'top-rated':
        return this.getTopRated(limit);
      default:
        throw new Error(`Unknown collection: ${collection}`);
    }
  }

  /**
   * Calculate trending score based on recent activity
   */
  private calculateTrendingScore(recentDownloads: number, growthRate: number): number {
    // Weighted combination of recent downloads and growth rate
    const downloadWeight = 0.6;
    const growthWeight = 0.4;

    // Normalize values (simple linear scaling)
    const normalizedDownloads = Math.min(recentDownloads / 100, 1);
    const normalizedGrowth = Math.min(growthRate / 100, 1);

    return (
      normalizedDownloads * downloadWeight * 100 +
      normalizedGrowth * growthWeight * 100
    );
  }

  /**
   * Get listings that complement a given listing
   */
  async getComplementary(listingId: string, limit = 5): Promise<MarketplaceListing[]> {
    // Get the source listing
    const { data: source, error: sourceError } = await this.supabase
      .from('marketplace_listings')
      .select('category_id, tags, workflow')
      .eq('id', listingId)
      .single();

    if (sourceError) {
      throw new Error(`Failed to get source listing: ${sourceError.message}`);
    }

    // Find listings with complementary tags or same category
    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .select('*')
      .eq('status', 'published')
      .neq('id', listingId)
      .or(`category_id.eq.${source.category_id},tags.ov.{${source.tags?.join(',') ?? ''}}`)
      .order('rating', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get complementary listings: ${error.message}`);
    }

    return data.map(this.mapToListing);
  }

  /**
   * Get personalized homepage for user
   */
  async getPersonalizedHomepage(userId?: string, limit = 10): Promise<{
    featured: FeaturedListing[];
    trending: TrendingListing[];
    recommended: MarketplaceListing[];
    new: MarketplaceListing[];
  }> {
    const [featured, trending, recommended, newListings] = await Promise.all([
      this.getFeatured(limit),
      this.getTrending(limit),
      userId ? this.getRecommended(userId, limit) : this.getPopular(limit),
      this.getNew(limit),
    ]);

    return {
      featured,
      trending,
      recommended,
      new: newListings,
    };
  }

  /**
   * Map database row to MarketplaceListing
   */
  private mapToListing(data: Record<string, unknown>): MarketplaceListing {
    return {
      id: data.id as string,
      publisherId: data.publisher_id as string,
      name: data.name as string,
      slug: data.slug as string,
      description: data.description as string,
      longDescription: data.long_description as string,
      category: data.category_id as string,
      tags: (data.tags as string[]) ?? [],
      version: data.version as string,
      license: data.license as string,
      pricing: data.pricing as string,
      price: data.price as number | undefined,
      workflow: data.workflow as Record<string, unknown>,
      screenshots: (data.screenshots as string[]) ?? [],
      iconUrl: data.icon_url as string | undefined,
      status: data.status as string,
      downloads: (data.downloads as number) ?? 0,
      rating: (data.rating as number) ?? 0,
      reviewCount: (data.review_count as number) ?? 0,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
      publishedAt: data.published_at as string | undefined,
    };
  }
}
