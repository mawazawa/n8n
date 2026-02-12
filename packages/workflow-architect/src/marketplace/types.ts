/**
 * Marketplace Type Definitions
 *
 * Defines core types for the workflow marketplace platform including
 * listings, publishers, reviews, and installations.
 */

export type ListingStatus = 'draft' | 'pending_review' | 'published' | 'rejected' | 'archived';
export type LicenseType = 'mit' | 'apache-2.0' | 'gpl-3.0' | 'proprietary' | 'custom';
export type PricingTier = 'free' | 'premium' | 'enterprise';

export interface MarketplaceListing {
  id: string;
  publisherId: string;
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  category: string;
  tags: string[];
  version: string;
  license: LicenseType;
  pricing: PricingTier;
  price?: number;
  workflow: Record<string, unknown>;
  screenshots: string[];
  iconUrl?: string;
  status: ListingStatus;
  downloads: number;
  rating: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface Publisher {
  id: string;
  userId: string;
  name: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  website?: string;
  verified: boolean;
  listingsCount: number;
  totalDownloads: number;
  createdAt: string;
}

export interface Review {
  id: string;
  listingId: string;
  userId: string;
  rating: number; // 1-5
  title: string;
  content: string;
  helpful: number;
  verified: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Installation {
  id: string;
  listingId: string;
  userId: string;
  version: string;
  installedAt: string;
  lastUsed?: string;
}

export interface SearchFilters {
  category?: string;
  pricing?: PricingTier[];
  minRating?: number;
  tags?: string[];
  license?: LicenseType[];
  verified?: boolean;
}

export interface SearchSort {
  field: 'relevance' | 'downloads' | 'rating' | 'createdAt' | 'updatedAt';
  direction: 'asc' | 'desc';
}

export interface SearchResult {
  listings: MarketplaceListing[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  parentId?: string;
  icon?: string;
  listingCount: number;
  children?: Category[];
}

export interface FeaturedListing extends MarketplaceListing {
  featuredScore: number;
  featuredReason: string;
}

export interface TrendingListing extends MarketplaceListing {
  trendingScore: number;
  recentDownloads: number;
  downloadGrowth: number;
}

export interface ListingDependency {
  listingId: string;
  requiredCredentials: string[];
  requiredNodes: string[];
  minN8nVersion?: string;
}

export interface UpdateInfo {
  listingId: string;
  currentVersion: string;
  latestVersion: string;
  changeLog: string;
  breaking: boolean;
}
