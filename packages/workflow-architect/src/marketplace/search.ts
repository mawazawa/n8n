/**
 * Marketplace Search
 *
 * Implements full-text and semantic search with filtering and sorting
 * capabilities for the marketplace.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { MarketplaceListing, SearchFilters, SearchSort, SearchResult } from './types';

interface SearchOptions {
  filters?: SearchFilters;
  sort?: SearchSort;
  page?: number;
  pageSize?: number;
}

export class MarketplaceSearch {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Full-text search with filters and sorting
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    const {
      filters = {},
      sort = { field: 'relevance', direction: 'desc' },
      page = 1,
      pageSize = 20,
    } = options;

    const offset = (page - 1) * pageSize;

    // Use database search function for full-text search
    if (query.trim()) {
      return this.fullTextSearch(query, filters, sort, pageSize, offset);
    }

    // No query - just filter and sort
    return this.filterAndSort(filters, sort, pageSize, offset);
  }

  /**
   * Full-text search using PostgreSQL search function
   */
  private async fullTextSearch(
    query: string,
    filters: SearchFilters,
    sort: SearchSort,
    limit: number,
    offset: number
  ): Promise<SearchResult> {
    const { data, error } = await this.supabase.rpc('search_listings', {
      search_query: query,
      category_filter: filters.category ?? null,
      pricing_filter: filters.pricing ?? null,
      min_rating_filter: filters.minRating ?? 0,
      tag_filter: filters.tags ?? null,
      limit_count: limit,
      offset_count: offset,
    });

    if (error) {
      throw new Error(`Search failed: ${error.message}`);
    }

    // Get full listing details
    const listingIds = data.map((row: { id: string }) => row.id);

    if (listingIds.length === 0) {
      return {
        listings: [],
        total: 0,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
      };
    }

    const { data: listings, error: listingsError } = await this.supabase
      .from('marketplace_listings')
      .select('*')
      .in('id', listingIds);

    if (listingsError) {
      throw new Error(`Failed to fetch listings: ${listingsError.message}`);
    }

    // Maintain search result order
    const orderedListings = listingIds.map((id) =>
      listings.find((listing) => listing.id === id)
    ).filter(Boolean);

    // Get total count for pagination
    const { count } = await this.supabase
      .from('marketplace_listings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published');

    return {
      listings: orderedListings.map(this.mapToListing),
      total: count ?? 0,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
    };
  }

  /**
   * Filter and sort without text search
   */
  private async filterAndSort(
    filters: SearchFilters,
    sort: SearchSort,
    limit: number,
    offset: number
  ): Promise<SearchResult> {
    let query = this.supabase
      .from('marketplace_listings')
      .select('*', { count: 'exact' })
      .eq('status', 'published');

    // Apply filters
    if (filters.category) {
      query = query.eq('category_id', filters.category);
    }

    if (filters.pricing && filters.pricing.length > 0) {
      query = query.in('pricing', filters.pricing);
    }

    if (filters.minRating !== undefined) {
      query = query.gte('rating', filters.minRating);
    }

    if (filters.tags && filters.tags.length > 0) {
      query = query.overlaps('tags', filters.tags);
    }

    if (filters.license && filters.license.length > 0) {
      query = query.in('license', filters.license);
    }

    if (filters.verified !== undefined) {
      // Join with publishers to filter by verified status
      query = this.supabase
        .from('marketplace_listings')
        .select('*, publishers!inner(verified)', { count: 'exact' })
        .eq('status', 'published')
        .eq('publishers.verified', filters.verified);
    }

    // Apply sorting
    switch (sort.field) {
      case 'downloads':
        query = query.order('downloads', { ascending: sort.direction === 'asc' });
        break;
      case 'rating':
        query = query.order('rating', { ascending: sort.direction === 'asc' });
        break;
      case 'createdAt':
        query = query.order('created_at', { ascending: sort.direction === 'asc' });
        break;
      case 'updatedAt':
        query = query.order('updated_at', { ascending: sort.direction === 'asc' });
        break;
      default:
        // Default to downloads for non-search results
        query = query.order('downloads', { ascending: false });
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      throw new Error(`Filter and sort failed: ${error.message}`);
    }

    return {
      listings: (data ?? []).map(this.mapToListing),
      total: count ?? 0,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
    };
  }

  /**
   * Autocomplete suggestions based on partial query
   */
  async suggest(partial: string, limit = 10): Promise<string[]> {
    if (!partial || partial.length < 2) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .select('name')
      .eq('status', 'published')
      .ilike('name', `%${partial}%`)
      .limit(limit);

    if (error) {
      throw new Error(`Suggest failed: ${error.message}`);
    }

    return data.map((row) => row.name);
  }

  /**
   * Get listings by category
   */
  async getByCategory(categoryId: string, limit = 20, offset = 0): Promise<SearchResult> {
    const { data, count, error } = await this.supabase
      .from('marketplace_listings')
      .select('*', { count: 'exact' })
      .eq('status', 'published')
      .eq('category_id', categoryId)
      .order('downloads', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get category listings: ${error.message}`);
    }

    return {
      listings: (data ?? []).map(this.mapToListing),
      total: count ?? 0,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
    };
  }

  /**
   * Get listings by tags
   */
  async getByTags(tags: string[], limit = 20, offset = 0): Promise<SearchResult> {
    const { data, count, error } = await this.supabase
      .from('marketplace_listings')
      .select('*', { count: 'exact' })
      .eq('status', 'published')
      .overlaps('tags', tags)
      .order('downloads', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get tag listings: ${error.message}`);
    }

    return {
      listings: (data ?? []).map(this.mapToListing),
      total: count ?? 0,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
    };
  }

  /**
   * Get related listings based on tags and category
   */
  async getRelated(listingId: string, limit = 5): Promise<MarketplaceListing[]> {
    // Get the source listing
    const { data: source, error: sourceError } = await this.supabase
      .from('marketplace_listings')
      .select('category_id, tags')
      .eq('id', listingId)
      .single();

    if (sourceError) {
      throw new Error(`Failed to get source listing: ${sourceError.message}`);
    }

    // Find related listings with same category or overlapping tags
    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .select('*')
      .eq('status', 'published')
      .neq('id', listingId)
      .or(`category_id.eq.${source.category_id},tags.ov.{${source.tags.join(',')}}`)
      .order('rating', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get related listings: ${error.message}`);
    }

    return (data ?? []).map(this.mapToListing);
  }

  /**
   * Get popular search terms
   */
  async getPopularSearches(limit = 10): Promise<string[]> {
    // This would require a search_queries table to track searches
    // For now, return popular tags
    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .select('tags')
      .eq('status', 'published')
      .limit(100);

    if (error) {
      throw new Error(`Failed to get popular searches: ${error.message}`);
    }

    // Count tag frequency
    const tagCounts: Record<string, number> = {};
    data.forEach((row) => {
      row.tags?.forEach((tag: string) => {
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      });
    });

    // Sort by frequency and return top N
    return Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([tag]) => tag);
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
