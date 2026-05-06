# Troubleshooting

Common issues and solutions for DClaw Sheet.

## Quick Diagnostics

```bash
# Check app pods
kubectl get pods -n dclaw-sheet

# Check logs
kubectl logs -n dclaw-sheet deployment/dclaw-sheet-backend

# Check database
kubectl get clusters -n dclaw-sheet
```

## Sections

- [Common Issues](./common-issues)
- [FAQ](./faq)
