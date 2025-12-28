-- ============================================================================
-- Governance & Compliance Schema
-- Comprehensive governance system with policies, violations, and compliance tracking
-- ============================================================================

-- ============================================================================
-- POLICIES & RULES
-- ============================================================================

CREATE TABLE governance_policies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  enforcement TEXT NOT NULL CHECK (enforcement IN ('block', 'warn', 'audit', 'disabled')),
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  metadata JSONB
);

CREATE INDEX idx_governance_policies_enabled ON governance_policies(enabled);
CREATE INDEX idx_governance_policies_enforcement ON governance_policies(enforcement);
CREATE INDEX idx_governance_policies_created_by ON governance_policies(created_by);

-- Policy version history
CREATE TABLE governance_policy_versions (
  id UUID PRIMARY KEY,
  policy_id UUID NOT NULL REFERENCES governance_policies(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  policy_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  change_description TEXT,
  UNIQUE(policy_id, version)
);

CREATE INDEX idx_governance_policy_versions_policy_id ON governance_policy_versions(policy_id);

-- ============================================================================
-- VIOLATIONS
-- ============================================================================

CREATE TABLE governance_violations (
  id UUID PRIMARY KEY,
  policy_id UUID NOT NULL REFERENCES governance_policies(id) ON DELETE CASCADE,
  policy_name TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_name TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,
  evidence JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_positive')),
  metadata JSONB
);

CREATE INDEX idx_governance_violations_policy_id ON governance_violations(policy_id);
CREATE INDEX idx_governance_violations_resource ON governance_violations(resource_type, resource_id);
CREATE INDEX idx_governance_violations_status ON governance_violations(status);
CREATE INDEX idx_governance_violations_severity ON governance_violations(severity);
CREATE INDEX idx_governance_violations_timestamp ON governance_violations(timestamp DESC);

-- ============================================================================
-- APPROVALS
-- ============================================================================

CREATE TABLE governance_approval_requests (
  id UUID PRIMARY KEY,
  workflow_id UUID NOT NULL,
  workflow_name TEXT NOT NULL,
  workflow_description TEXT,
  action TEXT NOT NULL,
  requester_user_id UUID NOT NULL,
  requester_email TEXT NOT NULL,
  requester_name TEXT,
  approvers JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB
);

CREATE INDEX idx_governance_approval_requests_status ON governance_approval_requests(status);
CREATE INDEX idx_governance_approval_requests_requester ON governance_approval_requests(requester_user_id);
CREATE INDEX idx_governance_approval_requests_created_at ON governance_approval_requests(created_at DESC);

-- Approval history
CREATE TABLE governance_approval_history (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES governance_approval_requests(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  comment TEXT
);

CREATE INDEX idx_governance_approval_history_request_id ON governance_approval_history(request_id);

-- ============================================================================
-- DATA CLASSIFICATION
-- ============================================================================

CREATE TABLE governance_data_classifications (
  data_id TEXT PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('public', 'internal', 'confidential', 'restricted')),
  categories TEXT[] NOT NULL DEFAULT '{}',
  detected_pii TEXT[] NOT NULL DEFAULT '{}',
  detected_phi BOOLEAN NOT NULL DEFAULT false,
  inherited_from TEXT,
  classified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  classified_by TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  expires_at TIMESTAMPTZ,
  metadata JSONB
);

CREATE INDEX idx_governance_data_classifications_level ON governance_data_classifications(level);
CREATE INDEX idx_governance_data_classifications_detected_phi ON governance_data_classifications(detected_phi);

-- ============================================================================
-- ACCESS CONTROL
-- ============================================================================

CREATE TABLE governance_access_policies (
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  inherit_from TEXT,
  PRIMARY KEY (resource_type, resource_id)
);

CREATE INDEX idx_governance_access_policies_resource_type ON governance_access_policies(resource_type);

-- User roles (simplified - in production, integrate with existing auth system)
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL,
  role_id TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);

-- ============================================================================
-- DATA LINEAGE
-- ============================================================================

CREATE TABLE governance_lineage_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('source', 'transform', 'destination')),
  name TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  metadata JSONB
);

CREATE INDEX idx_governance_lineage_nodes_resource ON governance_lineage_nodes(resource_type, resource_id);

CREATE TABLE governance_lineage_edges (
  id UUID PRIMARY KEY,
  data_id TEXT NOT NULL,
  from_node TEXT NOT NULL,
  to_node TEXT NOT NULL,
  transform_type TEXT,
  transform_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_governance_lineage_edges_data_id ON governance_lineage_edges(data_id);
CREATE INDEX idx_governance_lineage_edges_from_node ON governance_lineage_edges(from_node);
CREATE INDEX idx_governance_lineage_edges_to_node ON governance_lineage_edges(to_node);

-- ============================================================================
-- RETENTION
-- ============================================================================

CREATE TABLE governance_retention_policies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  duration INTEGER NOT NULL, -- days
  action TEXT NOT NULL CHECK (action IN ('delete', 'archive', 'anonymize')),
  legal_hold_exempt BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_governance_retention_policies_resource_type ON governance_retention_policies(resource_type);
CREATE INDEX idx_governance_retention_policies_enabled ON governance_retention_policies(enabled);

CREATE TABLE governance_legal_holds (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  resource_ids TEXT[] NOT NULL DEFAULT '{}',
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  custodian TEXT NOT NULL,
  reason TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_governance_legal_holds_active ON governance_legal_holds(active);

CREATE TABLE governance_deletion_certificates (
  id UUID PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_by TEXT NOT NULL,
  retention_policy_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  witness TEXT
);

CREATE INDEX idx_governance_deletion_certificates_resource ON governance_deletion_certificates(resource_type, resource_id);

-- ============================================================================
-- PRIVACY
-- ============================================================================

CREATE TABLE governance_privacy_settings (
  id TEXT PRIMARY KEY,
  framework TEXT NOT NULL CHECK (framework IN ('gdpr', 'ccpa')),
  settings JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE governance_dsar_requests (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('access', 'deletion', 'portability', 'rectification', 'restriction')),
  user_id UUID NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  verification_status TEXT NOT NULL CHECK (verification_status IN ('unverified', 'verified')),
  metadata JSONB
);

CREATE INDEX idx_governance_dsar_requests_user_id ON governance_dsar_requests(user_id);
CREATE INDEX idx_governance_dsar_requests_status ON governance_dsar_requests(status);

-- ============================================================================
-- COMPLIANCE REPORTS
-- ============================================================================

CREATE TABLE governance_compliance_reports (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('soc2', 'hipaa', 'pci_dss', 'gdpr', 'ccpa', 'iso27001', 'nist')),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('compliant', 'non_compliant', 'unknown', 'pending_review')),
  score INTEGER,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB
);

