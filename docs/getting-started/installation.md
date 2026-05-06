# Installation

## Via DPanel

1. Open DPanel at `https://panel.yourdomain.com`
2. Find **DClaw Sheet** in the app grid
3. Click **Install**
4. The DClaw Operator will provision:
   - Namespace: `dclaw-sheet`
   - Frontend deployment (Next.js)
   - Backend deployment (FastAPI)
   - PostgreSQL database (CloudNativePG)
   - Ingress with TLS

## Via kubectl

```bash
# Apply the DClawApp CRD
kubectl apply -f - <<EOF
apiVersion: platform.dclaw.io/v1
kind: DClawApp
metadata:
  name: sheet
spec:
  appId: sheet
  appName: DClaw Sheet
  version: 0.1.0
  category: spreadsheets
  enabled: true
  frontend:
    image: ghcr.io/dclawstack/dclaw-sheet:latest
    replicas: 2
  backend:
    image: ghcr.io/dclawstack/dclaw-sheet-backend:latest
    replicas: 2
  database:
    enabled: true
    storage: 10Gi
  ingress:
    enabled: true
    host: sheet.yourdomain.com
    tls: true
EOF
```

## Verify

```bash
kubectl get pods -n dclaw-sheet
kubectl get ingress -n dclaw-sheet
```
