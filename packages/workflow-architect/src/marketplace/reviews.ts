/**
 * Review Manager
 *
 * Handles review CRUD operations, rating aggregation, and helpful voting
 * with automatic moderation support.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { Review } from './types';

interface CreateReviewInput {
  listingId: string;
  userId: string;
  rating: number;
  title: string;
  content: string;
}

interface UpdateReviewInput {
  rating?: number;
  title?: string;
  content?: string;
}

export class ReviewManager {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Add a review
   */
  async addReview(input: CreateReviewInput): Promise<Review> {
    // Validate rating
    if (input.rating < 1 || input.rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    // Validate title and content length
    if (input.title.length < 3 || input.title.length > 100) {
      throw new Error('Title must be between 3 and 100 characters');
    }

    if (input.content.length < 10) {
      throw new Error('Content must be at least 10 characters');
    }

    // Check if user has already reviewed this listing
    const existing = await this.getUserReview(input.listingId, input.userId);
    if (existing) {
      throw new Error('You have already reviewed this listing');
    }

    const { data, error } = await this.supabase
      .from('marketplace_reviews')
      .insert({
        listing_id: input.listingId,
        user_id: input.userId,
        rating: input.rating,
        title: input.title,
        content: input.content,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create review: ${error.message}`);
    }

    return this.mapToReview(data);
  }

  /**
   * Update a review
   */
  async updateReview(id: string, userId: string, input: UpdateReviewInput): Promise<Review> {
    // Verify ownership
    const review = await this.getReview(id);
    if (!review) {
      throw new Error('Review not found');
    }

    if (review.userId !== userId) {
      throw new Error('Unauthorized to update this review');
    }

    const updates: Record<string, unknown> = {};

    if (input.rating !== undefined) {
      if (input.rating < 1 || input.rating > 5) {
        throw new Error('Rating must be between 1 and 5');
      }
      updates.rating = input.rating;
    }

    if (input.title !== undefined) {
      if (input.title.length < 3 || input.title.length > 100) {
        throw new Error('Title must be between 3 and 100 characters');
      }
      updates.title = input.title;
    }

    if (input.content !== undefined) {
      if (input.content.length < 10) {
        throw new Error('Content must be at least 10 characters');
      }
      updates.content = input.content;
    }

    const { data, error } = await this.supabase
      .from('marketplace_reviews')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update review: ${error.message}`);
    }

    return this.mapToReview(data);
  }

  /**
   * Delete a review
   */
  async deleteReview(id: string, userId: string): Promise<void> {
    // Verify ownership
    const review = await this.getReview(id);
    if (!review) {
      throw new Error('Review not found');
    }

    if (review.userId !== userId) {
      throw new Error('Unauthorized to delete this review');
    }

    const { error } = await this.supabase
      .from('marketplace_reviews')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete review: ${error.message}`);
    }
  }

  /**
   * Get a single review
   */
  async getReview(id: string): Promise<Review | null> {
    const { data, error } = await this.supabase
      .from('marketplace_reviews')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get review: ${error.message}`);
    }

    return this.mapToReview(data);
  }

  /**
   * Get all reviews for a listing
   */
  async getReviews(
    listingId: string,
    options: {
      sortBy?: 'recent' | 'rating' | 'helpful';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Review[]> {
    const { sortBy = 'recent', limit = 20, offset = 0 } = options;

    let query = this.supabase
      .from('marketplace_reviews')
      .select('*')
      .eq('listing_id', listingId);

    // Apply sorting
    switch (sortBy) {
      case 'rating':
        query = query.order('rating', { ascending: false });
        break;
      case 'helpful':
        query = query.order('helpful', { ascending: false });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get reviews: ${error.message}`);
    }

    return data.map(this.mapToReview);
  }

  /**
   * Get user's review for a listing
   */
  async getUserReview(listingId: string, userId: string): Promise<Review | null> {
    const { data, error } = await this.supabase
      .from('marketplace_reviews')
      .select('*')
      .eq('listing_id', listingId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get user review: ${error.message}`);
    }

    return this.mapToReview(data);
  }

  /**
   * Vote a review as helpful or not helpful
   */
  async voteHelpful(reviewId: string, userId: string, isHelpful: boolean): Promise<void> {
    // Check if user has already voted
    const { data: existingVote, error: voteError } = await this.supabase
      .from('review_votes')
      .select('*')
      .eq('review_id', reviewId)
      .eq('user_id', userId)
      .single();

    if (voteError && voteError.code !== 'PGRST116') {
      throw new Error(`Failed to check existing vote: ${voteError.message}`);
    }

    if (existingVote) {
      // Update existing vote
      const { error } = await this.supabase
        .from('review_votes')
        .update({ is_helpful: isHelpful })
        .eq('id', existingVote.id);

      if (error) {
        throw new Error(`Failed to update vote: ${error.message}`);
      }
    } else {
      // Create new vote
      const { error } = await this.supabase
        .from('review_votes')
        .insert({
          review_id: reviewId,
          user_id: userId,
          is_helpful: isHelpful,
        });

      if (error) {
        throw new Error(`Failed to create vote: ${error.message}`);
      }
    }
  }

  /**
   * Remove helpful vote
   */
  async removeVote(reviewId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('review_votes')
      .delete()
      .eq('review_id', reviewId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to remove vote: ${error.message}`);
    }
  }

  /**
   * Get rating distribution for a listing
   */
  async getRatingDistribution(listingId: string): Promise<Record<number, number>> {
    const { data, error } = await this.supabase
      .from('marketplace_reviews')
      .select('rating')
      .eq('listing_id', listingId);

    if (error) {
      throw new Error(`Failed to get rating distribution: ${error.message}`);
    }

    // Initialize distribution
    const distribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    // Count ratings
    data.forEach((review) => {
      const rating = review.rating as number;
      distribution[rating] = (distribution[rating] ?? 0) + 1;
    });

    return distribution;
  }

  /**
   * Get review statistics for a listing
   */
  async getReviewStats(listingId: string): Promise<{
    totalReviews: number;
    averageRating: number;
    verifiedReviews: number;
    distribution: Record<number, number>;
  }> {
    const { data, error } = await this.supabase
      .from('marketplace_reviews')
      .select('rating, verified')
      .eq('listing_id', listingId);

    if (error) {
      throw new Error(`Failed to get review stats: ${error.message}`);
    }

    const totalReviews = data.length;
    const verifiedReviews = data.filter((r) => r.verified).length;
    const averageRating = totalReviews > 0
      ? data.reduce((sum, r) => sum + (r.rating as number), 0) / totalReviews
      : 0;

    const distribution = await this.getRatingDistribution(listingId);

    return {
      totalReviews,
      averageRating,
      verifiedReviews,
      distribution,
    };
  }

  /**
   * Get verified reviews (user has installed the workflow)
   */
  async getVerifiedReviews(listingId: string, limit = 10): Promise<Review[]> {
    const { data, error } = await this.supabase
      .from('marketplace_reviews')
      .select('*')
      .eq('listing_id', listingId)
      .eq('verified', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get verified reviews: ${error.message}`);
    }

    return data.map(this.mapToReview);
  }

  /**
   * Get most helpful reviews
   */
  async getMostHelpfulReviews(listingId: string, limit = 10): Promise<Review[]> {
    const { data, error } = await this.supabase
      .from('marketplace_reviews')
      .select('*')
      .eq('listing_id', listingId)
      .order('helpful', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get helpful reviews: ${error.message}`);
    }

    return data.map(this.mapToReview);
  }

  /**
   * Map database row to Review
   */
  private mapToReview(data: Record<string, unknown>): Review {
    return {
      id: data.id as string,
      listingId: data.listing_id as string,
      userId: data.user_id as string,
      rating: data.rating as number,
      title: data.title as string,
      content: data.content as string,
      helpful: (data.helpful as number) ?? 0,
      verified: (data.verified as boolean) ?? false,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string | undefined,
    };
  }
}
