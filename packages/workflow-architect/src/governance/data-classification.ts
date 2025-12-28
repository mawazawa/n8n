/**
 * Data Classification
 * Automatically classify data based on content and apply appropriate governance controls
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import {
  DataClassification,
  DataClassificationLevel,
  DataCategory,
  PIIType,
  DataClassificationSchema,
} from './types';

export class DataClassifier {
  // PII detection patterns
  private readonly piiPatterns: Record<PIIType, RegExp> = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    credit_card: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
    phone: /\b(?:\+?1[-.]?)?\(?([0-9]{3})\)?[-.]?([0-9]{3})[-.]?([0-9]{4})\b/g,
    passport: /\b[A-Z]{1,2}\d{6,9}\b/g,
    drivers_license: /\b[A-Z]{1,2}\d{5,8}\b/g,
    ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    name: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,
    address: /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b/gi,
    biometric: /\b(?:fingerprint|retina|facial|biometric)\b/gi,
  };

  // PHI (Protected Health Information) keywords
  private readonly phiKeywords = [
    'diagnosis',
    'patient',
    'medical',
    'health',
    'prescription',
    'treatment',
    'symptom',
    'condition',
    'medication',
    'doctor',
    'hospital',
    'clinic',
  ];

  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Classify data and detect sensitive information
   */
  async classify(dataId: string, data: Record<string, unknown>): Promise<DataClassification> {
    const dataString = JSON.stringify(data);

    // Detect PII
    const detectedPII = this.detectPII(dataString);

    // Detect PHI
    const detectedPHI = this.detectPHI(dataString);

    // Detect categories
    const categories = this.detectCategories(data, dataString);

    // Determine classification level
    const level = this.determineLevel(detectedPII, detectedPHI, categories);

    const classification: DataClassification = {
      dataId,
      level,
      categories,
      detectedPII,
      detectedPHI,
      classifiedAt: new Date().toISOString(),
      classifiedBy: 'auto',
    };

    // Validate and store
    DataClassificationSchema.parse(classification);
    await this.storeClassification(classification);

    return classification;
  }

  /**
   * Detect PII in data
   */
  private detectPII(dataString: string): PIIType[] {
    const detected: PIIType[] = [];

    for (const [type, pattern] of Object.entries(this.piiPatterns)) {
      if (pattern.test(dataString)) {
        detected.push(type as PIIType);
      }
    }

    return detected;
  }

  /**
   * Detect PHI (Protected Health Information)
   */
  private detectPHI(dataString: string): boolean {
    const lowerData = dataString.toLowerCase();
    return this.phiKeywords.some((keyword) => lowerData.includes(keyword));
  }

  /**
   * Detect data categories
   */
  private detectCategories(data: Record<string, unknown>, dataString: string): DataCategory[] {
    const categories: DataCategory[] = [];
    const lowerData = dataString.toLowerCase();

    // Financial data
    if (
      lowerData.includes('payment') ||
      lowerData.includes('credit') ||
      lowerData.includes('bank') ||
      lowerData.includes('transaction')
    ) {
      categories.push('financial');
    }

    // Health data
    if (this.detectPHI(dataString)) {
      categories.push('health');
    }

    // Personal identity
    if (
      lowerData.includes('name') ||
      lowerData.includes('email') ||
      lowerData.includes('phone') ||
      lowerData.includes('address')
    ) {
      categories.push('personal_identity');
    }

    // Credentials
    if (
      lowerData.includes('password') ||
      lowerData.includes('token') ||
      lowerData.includes('secret') ||
      lowerData.includes('api_key')
    ) {
      categories.push('credentials');
    }

    // Legal
    if (lowerData.includes('contract') || lowerData.includes('agreement') || lowerData.includes('legal')) {
      categories.push('legal');
    }

    // Customer data
    if (lowerData.includes('customer') || lowerData.includes('client') || lowerData.includes('user')) {
      categories.push('customer_data');
    }

    // Employee data
    if (lowerData.includes('employee') || lowerData.includes('staff') || lowerData.includes('personnel')) {
      categories.push('employee_data');
    }

    return categories;
  }

  /**
   * Determine classification level
   */
  private determineLevel(
    pii: PIIType[],
    phi: boolean,
    categories: DataCategory[],
  ): DataClassificationLevel {
    // Restricted: PHI, SSN, credit cards, credentials
    if (
      phi ||
      pii.includes('ssn') ||
      pii.includes('credit_card') ||
      pii.includes('passport') ||
      categories.includes('credentials') ||
      categories.includes('health')
    ) {
      return DataClassificationLevel.RESTRICTED;
    }

    // Confidential: PII, financial, legal
    if (
      pii.length > 0 ||
      categories.includes('financial') ||
      categories.includes('legal') ||
      categories.includes('personal_identity')
    ) {
      return DataClassificationLevel.CONFIDENTIAL;
    }

    // Internal: customer/employee data
    if (categories.includes('customer_data') || categories.includes('employee_data')) {
      return DataClassificationLevel.INTERNAL;
    }

    // Default to internal for safety
    return DataClassificationLevel.INTERNAL;
  }

  /**
   * Store classification in database
   */
  private async storeClassification(classification: DataClassification): Promise<void> {
    const { error } = await this.supabase
      .from('governance_data_classifications')
      .upsert({
        data_id: classification.dataId,
        level: classification.level,
        categories: classification.categories,
        detected_pii: classification.detectedPII,
        detected_phi: classification.detectedPHI,
        inherited_from: classification.inheritedFrom,
        classified_at: classification.classifiedAt,
        classified_by: classification.classifiedBy,
        reviewed_at: classification.reviewedAt,
        reviewed_by: classification.reviewedBy,
        expires_at: classification.expiresAt,
        metadata: classification.metadata,
      });

    if (error) {
      throw new Error(`Failed to store classification: ${error.message}`);
    }
  }

  /**
   * Get classification for data
   */
  async getClassification(dataId: string): Promise<DataClassification | null> {
    const { data, error } = await this.supabase
      .from('governance_data_classifications')
      .select('*')
      .eq('data_id', dataId)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      dataId: data.data_id,
      level: data.level,
      categories: data.categories,
      detectedPII: data.detected_pii,
      detectedPHI: data.detected_phi,
      inheritedFrom: data.inherited_from,
      classifiedAt: data.classified_at,
      classifiedBy: data.classified_by,
      reviewedAt: data.reviewed_at,
      reviewedBy: data.reviewed_by,
      expiresAt: data.expires_at,
      metadata: data.metadata,
    };
  }

  /**
   * Update classification (manual review)
   */
  async updateClassification(
    dataId: string,
    level: DataClassificationLevel,
    reviewedBy: string,
    categories?: DataCategory[],
  ): Promise<void> {
    const { error } = await this.supabase
      .from('governance_data_classifications')
      .update({
        level,
        categories,
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewedBy,
      })
      .eq('data_id', dataId);

    if (error) {
      throw new Error(`Failed to update classification: ${error.message}`);
    }
  }

  /**
   * Inherit classification from parent
   */
  async inheritClassification(dataId: string, parentId: string): Promise<DataClassification> {
    const parentClassification = await this.getClassification(parentId);

    if (!parentClassification) {
      throw new Error(`Parent classification not found: ${parentId}`);
    }

    const classification: DataClassification = {
      ...parentClassification,
      dataId,
      inheritedFrom: parentId,
      classifiedAt: new Date().toISOString(),
      classifiedBy: 'inherited',
    };

    await this.storeClassification(classification);

    return classification;
  }

  /**
   * Bulk classify multiple data items
   */
  async bulkClassify(items: Array<{ id: string; data: Record<string, unknown> }>): Promise<DataClassification[]> {
    const classifications: DataClassification[] = [];

    for (const item of items) {
      const classification = await this.classify(item.id, item.data);
      classifications.push(classification);
    }

    return classifications;
  }

  /**
   * Get summary of classifications
   */
  async getClassificationSummary(): Promise<Record<DataClassificationLevel, number>> {
    const { data, error } = await this.supabase
      .from('governance_data_classifications')
      .select('level');

    if (error) {
      throw new Error(`Failed to get summary: ${error.message}`);
    }

    const summary: Record<DataClassificationLevel, number> = {
      [DataClassificationLevel.PUBLIC]: 0,
      [DataClassificationLevel.INTERNAL]: 0,
      [DataClassificationLevel.CONFIDENTIAL]: 0,
      [DataClassificationLevel.RESTRICTED]: 0,
    };

    for (const row of data || []) {
      summary[row.level as DataClassificationLevel]++;
    }

    return summary;
  }
}
