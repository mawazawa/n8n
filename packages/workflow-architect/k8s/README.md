# Kubernetes Deployment

This directory contains Kubernetes manifests for deploying Workflow Architect in production.

## Files

- `deployment.yaml` - Main application deployment with security hardening
- `service.yaml` - Service and headless service for the application
- `configmap.yaml` - Configuration and secrets templates
- `ingress.yaml` - Ingress with TLS and network policies
- `hpa.yaml` - Horizontal Pod Autoscaler and Pod Disruption Budget

## Prerequisites

- Kubernetes cluster (v1.24+)
- kubectl CLI configured
- Ingress controller (nginx or AWS ALB)
- Cert-manager for TLS certificates (optional)
- Metrics server for HPA

## Quick Start

### 1. Create Namespace (Optional)

```bash
kubectl create namespace workflow-architect
```

### 2. Create Secrets

Create the secrets with your actual values:

```bash
kubectl create secret generic workflow-architect-secrets \
  --from-literal=n8n-api-key=YOUR_N8N_API_KEY \
  --from-literal=anthropic-api-key=YOUR_ANTHROPIC_API_KEY \
  --from-literal=openai-api-key=YOUR_OPENAI_API_KEY \
  --from-literal=supabase-url=YOUR_SUPABASE_URL \
  --from-literal=supabase-anon-key=YOUR_SUPABASE_ANON_KEY \
  --from-literal=supabase-service-role-key=YOUR_SUPABASE_SERVICE_ROLE_KEY \
  -n default
```

### 3. Update Configuration

Edit `configmap.yaml` to adjust settings as needed:
- Log level
- Rate limiting
- Request timeout
- n8n base URL

### 4. Update Ingress

Edit `ingress.yaml` to set your domain:
- Replace `workflow-architect.example.com` with your actual domain
- Configure TLS certificate

### 5. Deploy

Apply all manifests:

```bash
kubectl apply -f k8s/
```

Or apply in order:

```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml
```

## Verification

Check deployment status:

```bash
# Check pods
kubectl get pods -l app=workflow-architect

# Check deployment
kubectl get deployment workflow-architect

# Check services
kubectl get svc workflow-architect

# Check ingress
kubectl get ingress workflow-architect

# Check HPA
kubectl get hpa workflow-architect
```

View logs:

```bash
kubectl logs -f deployment/workflow-architect
```

## Scaling

### Manual Scaling

```bash
kubectl scale deployment workflow-architect --replicas=5
```

### Auto-scaling

The HPA is configured to automatically scale between 3-10 replicas based on:
- CPU utilization (target: 70%)
- Memory utilization (target: 80%)

## Updates

### Rolling Update

Update the image:

```bash
kubectl set image deployment/workflow-architect \
  workflow-architect=workflow-architect:v0.2.0
```

Monitor rollout:

```bash
kubectl rollout status deployment/workflow-architect
```

### Rollback

```bash
kubectl rollout undo deployment/workflow-architect
```

## Troubleshooting

### Check pod status

```bash
kubectl describe pod <pod-name>
```

### Check logs

```bash
kubectl logs <pod-name>
```

### Execute commands in pod

```bash
kubectl exec -it <pod-name> -- /bin/sh
```

### Check resource usage

```bash
kubectl top pods -l app=workflow-architect
kubectl top nodes
```

## Security

The deployment includes:
- Non-root user execution
- Read-only root filesystem capability
- Dropped capabilities with minimal required
- Security contexts
- Network policies
- Resource limits
- Pod disruption budget

## Monitoring

Prometheus metrics are exposed at `/metrics` endpoint.

Configure Prometheus to scrape:

```yaml
- job_name: 'workflow-architect'
  kubernetes_sd_configs:
    - role: pod
  relabel_configs:
    - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
      action: keep
      regex: true
    - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
      action: replace
      target_label: __metrics_path__
      regex: (.+)
    - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
      action: replace
      regex: ([^:]+)(?::\d+)?;(\d+)
      replacement: $1:$2
      target_label: __address__
```

## Cleanup

Remove all resources:

```bash
kubectl delete -f k8s/
```
