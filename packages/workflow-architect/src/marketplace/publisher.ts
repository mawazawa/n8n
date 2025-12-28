/**
 * Publisher Manager
 *
 * Manages publisher profiles, verification, and analytics for marketplace
 * workflow publishers.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { Publisher } from './types';

interface RegisterPublisherInput {
  userId: string;
  name: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  website?: string;
}

interface UpdatePublisherInput {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  website?: string;
}

interface PublisherAnalytics {
  totalListings: number;
  publishedListings: number;
  draftListings: number;
  totalDownloads: number;
  totalReviews: number;
  averageRating: number;
  topListings: Array<{
    id: string;
    name: string;
    downloads: number;
    rating: number;
  }>;
}

export class PublisherManager {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Register a new publisher
   */
  async register(input: RegisterPublisherInput): Promise<Publisher> {
    // Validate name format (lowercase, alphanumeric with hyphens)
    const nameRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
    if (!nameRegex.test(input.name)) {
      throw new Error(
        'Name must be lowercase alphanumeric with hyphens, starting and ending with a letter or number'
      );
    }

    // Check name length
    if (input.name.length < 3 || input.name.length > 50) {
      throw new Error('Name must be between 3 and 50 characters');
    }

    // Check if name is already taken
    const existing = await this.getPublisherByName(input.name);
    if (existing) {
      throw new Error('Publisher name is already taken');
    }

    // Check if user already has a publisher account
    const userPublisher = await this.getPublisherByUserId(input.userId);
    if (userPublisher) {
      throw new Error('User already has a publisher account');
    }

    const { data, error } = await this.supabase
      .from('publishers')
      .insert({
        user_id: input.userId,
        name: input.name,
        display_name: input.displayName,
        bio: input.bio,
        avatar_url: input.avatarUrl,
        website: input.website,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to register publisher: ${error.message}`);
    }

    return this.mapToPublisher(data);
  }

  /**
   * Get publisher by ID
   */
  async getPublisher(id: string): Promise<Publisher | null> {
    const { data, error } = await this.supabase
      .from('publishers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get publisher: ${error.message}`);
    }

    return this.mapToPublisher(data);
  }

  /**
   * Get publisher by name
   */
  async getPublisherByName(name: string): Promise<Publisher | null> {
    const { data, error } = await this.supabase
      .from('publishers')
      .select('*')
      .eq('name', name)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get publisher: ${error.message}`);
    }

    return this.mapToPublisher(data);
  }

  /**
   * Get publisher by user ID
   */
  async getPublisherByUserId(userId: string): Promise<Publisher | null> {
    const { data, error } = await this.supabase
      .from('publishers')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get publisher: ${error.message}`);
    }

    return this.mapToPublisher(data);
  }

  /**
   * Update publisher profile
   */
  async updateProfile(id: string, userId: string, input: UpdatePublisherInput): Promise<Publisher> {
    // Verify ownership
    const publisher = await this.getPublisher(id);
    if (!publisher) {
      throw new Error('Publisher not found');
    }

    if (publisher.userId !== userId) {
      throw new Error('Unauthorized to update this publisher');
    }

    const updates: Record<string, unknown> = {};

    if (input.displayName !== undefined) updates.display_name = input.displayName;
    if (input.bio !== undefined) updates.bio = input.bio;
    if (input.avatarUrl !== undefined) updates.avatar_url = input.avatarUrl;
    if (input.website !== undefined) updates.website = input.website;

    const { data, error } = await this.supabase
      .from('publishers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update publisher: ${error.message}`);
    }

    return this.mapToPublisher(data);
  }

  /**
   * Get all listings for a publisher
   */
  async getListings(publisherId: string, status?: string) {
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

    return data;
  }

  /**
   * Verify a publisher (admin only)
   */
  async verify(id: string): Promise<Publisher> {
    const { data, error } = await this.supabase
      .from('publishers')
      .update({ verified: true })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to verify publisher: ${error.message}`);
    }

    return this.mapToPublisher(data);
  }

  /**
   * Unverify a publisher (admin only)
   */
  async unverify(id: string): Promise<Publisher> {
    const { data, error } = await this.supabase
      .from('publishers')
      .update({ verified: false })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to unverify publisher: ${error.message}`);
    }

    return this.mapToPublisher(data);
  }

  /**
   * Get publisher analytics
   */
  async getAnalytics(publisherId: string): Promise<PublisherAnalytics> {
    // Get all listings
    const { data: listings, error: listingsError } = await this.supabase
      .from('marketplace_listings')
      .select('id, name, status, downloads, rating, review_count')
      .eq('publisher_id', publisherId);

    if (listingsError) {
      throw new Error(`Failed to get publisher analytics: ${listingsError.message}`);
    }

    const totalListings = listings.length;
    const publishedListings = listings.filter((l) => l.status === 'published').length;
    const draftListings = listings.filter((l) => l.status === 'draft').length;
    const totalDownloads = listings.reduce((sum, l) => sum + (l.downloads ?? 0), 0);
    const totalReviews = listings.reduce((sum, l) => sum + (l.review_count ?? 0), 0);

    // Calculate average rating across all published listings
    const publishedWithRatings = listings.filter(
      (l) => l.status === 'published' && l.review_count > 0
    );
    const averageRating = publishedWithRatings.length > 0
      ? publishedWithRatings.reduce((sum, l) => sum + (l.rating ?? 0), 0) / publishedWithRatings.length
      : 0;

    // Get top 5 listings by downloads
    const topListings = [...listings]
      .filter((l) => l.status === 'published')
      .sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0))
      .slice(0, 5)
      .map((l) => ({
        id: l.id,
        name: l.name,
        downloads: l.downloads ?? 0,
        rating: l.rating ?? 0,
      }));

    return {
      totalListings,
      publishedListings,
      draftListings,
      totalDownloads,
      totalReviews,
      averageRating,
      topListings,
    };
  }

  /**
   * Get verified publishers
   */
  async getVerifiedPublishers(limit = 20, offset = 0): Promise<Publisher[]> {
    const { data, error } = await this.supabase
      .from('publishers')
      .select('*')
      .eq('verified', true)
      .order('total_downloads', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get verified publishers: ${error.message}`);
    }

    return data.map(this.mapToPublisher);
  }

  /**
   * Get top publishers by downloads
   */
  async getTopPublishers(limit = 10): Promise<Publisher[]> {
    const { data, error } = await this.supabase
      .from('publishers')
      .select('*')
      .order('total_downloads', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get top publishers: ${error.message}`);
    }

    return data.map(this.mapToPublisher);
  }

  /**
   * Search publishers by name or display name
   */
  async searchPublishers(query: string, limit = 20): Promise<Publisher[]> {
    const { data, error } = await this.supabase
      .from('publishers')
      .select('*')
      .or(`name.ilike.%${query}%,display_name.ilike.%${query}%`)
      .order('total_downloads', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to search publishers: ${error.message}`);
    }

    return data.map(this.mapToPublisher);
  }

  /**
   * Check if name is available
   */
  async isNameAvailable(name: string): Promise<boolean> {
    const publisher = await this.getPublisherByName(name);
    return publisher === null;
  }

  /**
   * Delete publisher (requires no published listings)
   */
  async deletePublisher(id: string, userId: string): Promise<void> {
    const publisher = await this.getPublisher(id);
    if (!publisher) {
      throw new Error('Publisher not found');
    }

    if (publisher.userId !== userId) {
      throw new Error('Unauthorized to delete this publisher');
    }

    // Check for published listings
    const { count, error: countError } = await this.supabase
      .from('marketplace_listings')
      .select('*', { count: 'exact', head: true })
      .eq('publisher_id', id)
      .eq('status', 'published');

    if (countError) {
      throw new Error(`Failed to check listings: ${countError.message}`);
    }

    if (count && count > 0) {
      throw new Error('Cannot delete publisher with published listings');
    }

    const { error } = await this.supabase
      .from('publishers')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete publisher: ${error.message}`);
    }
  }

  /**
   * Map database row to Publisher
   */
  private mapToPublisher(data: Record<string, unknown>): Publisher {
    return {
      id: data.id as string,
      userId: data.user_id as string,
      name: data.name as string,
      displayName: data.display_name as string,
      bio: data.bio as string | undefined,
      avatarUrl: data.avatar_url as string | undefined,
      website: data.website as string | undefined,
      verified: (data.verified as boolean) ?? false,
      listingsCount: (data.listings_count as number) ?? 0,
      totalDownloads: (data.total_downloads as number) ?? 0,
      createdAt: data.created_at as string,
    };
  }
}
