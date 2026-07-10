#!/usr/bin/env bash
# Test OCIR credentials before updating GitHub secrets.
# Usage (do not commit real values):
#   export OCI_REGION=ap-mumbai-1
#   export OCI_TENANCY_NAMESPACE=your_namespace
#   export OCI_USERNAME='namespace/oracleidentitycloudservice/you@email.com'
#   export OCI_AUTH_TOKEN='your-auth-token'
#   ./infra/deploy/verify-ocir-login.sh

set -euo pipefail

: "${OCI_REGION:?Set OCI_REGION (e.g. ap-mumbai-1)}"
: "${OCI_TENANCY_NAMESPACE:?Set OCI_TENANCY_NAMESPACE (Object Storage namespace)}"
: "${OCI_USERNAME:?Set OCI_USERNAME}"
: "${OCI_AUTH_TOKEN:?Set OCI_AUTH_TOKEN (Auth Token from OCI Console, not account password)}"

REGISTRY="${OCI_REGION%.ocir.io}.ocir.io"
REGISTRY="${REGISTRY#https://}"
REGISTRY="${REGISTRY#http://}"

echo "Registry:  $REGISTRY"
echo "Namespace: $OCI_TENANCY_NAMESPACE"
echo "Username:  ${OCI_USERNAME%%@*}@*** (masked)"

if [[ "$OCI_USERNAME" != */* ]]; then
  echo "ERROR: OCI_USERNAME must be <namespace>/oracleidentitycloudservice/<email>"
  exit 1
fi

if [[ "$OCI_USERNAME" != "$OCI_TENANCY_NAMESPACE/"* ]]; then
  echo "WARN: OCI_USERNAME should start with your namespace: $OCI_TENANCY_NAMESPACE/"
fi

echo "Logging in..."
if echo "$OCI_AUTH_TOKEN" | docker login "$REGISTRY" --username "$OCI_USERNAME" --password-stdin; then
  echo "OK: docker login succeeded"
else
  echo "FAILED: Unauthorized — regenerate Auth Token in OCI Console and check username format."
  exit 1
fi

for repo in ai-assistant-gateway ai-assistant-ai-runtime; do
  echo "Checking repo: $REGISTRY/$OCI_TENANCY_NAMESPACE/$repo"
  if docker manifest inspect "$REGISTRY/$OCI_TENANCY_NAMESPACE/$repo:latest" >/dev/null 2>&1; then
    echo "  OK: repo exists (or accessible)"
  else
    echo "  WARN: repo missing or no access — create '$repo' in OCIR (region $OCI_REGION)"
  fi
done

echo "All checks passed."
