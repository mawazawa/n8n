# Workflow Architect Operations Runbook

This runbook provides operational procedures for running Workflow Architect in production.

## Table of Contents

1. [Service Overview](#service-overview)
2. [Architecture](#architecture)
3. [Monitoring](#monitoring)
4. [Deployment](#deployment)
5. [Incident Response](#incident-response)
6. [Common Issues](#common-issues)
7. [Maintenance](#maintenance)
8. [Scaling](#scaling)
9. [Backup & Recovery](#backup--recovery)
10. [Performance Tuning](#performance-tuning)

---

## Service Overview

**Service Name:** Workflow Architect
**Description:** OSS Agentic Workflow Builder for n8n
**Technology:** Node.js, TypeScript, Express, React
**Version:** 0.1.0

### Service Dependencies

- **n8n**: Workflow automation platform (port 5678)
- **Supabase**: Database and authentication
- **AI APIs**: Anthropic Claude, OpenAI (optional)
- **Vector DB**: ChromaDB for RAG functionality

### Service Level Objectives (SLOs)

- **Availability**: 99.9% uptime
- **Latency**: P95 < 500ms, P99 < 1s
- **Error Rate**: < 0.1%
- **Request Timeout**: 30s maximum

---

## Architecture

### System Components

```
┌─────────────────┐
│     Users       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Load Balancer │
│    (Ingress)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│   Workflow      │─────▶│     n8n      │
│   Architect     │      └──────────────┘
│   (3+ replicas) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Supabase     │
│   (PostgreSQL)  │
└─────────────────┘
```

### Network Ports

- **3080**: Application HTTP port
- **5678**: n8n API endpoint
- **9090**: Metrics endpoint (Prometheus)

---

## Monitoring

### Health Checks

#### Liveness Probe
```bash
curl http://localhost:3080/liveness
# Expected: {"status":"ok"}
```

#### Readiness Probe
```bash
curl http://localhost:3080/readiness
# Expected: {"ready":true,"status":"healthy"}
```

#### Full Health Check
```bash
curl http://localhost:3080/health
```

Response includes:
- Overall status (healthy/degraded/unhealthy)
- Dependency status (n8n, Supabase, AI models)
- Latency measurements
- Uptime

### Metrics

Prometheus metrics available at `/metrics`:

**Key Metrics:**
- `workflow_architect_http_requests_total` - Total HTTP requests
- `workflow_architect_http_request_duration_seconds` - Request latency
- `workflow_architect_errors_total` - Error count by type
- `workflow_architect_http_requests_active` - Active requests
- `process_memory_bytes` - Memory usage
- `process_cpu_seconds_total` - CPU usage

### Logs

**Log Levels:**
- `DEBUG`: Detailed debugging information
- `INFO`: General informational messages
- `WARN`: Warning messages
- `ERROR`: Error messages with stack traces

**Log Format:**
```
[timestamp] [LEVEL] [service] message {context}
```

**View Logs (Kubernetes):**
```bash
kubectl logs -f deployment/workflow-architect
kubectl logs -f deployment/workflow-architect --previous  # Previous crash
```

**View Logs (Docker):**
```bash
docker-compose logs -f workflow-architect
docker logs -f workflow-architect
```

### Alerts

Configure alerts for:

1. **High Error Rate**
   - Condition: Error rate > 1% over 5 minutes
   - Action: Page on-call engineer

2. **High Latency**
   - Condition: P95 latency > 1s over 5 minutes
   - Action: Investigate performance

3. **Service Down**
   - Condition: Health check failing for 2 minutes
   - Action: Page on-call engineer

4. **High Memory Usage**
   - Condition: Memory > 80% of limit
   - Action: Check for memory leaks

5. **Rate Limit Exceeded**
   - Condition: Rate limit errors > 100/min
   - Action: Investigate traffic patterns

---

## Deployment

### Docker Deployment

```bash
# Build image
docker build -t workflow-architect:latest .

# Run with docker-compose
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f
```

### Kubernetes Deployment

```bash
# Deploy
kubectl apply -f k8s/

# Check status
kubectl get pods -l app=workflow-architect
kubectl get svc workflow-architect
kubectl get ingress workflow-architect

# View logs
kubectl logs -f deployment/workflow-architect

# Scale
kubectl scale deployment workflow-architect --replicas=5
```

### Rolling Update

```bash
# Update image
kubectl set image deployment/workflow-architect \
  workflow-architect=workflow-architect:v0.2.0

# Monitor rollout
kubectl rollout status deployment/workflow-architect

# Rollback if needed
kubectl rollout undo deployment/workflow-architect
```

---

## Incident Response

### Incident Severity Levels

- **P0**: Complete service outage
- **P1**: Major functionality broken
- **P2**: Degraded performance
- **P3**: Minor issues

### P0: Complete Service Outage

**Symptoms:**
- Health checks failing
- No traffic reaching service
- All replicas down

**Investigation:**
```bash
# Check pod status
kubectl get pods -l app=workflow-architect

# Check pod details
kubectl describe pod <pod-name>

# Check logs
kubectl logs <pod-name>

# Check events
kubectl get events --sort-by='.lastTimestamp'
```

**Common Causes:**
- Image pull failure
- Resource limits exceeded
- Configuration errors
- Database connection failure

**Resolution:**
1. Check recent deployments/changes
2. Verify configuration and secrets
3. Check resource availability
4. Rollback if needed

### P1: High Error Rate

**Symptoms:**
- Error rate > 1%
- Specific endpoints failing
- Timeouts occurring

**Investigation:**
```bash
# Check error logs
kubectl logs -f deployment/workflow-architect | grep ERROR

# Check metrics
curl http://localhost:3080/metrics | grep error_count
```

**Common Causes:**
- Downstream service failure (n8n, Supabase)
- API key issues
- Rate limiting
- Network issues

**Resolution:**
1. Check dependency health
2. Verify API keys and credentials
3. Check rate limits
4. Review recent code changes

### P2: High Latency

**Symptoms:**
- P95 latency > 1s
- Slow response times
- Request timeouts

**Investigation:**
```bash
# Check request duration metrics
curl http://localhost:3080/metrics | grep request_duration

# Check resource usage
kubectl top pods -l app=workflow-architect

# Enable debug logging
kubectl set env deployment/workflow-architect LOG_LEVEL=debug
```

**Common Causes:**
- High traffic
- Slow database queries
- Memory pressure
- CPU throttling

**Resolution:**
1. Scale horizontally
2. Optimize queries
3. Increase resource limits
4. Enable caching

---

## Common Issues

### Issue: Rate Limit Exceeded

**Symptoms:**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "retryAfter": 60
  }
}
```

**Solution:**
- Wait for rate limit window to reset
- Adjust rate limits in ConfigMap
- Implement client-side rate limiting

### Issue: Request Timeout

**Symptoms:**
```json
{
  "error": {
    "code": "REQUEST_TIMEOUT",
    "message": "Request timeout",
    "timeout": 30
  }
}
```

**Solution:**
- Increase timeout in ConfigMap
- Optimize long-running operations
- Implement async processing

### Issue: Memory Leak

**Symptoms:**
- Memory usage steadily increasing
- OOMKilled pod restarts
- Slow performance over time

**Investigation:**
```bash
# Check memory usage
kubectl top pods -l app=workflow-architect

# Get heap snapshot (if enabled)
kubectl exec -it <pod-name> -- node --heap-snapshot
```

**Solution:**
- Restart pods
- Investigate memory usage patterns
- Add memory profiling
- Increase memory limits temporarily

### Issue: n8n Connection Failure

**Symptoms:**
```json
{
  "error": {
    "code": "N8N_CONNECTION",
    "message": "Unable to connect to n8n"
  }
}
```

**Solution:**
1. Check n8n service status
2. Verify N8N_BASE_URL configuration
3. Check network connectivity
4. Verify API key

---

## Maintenance

### Routine Maintenance

**Daily:**
- Monitor error rates and latency
- Check resource usage
- Review logs for warnings

**Weekly:**
- Review and optimize slow queries
- Check for security updates
- Analyze traffic patterns

**Monthly:**
- Update dependencies
- Review and update documentation
- Capacity planning review

### Updates & Patching

**Security Updates:**
```bash
# Update base image
docker pull node:20-alpine

# Rebuild image
docker build -t workflow-architect:latest .

# Deploy
kubectl set image deployment/workflow-architect \
  workflow-architect=workflow-architect:latest
```

**Dependency Updates:**
```bash
# Update dependencies
pnpm update

# Test
pnpm test

# Build and deploy
pnpm build
docker build -t workflow-architect:v0.2.0 .
```

---

## Scaling

### Horizontal Scaling

**Manual Scaling:**
```bash
kubectl scale deployment workflow-architect --replicas=5
```

**Auto-scaling (HPA):**
- Configured to scale 3-10 replicas
- Based on CPU (70%) and memory (80%) utilization
- Scale-up: Max 4 pods per 30s
- Scale-down: Max 50% per 60s (5 min stabilization)

### Vertical Scaling

Update resource limits:
```yaml
resources:
  requests:
    cpu: 1000m
    memory: 1Gi
  limits:
    cpu: 4000m
    memory: 4Gi
```

---

## Backup & Recovery

### Configuration Backup

```bash
# Export ConfigMap
kubectl get configmap workflow-architect-config -o yaml > backup-config.yaml

# Export Secrets
kubectl get secret workflow-architect-secrets -o yaml > backup-secrets.yaml
```

### Data Backup

- **Supabase**: Handled by Supabase automatic backups
- **Logs**: Archived to external storage
- **Metrics**: Retained in Prometheus

### Disaster Recovery

1. **Restore from backup**
   ```bash
   kubectl apply -f backup-config.yaml
   kubectl apply -f backup-secrets.yaml
   kubectl apply -f k8s/
   ```

2. **Verify health**
   ```bash
   kubectl get pods
   curl http://workflow-architect.example.com/health
   ```

---

## Performance Tuning

### Node.js Tuning

```bash
# Increase heap size
NODE_OPTIONS="--max-old-space-size=4096"

# Enable performance profiling
NODE_OPTIONS="--prof --prof-process"
```

### Rate Limiting Tuning

Adjust in ConfigMap:
```yaml
rate-limit-window-ms: "60000"    # 1 minute
rate-limit-max-requests: "200"   # Increase limit
```

### Timeout Tuning

```yaml
request-timeout-ms: "60000"  # Increase to 60s
```

### Database Optimization

- Enable connection pooling
- Optimize queries with indexes
- Use caching for frequent queries

---

## Support & Escalation

### On-Call Contact

- **Primary**: on-call@example.com
- **Secondary**: engineering@example.com
- **Management**: cto@example.com

### Escalation Path

1. Check runbook for common issues
2. Check logs and metrics
3. Contact on-call engineer
4. Escalate to engineering team
5. Escalate to management if needed

### External Support

- **n8n Support**: https://community.n8n.io
- **Supabase Support**: https://supabase.com/support
- **Anthropic Support**: support@anthropic.com

---

## Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-01-01 | 0.1.0 | Initial runbook | DevOps Team |

---

## Appendix

### Useful Commands

```bash
# Restart deployment
kubectl rollout restart deployment/workflow-architect

# Get resource usage
kubectl top pods
kubectl top nodes

# Port forward for local testing
kubectl port-forward deployment/workflow-architect 3080:3080

# Execute shell in pod
kubectl exec -it <pod-name> -- /bin/sh

# View all resources
kubectl get all -l app=workflow-architect
```

### Environment Variables

See `k8s/configmap.yaml` for full list of configuration options.

### Architecture Diagrams

See `/docs/ARCHITECTURE.md` for detailed architecture documentation.
