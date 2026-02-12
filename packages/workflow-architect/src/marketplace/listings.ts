/**
 * Listing Manager
 *
 * Handles CRUD operations for marketplace listings with version management
 * and status transitions.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { MarketplaceListing, ListingStatus } from './types';

interface CreateListingInput {
  publisherId: string;
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  categoryId?: string;
  tags?: string[];
  version?: string;
  license: string;
  pricing: string;
  price?: number;
  workflow: Record<string, unknown>;
  screenshots?: string[];
  iconUrl?: string;
}

interface UpdateListingInput {
  name?: string;
  description?: string;
  longDescription?: string;
  categoryId?: string;
  tags?: string[];
  license?: string;
  pricing?: string;
  price?: number;
  workflow?: Record<string, unknown>;
  screenshots?: string[];
  iconUrl?: string;
}

export class ListingManager {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Create a new draft listing
   */
  async create(input: CreateListingInput): Promise<MarketplaceListing> {
    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .insert({
        publisher_id: input.publisherId,
        name: input.name,
        slug: input.slug,
        description: input.description,
        long_description: input.longDescription,
        category_id: input.categoryId,
        tags: input.tags ?? [],
        version: input.version ?? '1.0.0',
        license: input.license,
        pricing: input.pricing,
        price: input.price,
        workflow: input.workflow,
        screenshots: input.screenshots ?? [],
        icon_url: input.iconUrl,
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create listing: ${error.message}`);
    }

    return this.mapToListing(data);
  }

  /**
   * Get a listing by ID
   */
  async getById(id: string): Promise<MarketplaceListing | null> {
    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get listing: ${error.message}`);
    }

    return this.mapToListing(data);
  }

  /**
   * Get a listing by publisher and slug
   */
  async getBySlug(publisherId: string, slug: string): Promise<MarketplaceListing | null> {
    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .select('*')
      .eq('publisher_id', publisherId)
      .eq('slug', slug)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get listing: ${error.message}`);
    }

    return this.mapToListing(data);
  }

  /**
   * Update a listing
   */
  async update(id: string, input: UpdateListingInput): Promise<MarketplaceListing> {
    const updates: Record<string, unknown> = {};

    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.longDescription !== undefined) updates.long_description = input.longDescription;
    if (input.categoryId !== undefined) updates.category_id = input.categoryId;
    if (input.tags !== undefined) updates.tags = input.tags;
    if (input.license !== undefined) updates.license = input.license;
    if (input.pricing !== undefined) updates.pricing = input.pricing;
    if (input.price !== undefined) updates.price = input.price;
    if (input.workflow !== undefined) updates.workflow = input.workflow;
    if (input.screenshots !== undefined) updates.screenshots = input.screenshots;
    if (input.iconUrl !== undefined) updates.icon_url = input.iconUrl;

    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update listing: ${error.message}`);
    }

    return this.mapToListing(data);
  }

  /**
   * Publish a listing (draft/rejected -> pending_review -> published)
   */
  async publish(id: string): Promise<MarketplaceListing> {
    // Get current listing
    const listing = await this.getById(id);
    if (!listing) {
      throw new Error('Listing not found');
    }

    // Validate transition
    if (!['draft', 'rejected'].includes(listing.status)) {
      throw new Error(`Cannot publish listing with status: ${listing.status}`);
    }

    // For auto-approval, go directly to published
    // In production, this would go to 'pending_review' first
    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to publish listing: ${error.message}`);
    }

    return this.mapToListing(data);
  }

  /**
   * Unpublish a listing (published -> draft)
   */
  async unpublish(id: string): Promise<MarketplaceListing> {
    const listing = await this.getById(id);
    if (!listing) {
      throw new Error('Listing not found');
    }

    if (listing.status !== 'published') {
      throw new Error(`Cannot unpublish listing with status: ${listing.status}`);
    }

    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .update({
        status: 'draft',
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to unpublish listing: ${error.message}`);
    }

    return this.mapToListing(data);
  }

  /**
   * Archive a listing
   */
  async archive(id: string): Promise<MarketplaceListing> {
    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .update({
        status: 'archived',
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to archive listing: ${error.message}`);
    }

    return this.mapToListing(data);
  }

  /**
   * Delete a listing (soft delete by archiving)
   */
  async delete(id: string): Promise<void> {
    await this.archive(id);
  }

  /**
   * Create a new version of a listing
   */
  async createVersion(id: string, version: string, workflow: Record<string, unknown>): Promise<MarketplaceListing> {
    const listing = await this.getById(id);
    if (!listing) {
      throw new Error('Listing not found');
    }

    // Validate version format (semver)
    const versionRegex = /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/;
    if (!versionRegex.test(version)) {
      throw new Error('Invalid version format. Use semantic versioning (e.g., 1.2.3)');
    }

    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .update({
        version,
        workflow,
        status: 'draft', // New version goes to draft
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create version: ${error.message}`);
    }

    return this.mapToListing(data);
  }

  /**
   * Get all listings for a publisher
   */
  async getByPublisher(publisherId: string, status?: ListingStatus): Promise<MarketplaceListing[]> {
    let query = this.supabase
      .from('marketplace_listings')
      .select('*')
      .eq('publisher_id', publisherId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get publisher listings: ${error.message}`);
    }

    return data.map(this.mapToListing);
  }

  /**
   * Get published listings
   */
  async getPublished(limit = 20, offset = 0): Promise<MarketplaceListing[]> {
    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .select('*')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get published listings: ${error.message}`);
    }

    return data.map(this.mapToListing);
  }

  /**
   * Increment download count
   */
  async incrementDownloads(id: string): Promise<void> {
    const { error } = await this.supabase.rpc('increment_download_count', {
      listing_uuid: id,
    });

    if (error) {
      throw new Error(`Failed to increment downloads: ${error.message}`);
    }
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
      status: data.status as ListingStatus,
      downloads: (data.downloads as number) ?? 0,
      rating: (data.rating as number) ?? 0,
      reviewCount: (data.review_count as number) ?? 0,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
      publishedAt: data.published_at as string | undefined,
    };
  }
}
