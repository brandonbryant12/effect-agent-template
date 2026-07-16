# Deployment

## Docker Compose

`docker compose up --build` starts Postgres, a one-shot migration container, server, credential broker, deterministic worker, and web client. Health conditions gate dependent services. Data persists in `postgres-data`; use `docker compose down -v` only when you intend to erase local state.

## Images

The root Dockerfile builds server, broker, or worker by setting `APP`. The web Dockerfile produces an unprivileged Nginx image. Both run as non-root. A production pipeline should publish immutable digest-addressed images and generate an SBOM/signature.

## Helm

Create the runtime secret before installing:

```bash
kubectl create secret generic effect-agent-runtime \
  --from-literal=database-url='postgres://...' \
  --from-literal=better-auth-secret='...' \
  --from-literal=credential-upload-signing-key='...' \
  --from-literal=opensandbox-api-key='...'

helm upgrade --install agent deploy/helm/effect-agent \
  --set image.repository=REGISTRY/effect-agent \
  --set image.tag=SHA \
  --set webImage.repository=REGISTRY/effect-agent-web \
  --set webImage.tag=SHA
```

The pre-install/pre-upgrade hook gates rollout on migrations. Configure ALB ingress/TLS and IRSA annotations in a private values file. Use an external managed Postgres service; it is intentionally not installed by the chart.

## EKS baseline

`deploy/terraform/eks` creates a VPC and managed-node EKS cluster through maintained community modules. Review cost, networking, Kubernetes version, access, NAT topology, logging, and organization policy before applying:

```bash
terraform -chdir=deploy/terraform/eks init
terraform -chdir=deploy/terraform/eks plan
terraform -chdir=deploy/terraform/eks apply
```

Install the AWS Load Balancer Controller, metrics/logging, External Secrets or your chosen secret synchronizer, and a Postgres operator only if you deliberately choose in-cluster data. Production should normally use RDS/Aurora with private endpoints and automated backups.
