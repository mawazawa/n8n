/**
 * Governance REST API
 * Express routes for governance operations
 */

import { Router } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { PolicyManager, PolicyCreateInput, PolicyUpdateInput } from './policies';
import { PolicyEnforcer, EnforcementContext } from './enforcement';
import { ApprovalManager } from './approval';
import { DataClassifier } from './data-classification';
import { ComplianceReporter, ReportFormat } from './reports';
import { ViolationAlerter } from './alerts';
import { TrainingTracker } from './training';
import {
  PolicySchema,
  ApprovalRequestSchema,
  DataClassificationLevel,
  ComplianceFramework,
  DSARRequestSchema,
} from './types';

export function createGovernanceRouter(supabase: SupabaseClient): Router {
  const router = Router();

  // Initialize managers
  const getPolicyManager = (userId: string) => new PolicyManager(supabase, userId);
  const getApprovalManager = () => new ApprovalManager(supabase);
  const dataClassifier = new DataClassifier(supabase);
  const complianceReporter = new ComplianceReporter(supabase);
  const violationAlerter = new ViolationAlerter(supabase);
  const trainingTracker = new TrainingTracker(supabase);

  // ============================================================================
  // POLICIES
  // ============================================================================

  /**
   * List all policies
   * GET /governance/policies
   */
  router.get('/policies', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      const policyManager = getPolicyManager(userId);

      const filters = {
        enabled: req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined,
        enforcement: req.query.enforcement as string | undefined,
        organizationId: req.query.organizationId as string | undefined,
        search: req.query.search as string | undefined,
      };

      const policies = await policyManager.list(filters);
      res.json({ policies });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Get a specific policy
   * GET /governance/policies/:id
   */
  router.get('/policies/:id', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      const policyManager = getPolicyManager(userId);

      const policy = await policyManager.get(req.params.id);

      if (!policy) {
        return res.status(404).json({ error: 'Policy not found' });
      }

      res.json({ policy });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Create a new policy
   * POST /governance/policies
   */
  router.post('/policies', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      const policyManager = getPolicyManager(userId);

      const input = req.body as PolicyCreateInput;
      const policy = await policyManager.create(input);

      res.status(201).json({ policy });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Update a policy
   * PATCH /governance/policies/:id
   */
  router.patch('/policies/:id', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      const policyManager = getPolicyManager(userId);

      const updates = req.body as PolicyUpdateInput;
      const changeDescription = req.body.changeDescription as string | undefined;

      await policyManager.update(req.params.id, updates, changeDescription);

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Delete a policy
   * DELETE /governance/policies/:id
   */
  router.delete('/policies/:id', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      const policyManager = getPolicyManager(userId);

      await policyManager.delete(req.params.id);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ============================================================================
  // COMPLIANCE CHECKING
  // ============================================================================

  /**
   * Check compliance for a resource
   * POST /governance/check
   */
  router.post('/check', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      const policyManager = getPolicyManager(userId);
      const approvalManager = getApprovalManager();
      const policyEnforcer = new PolicyEnforcer(supabase, policyManager, approvalManager);

      const context: EnforcementContext = {
        action: req.body.action || 'check',
        resource: req.body.resource,
        resourceType: req.body.resourceType,
        resourceId: req.body.resourceId,
        resourceName: req.body.resourceName,
        userId,
        organizationId: req.body.organizationId,
        metadata: req.body.metadata,
      };

      const result = await policyEnforcer.enforce(context);

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ============================================================================
  // VIOLATIONS
  // ============================================================================

  /**
   * List violations
   * GET /governance/violations
   */
  router.get('/violations', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      const policyManager = getPolicyManager(userId);
      const approvalManager = getApprovalManager();
      const policyEnforcer = new PolicyEnforcer(supabase, policyManager, approvalManager);

      const resourceType = req.query.resourceType as string;
      const resourceId = req.query.resourceId as string;
      const status = req.query.status as 'open' | 'acknowledged' | 'resolved' | 'false_positive' | undefined;

      const violations = await policyEnforcer.getViolations(resourceType, resourceId, status);

      res.json({ violations });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Resolve a violation
   * POST /governance/violations/:id/resolve
   */
  router.post('/violations/:id/resolve', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      const policyManager = getPolicyManager(userId);
      const approvalManager = getApprovalManager();
      const policyEnforcer = new PolicyEnforcer(supabase, policyManager, approvalManager);

      const resolution = req.body.resolution as string;

      await policyEnforcer.resolveViolation(req.params.id, resolution, userId);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ============================================================================
  // APPROVALS
  // ============================================================================

  /**
   * Request approval
   * POST /governance/approvals
   */
  router.post('/approvals', async (req, res) => {
    try {
      const approvalManager = getApprovalManager();

      const request = await approvalManager.requestApproval(req.body);

      res.status(201).json({ request });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Approve a request
   * POST /governance/approvals/:id/approve
   */
  router.post('/approvals/:id/approve', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      const approvalManager = getApprovalManager();

      const comment = req.body.comment as string | undefined;

      await approvalManager.approve(req.params.id, userId, comment);

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Reject a request
   * POST /governance/approvals/:id/reject
   */
  router.post('/approvals/:id/reject', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      const approvalManager = getApprovalManager();

      const reason = req.body.reason as string;

      await approvalManager.reject(req.params.id, userId, reason);

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Get pending approvals for user
   * GET /governance/approvals/pending
   */
  router.get('/approvals/pending', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      const approvalManager = getApprovalManager();

      const requests = await approvalManager.getPendingApprovals(userId);

      res.json({ requests });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ============================================================================
  // COMPLIANCE REPORTS
  // ============================================================================

  /**
   * Generate compliance report
   * GET /governance/reports/:type
   */
  router.get('/reports/:type', async (req, res) => {
    try {
      const type = req.params.type.toUpperCase() as ComplianceFramework;
      const format = (req.query.format as ReportFormat) || 'json';

      const period = {
        start: req.query.startDate as string || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        end: req.query.endDate as string || new Date().toISOString(),
      };

      const report = await complianceReporter.generateReport(type, period, format);

      res.json({ report });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ============================================================================
  // DATA CLASSIFICATION
  // ============================================================================

  /**
   * Classify data
   * POST /governance/classify
   */
  router.post('/classify', async (req, res) => {
    try {
      const dataId = req.body.dataId as string;
      const data = req.body.data as Record<string, unknown>;

      const classification = await dataClassifier.classify(dataId, data);

      res.json({ classification });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Get classification
   * GET /governance/classify/:dataId
   */
  router.get('/classify/:dataId', async (req, res) => {
    try {
      const classification = await dataClassifier.getClassification(req.params.dataId);

      if (!classification) {
        return res.status(404).json({ error: 'Classification not found' });
      }

      res.json({ classification });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ============================================================================
  // ALERTS
  // ============================================================================

  /**
   * Get active alerts
   * GET /governance/alerts
   */
  router.get('/alerts', async (req, res) => {
    try {
      const alerts = await violationAlerter.getActiveAlerts();

      res.json({ alerts });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Acknowledge an alert
   * POST /governance/alerts/:id/acknowledge
   */
  router.post('/alerts/:id/acknowledge', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;

      await violationAlerter.acknowledge(req.params.id, userId);

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ============================================================================
  // TRAINING
  // ============================================================================

  /**
   * Get training compliance status
   * GET /governance/training/compliance
   */
  router.get('/training/compliance', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;

      const status = await trainingTracker.getCompliance(userId);

      res.json({ status });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Complete training
   * POST /governance/training/:courseId/complete
   */
  router.post('/training/:courseId/complete', async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] as string;
      const quizAnswers = req.body.quizAnswers as number[] | undefined;

      const assignment = await trainingTracker.trackCompletion(userId, req.params.courseId, quizAnswers);

      res.json({ assignment });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * List training courses
   * GET /governance/training/courses
   */
  router.get('/training/courses', async (req, res) => {
    try {
      const category = req.query.category as string | undefined;

      const courses = await trainingTracker.listCourses(category);

      res.json({ courses });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  return router;
}
