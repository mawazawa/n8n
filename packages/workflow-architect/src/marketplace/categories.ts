/**
 * Category Manager
 *
 * Manages hierarchical marketplace categories with statistics
 * and nested category support.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { Category } from './types';

interface CreateCategoryInput {
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  icon?: string;
}

export class CategoryManager {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Create a new category
   */
  async addCategory(input: CreateCategoryInput): Promise<Category> {
    const { data, error } = await this.supabase
      .from('marketplace_categories')
      .insert({
        name: input.name,
        slug: input.slug,
        description: input.description,
        parent_id: input.parentId,
        icon: input.icon,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create category: ${error.message}`);
    }

    return this.mapToCategory(data);
  }

  /**
   * Get all categories (flat list)
   */
  async getCategories(): Promise<Category[]> {
    const { data, error } = await this.supabase
      .from('marketplace_categories')
      .select('*')
      .order('name');

    if (error) {
      throw new Error(`Failed to get categories: ${error.message}`);
    }

    return data.map(this.mapToCategory);
  }

  /**
   * Get category tree (hierarchical structure)
   */
  async getCategoryTree(): Promise<Category[]> {
    const categories = await this.getCategories();

    // Build tree structure
    const categoryMap = new Map<string, Category>();
    const rootCategories: Category[] = [];

    // First pass: create map
    categories.forEach((category) => {
      categoryMap.set(category.id, { ...category, children: [] });
    });

    // Second pass: build tree
    categoryMap.forEach((category) => {
      if (category.parentId) {
        const parent = categoryMap.get(category.parentId);
        if (parent) {
          parent.children = parent.children ?? [];
          parent.children.push(category);
        }
      } else {
        rootCategories.push(category);
      }
    });

    return rootCategories;
  }

  /**
   * Get a single category by ID
   */
  async getCategory(id: string): Promise<Category | null> {
    const { data, error } = await this.supabase
      .from('marketplace_categories')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get category: ${error.message}`);
    }

    return this.mapToCategory(data);
  }

  /**
   * Get a category by slug
   */
  async getCategoryBySlug(slug: string): Promise<Category | null> {
    const { data, error } = await this.supabase
      .from('marketplace_categories')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get category: ${error.message}`);
    }

    return this.mapToCategory(data);
  }

  /**
   * Get subcategories for a parent category
   */
  async getSubcategories(parentId: string): Promise<Category[]> {
    const { data, error } = await this.supabase
      .from('marketplace_categories')
      .select('*')
      .eq('parent_id', parentId)
      .order('name');

    if (error) {
      throw new Error(`Failed to get subcategories: ${error.message}`);
    }

    return data.map(this.mapToCategory);
  }

  /**
   * Get root categories (no parent)
   */
  async getRootCategories(): Promise<Category[]> {
    const { data, error } = await this.supabase
      .from('marketplace_categories')
      .select('*')
      .is('parent_id', null)
      .order('name');

    if (error) {
      throw new Error(`Failed to get root categories: ${error.message}`);
    }

    return data.map(this.mapToCategory);
  }

  /**
   * Get listings for a category (includes subcategories)
   */
  async getListingsByCategory(categoryId: string, includeSubcategories = true) {
    let categoryIds = [categoryId];

    if (includeSubcategories) {
      // Get all subcategories recursively
      categoryIds = await this.getAllSubcategoryIds(categoryId);
      categoryIds.push(categoryId);
    }

    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .select('*')
      .eq('status', 'published')
      .in('category_id', categoryIds)
      .order('downloads', { ascending: false });

    if (error) {
      throw new Error(`Failed to get listings by category: ${error.message}`);
    }

    return data;
  }

  /**
   * Update a category
   */
  async updateCategory(
    id: string,
    updates: {
      name?: string;
      slug?: string;
      description?: string;
      icon?: string;
    }
  ): Promise<Category> {
    const updateData: Record<string, unknown> = {};

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.slug !== undefined) updateData.slug = updates.slug;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.icon !== undefined) updateData.icon = updates.icon;

    const { data, error } = await this.supabase
      .from('marketplace_categories')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update category: ${error.message}`);
    }

    return this.mapToCategory(data);
  }

  /**
   * Delete a category
   */
  async deleteCategory(id: string): Promise<void> {
    // Check if category has subcategories
    const subcategories = await this.getSubcategories(id);
    if (subcategories.length > 0) {
      throw new Error('Cannot delete category with subcategories');
    }

    // Check if category has listings
    const { count, error: countError } = await this.supabase
      .from('marketplace_listings')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id);

    if (countError) {
      throw new Error(`Failed to check category listings: ${countError.message}`);
    }

    if (count && count > 0) {
      throw new Error('Cannot delete category with listings');
    }

    const { error } = await this.supabase
      .from('marketplace_categories')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete category: ${error.message}`);
    }
  }

  /**
   * Get category statistics
   */
  async getCategoryStats(categoryId: string): Promise<{
    totalListings: number;
    totalDownloads: number;
    averageRating: number;
    subcategoryCount: number;
  }> {
    const categoryIds = await this.getAllSubcategoryIds(categoryId);
    categoryIds.push(categoryId);

    const { data, error } = await this.supabase
      .from('marketplace_listings')
      .select('downloads, rating')
      .eq('status', 'published')
      .in('category_id', categoryIds);

    if (error) {
      throw new Error(`Failed to get category stats: ${error.message}`);
    }

    const subcategories = await this.getSubcategories(categoryId);

    const totalListings = data.length;
    const totalDownloads = data.reduce((sum, listing) => sum + (listing.downloads ?? 0), 0);
    const averageRating = data.length > 0
      ? data.reduce((sum, listing) => sum + (listing.rating ?? 0), 0) / data.length
      : 0;

    return {
      totalListings,
      totalDownloads,
      averageRating,
      subcategoryCount: subcategories.length,
    };
  }

  /**
   * Get popular categories (by listing count)
   */
  async getPopularCategories(limit = 10): Promise<Category[]> {
    const { data, error } = await this.supabase
      .from('marketplace_categories')
      .select('*')
      .order('listing_count', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get popular categories: ${error.message}`);
    }

    return data.map(this.mapToCategory);
  }

  /**
   * Get all subcategory IDs recursively
   */
  private async getAllSubcategoryIds(categoryId: string): Promise<string[]> {
    const subcategories = await this.getSubcategories(categoryId);
    const ids: string[] = [];

    for (const subcategory of subcategories) {
      ids.push(subcategory.id);
      const childIds = await this.getAllSubcategoryIds(subcategory.id);
      ids.push(...childIds);
    }

    return ids;
  }

  /**
   * Map database row to Category
   */
  private mapToCategory(data: Record<string, unknown>): Category {
    return {
      id: data.id as string,
      name: data.name as string,
      slug: data.slug as string,
      description: (data.description as string) ?? '',
      parentId: data.parent_id as string | undefined,
      icon: data.icon as string | undefined,
      listingCount: (data.listing_count as number) ?? 0,
    };
  }
}