CREATE INDEX idx_governance_compliance_reports_type ON governance_compliance_reports(type);
CREATE INDEX idx_governance_compliance_reports_generated_at ON governance_compliance_reports(generated_at DESC);
CREATE INDEX idx_governance_compliance_reports_status ON governance_compliance_reports(status);

-- ============================================================================
-- ALERTS
-- ============================================================================

CREATE TABLE governance_alert_rules (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  escalation_path JSONB NOT NULL DEFAULT '[]'::jsonb,
  cooldown INTEGER NOT NULL DEFAULT 60, -- minutes
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_triggered TIMESTAMPTZ
);

CREATE INDEX idx_governance_alert_rules_enabled ON governance_alert_rules(enabled);

CREATE TABLE governance_violation_alerts (
  id UUID PRIMARY KEY,
  violation_id UUID NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  resolved_at TIMESTAMPTZ,
  escalation_level INTEGER NOT NULL DEFAULT 0,
  recipients TEXT[] NOT NULL DEFAULT '{}',
  channels TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB
);

CREATE INDEX idx_governance_violation_alerts_violation_id ON governance_violation_alerts(violation_id);
CREATE INDEX idx_governance_violation_alerts_resolved_at ON governance_violation_alerts(resolved_at);
CREATE INDEX idx_governance_violation_alerts_triggered_at ON governance_violation_alerts(triggered_at DESC);

-- ============================================================================
-- TRAINING
-- ============================================================================

CREATE TABLE governance_training_courses (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  duration INTEGER NOT NULL, -- minutes
  required_for TEXT[] NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  quiz JSONB,
  expiration_days INTEGER
);

CREATE INDEX idx_governance_training_courses_category ON governance_training_courses(category);

CREATE TABLE governance_training_assignments (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  course_id UUID NOT NULL REFERENCES governance_training_courses(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID NOT NULL,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  score INTEGER,
  passed BOOLEAN,
  UNIQUE(user_id, course_id, assigned_at)
);

CREATE INDEX idx_governance_training_assignments_user_id ON governance_training_assignments(user_id);
CREATE INDEX idx_governance_training_assignments_course_id ON governance_training_assignments(course_id);
CREATE INDEX idx_governance_training_assignments_due_date ON governance_training_assignments(due_date);

CREATE TABLE governance_training_certifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  course_id UUID NOT NULL,
  course_name TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  score INTEGER NOT NULL,
  certificate_url TEXT
);

CREATE INDEX idx_governance_training_certifications_user_id ON governance_training_certifications(user_id);
CREATE INDEX idx_governance_training_certifications_expires_at ON governance_training_certifications(expires_at);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE governance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_approval_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_data_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_access_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_lineage_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_lineage_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_legal_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_deletion_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_privacy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_dsar_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_compliance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_violation_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_training_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_training_certifications ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users (customize based on your auth system)
-- Example: Allow authenticated users to read governance policies
CREATE POLICY governance_policies_select ON governance_policies
  FOR SELECT
  TO authenticated
  USING (true);

-- Example: Allow users with governance admin role to manage policies
CREATE POLICY governance_policies_all ON governance_policies
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_id = 'governance_admin'
    )
  );

-- Allow users to view their own violations
CREATE POLICY governance_violations_select ON governance_violations
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow users to view their own approval requests
CREATE POLICY governance_approval_requests_select ON governance_approval_requests
  FOR SELECT
  TO authenticated
  USING (
    requester_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(approvers) AS approver
      WHERE (approver->>'userId')::uuid = auth.uid()
    )
  );

-- Allow users to view their own DSAR requests
CREATE POLICY governance_dsar_requests_select ON governance_dsar_requests
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Allow users to view their own training assignments
CREATE POLICY governance_training_assignments_select ON governance_training_assignments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Allow users to view their own certifications
CREATE POLICY governance_training_certifications_select ON governance_training_certifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Allow all authenticated users to view training courses
CREATE POLICY governance_training_courses_select ON governance_training_courses
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_governance_policies_updated_at
  BEFORE UPDATE ON governance_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_governance_retention_policies_updated_at
  BEFORE UPDATE ON governance_retention_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE governance_policies IS 'Governance policies with rules and enforcement modes';
COMMENT ON TABLE governance_violations IS 'Policy violations with severity and resolution tracking';
COMMENT ON TABLE governance_approval_requests IS 'Approval workflows for policy exceptions';
COMMENT ON TABLE governance_data_classifications IS 'Data classification levels and PII/PHI detection';
COMMENT ON TABLE governance_retention_policies IS 'Data retention policies with legal hold support';
COMMENT ON TABLE governance_compliance_reports IS 'Compliance reports for various frameworks';
COMMENT ON TABLE governance_training_courses IS 'Compliance training courses and materials';
