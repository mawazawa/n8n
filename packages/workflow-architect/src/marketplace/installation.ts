/**
 * Installation Manager
 *
 * Handles one-click workflow installation with dependency resolution
 * and credential requirement checking.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { Installation, ListingDependency, UpdateInfo } from './types';

interface InstallOptions {
  userId: string;
  listingId: string;
  version?: string;
}

export class InstallationManager {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Install a workflow from marketplace
   */
  async install(options: InstallOptions): Promise<Installation> {
    const { userId, listingId, version } = options;

    // Get listing details
    const { data: listing, error: listingError } = await this.supabase
      .from('marketplace_listings')
      .select('*')
      .eq('id', listingId)
      .single();

    if (listingError) {
      throw new Error(`Failed to get listing: ${listingError.message}`);
    }

    if (listing.status !== 'published') {
      throw new Error('Cannot install unpublished listing');
    }

    // Check dependencies
    const dependencies = await this.getDependencies(listingId);
    if (dependencies) {
      await this.validateDependencies(dependencies);
    }

    // Check if already installed
    const existing = await this.getInstallation(userId, listingId);

    if (existing) {
      // Update existing installation
      const { data, error } = await this.supabase
        .from('marketplace_installations')
        .update({
          version: version ?? listing.version,
          installed_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update installation: ${error.message}`);
      }

      // Increment download count
      await this.incrementDownloads(listingId);

      return this.mapToInstallation(data);
    }

    // Create new installation
    const { data, error } = await this.supabase
      .from('marketplace_installations')
      .insert({
        listing_id: listingId,
        user_id: userId,
        version: version ?? listing.version,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to install: ${error.message}`);
    }

    // Increment download count
    await this.incrementDownloads(listingId);

    return this.mapToInstallation(data);
  }

  /**
   * Uninstall a workflow
   */
  async uninstall(userId: string, listingId: string): Promise<void> {
    const { error } = await this.supabase
      .from('marketplace_installations')
      .delete()
      .eq('user_id', userId)
      .eq('listing_id', listingId);

    if (error) {
      throw new Error(`Failed to uninstall: ${error.message}`);
    }
  }

  /**
   * Get user's installation
   */
  async getInstallation(userId: string, listingId: string): Promise<Installation | null> {
    const { data, error } = await this.supabase
      .from('marketplace_installations')
      .select('*')
      .eq('user_id', userId)
      .eq('listing_id', listingId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get installation: ${error.message}`);
    }

    return this.mapToInstallation(data);
  }

  /**
   * Get all installed workflows for a user
   */
  async getInstalled(userId: string): Promise<Installation[]> {
    const { data, error } = await this.supabase
      .from('marketplace_installations')
      .select('*')
      .eq('user_id', userId)
      .order('installed_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get installed workflows: ${error.message}`);
    }

    return data.map(this.mapToInstallation);
  }

  /**
   * Check for updates on installed workflows
   */
  async checkForUpdates(userId: string): Promise<UpdateInfo[]> {
    const installations = await this.getInstalled(userId);
    const updates: UpdateInfo[] = [];

    for (const installation of installations) {
      const { data: listing, error } = await this.supabase
        .from('marketplace_listings')
        .select('version')
        .eq('id', installation.listingId)
        .single();

      if (error) {
        continue; // Skip if listing not found
      }

      const currentVersion = installation.version;
      const latestVersion = listing.version;

      if (this.isNewer(latestVersion, currentVersion)) {
        updates.push({
          listingId: installation.listingId,
          currentVersion,
          latestVersion,
          changeLog: 'Update available', // In production, fetch from changelog
          breaking: this.isBreakingChange(currentVersion, latestVersion),
        });
      }
    }

    return updates;
  }

  /**
   * Update last used timestamp
   */
  async updateLastUsed(userId: string, listingId: string): Promise<void> {
    const { error } = await this.supabase
      .from('marketplace_installations')
      .update({
        last_used: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('listing_id', listingId);

    if (error) {
      throw new Error(`Failed to update last used: ${error.message}`);
    }
  }

  /**
   * Get dependencies for a listing
   */
  async getDependencies(listingId: string): Promise<ListingDependency | null> {
    const { data, error } = await this.supabase
      .from('listing_dependencies')
      .select('*')
      .eq('listing_id', listingId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to get dependencies: ${error.message}`);
    }

    return {
      listingId: data.listing_id,
      requiredCredentials: data.required_credentials ?? [],
      requiredNodes: data.required_nodes ?? [],
      minN8nVersion: data.min_n8n_version,
    };
  }

  /**
   * Set dependencies for a listing
   */
  async setDependencies(
    listingId: string,
    dependencies: {
      requiredCredentials?: string[];
      requiredNodes?: string[];
      minN8nVersion?: string;
    }
  ): Promise<ListingDependency> {
    const { data, error } = await this.supabase
      .from('listing_dependencies')
      .upsert({
        listing_id: listingId,
        required_credentials: dependencies.requiredCredentials ?? [],
        required_nodes: dependencies.requiredNodes ?? [],
        min_n8n_version: dependencies.minN8nVersion,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to set dependencies: ${error.message}`);
    }

    return {
      listingId: data.listing_id,
      requiredCredentials: data.required_credentials ?? [],
      requiredNodes: data.required_nodes ?? [],
      minN8nVersion: data.min_n8n_version,
    };
  }

  /**
   * Validate dependencies before installation
   */
  private async validateDependencies(dependencies: ListingDependency): Promise<void> {
    const warnings: string[] = [];

    if (dependencies.requiredCredentials.length > 0) {
      warnings.push(
        `Requires credentials: ${dependencies.requiredCredentials.join(', ')}`
      );
    }

    if (dependencies.requiredNodes.length > 0) {
      warnings.push(
        `Requires nodes: ${dependencies.requiredNodes.join(', ')}`
      );
    }

    if (dependencies.minN8nVersion) {
      warnings.push(
        `Requires n8n version ${dependencies.minN8nVersion} or higher`
      );
    }

    // In production, these would be actual validation errors
    // For now, just collect warnings
    if (warnings.length > 0) {
      console.warn('Installation requirements:', warnings);
    }
  }

  /**
   * Increment download count
   */
  private async incrementDownloads(listingId: string): Promise<void> {
    const { error } = await this.supabase.rpc('increment_download_count', {
      listing_uuid: listingId,
    });

    if (error) {
      // Don't fail installation if download count update fails
      console.error('Failed to increment downloads:', error);
    }
  }

  /**
   * Compare semantic versions (simple implementation)
   */
  private isNewer(version1: string, version2: string): boolean {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1 = v1Parts[i] ?? 0;
      const v2 = v2Parts[i] ?? 0;

      if (v1 > v2) return true;
      if (v1 < v2) return false;
    }

    return false;
  }

  /**
   * Check if version change is breaking (major version change)
   */
  private isBreakingChange(currentVersion: string, newVersion: string): boolean {
    const current = currentVersion.split('.')[0];
    const newer = newVersion.split('.')[0];

    return current !== newer;
  }

  /**
   * Get installation statistics
   */
  async getInstallationStats(listingId: string): Promise<{
    totalInstalls: number;
    activeUsers: number;
    recentInstalls: number;
  }> {
    const { data, error } = await this.supabase
      .from('marketplace_installations')
      .select('installed_at, last_used')
      .eq('listing_id', listingId);

    if (error) {
      throw new Error(`Failed to get installation stats: ${error.message}`);
    }

    const totalInstalls = data.length;

    // Active users (used in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeUsers = data.filter(
      (install) =>
        install.last_used && new Date(install.last_used) > thirtyDaysAgo
    ).length;

    // Recent installs (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentInstalls = data.filter(
      (install) => new Date(install.installed_at) > sevenDaysAgo
    ).length;

    return {
      totalInstalls,
      activeUsers,
      recentInstalls,
    };
  }

  /**
   * Map database row to Installation
   */
  private mapToInstallation(data: Record<string, unknown>): Installation {
    return {
      id: data.id as string,
      listingId: data.listing_id as string,
      userId: data.user_id as string,
      version: data.version as string,
      installedAt: data.installed_at as string,
      lastUsed: data.last_used as string | undefined,
    };
  }
}
