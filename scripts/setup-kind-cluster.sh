#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Setting up Kind cluster for Kaniko E2E tests"
echo "=============================================="

# Check if kind is installed
if ! command -v kind &> /dev/null; then
    echo -e "${YELLOW}Installing kind...${NC}"
    # Install kind
    curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-$(uname)-amd64
    chmod +x ./kind
    sudo mv ./kind /usr/local/bin/kind
fi

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}kubectl is not installed. Please install kubectl first.${NC}"
    exit 1
fi

# Delete existing cluster if it exists
echo -e "\n${YELLOW}Cleaning up existing cluster...${NC}"
kind delete cluster --name cygni-test 2>/dev/null || true

# Create local Docker registry
echo -e "\n${YELLOW}Creating local Docker registry...${NC}"
docker run -d --restart=always -p 5000:5000 --name kind-registry registry:2 2>/dev/null || true

# Create Kind cluster
echo -e "\n${YELLOW}Creating Kind cluster...${NC}"
kind create cluster --config k8s/kind-config.yaml

# Connect registry to cluster network
echo -e "\n${YELLOW}Connecting registry to cluster network...${NC}"
docker network connect kind kind-registry 2>/dev/null || true

# Apply registry config to cluster
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: local-registry-hosting
  namespace: kube-public
data:
  localRegistryHosting.v1: |
    host: "localhost:5000"
    help: "https://kind.sigs.k8s.io/docs/user/local-registry/"
EOF

# Create namespace for builds
echo -e "\n${YELLOW}Creating build namespace...${NC}"
kubectl create namespace cygni-builds || true

# Create RBAC for Kaniko
echo -e "\n${YELLOW}Setting up Kaniko RBAC...${NC}"
kubectl apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kaniko-builder
  namespace: cygni-builds
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: kaniko-builder
  namespace: cygni-builds
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["batch"]
    resources: ["jobs"]
    verbs: ["create", "get", "list", "watch", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: kaniko-builder
  namespace: cygni-builds
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: kaniko-builder
subjects:
  - kind: ServiceAccount
    name: kaniko-builder
    namespace: cygni-builds
EOF

# Create a test secret for Git credentials (using public repo)
echo -e "\n${YELLOW}Creating test Git credentials...${NC}"
kubectl create secret generic git-credentials \
  --from-literal=username=test \
  --from-literal=password=test \
  --namespace=cygni-builds || true

# Verify cluster is ready
echo -e "\n${YELLOW}Verifying cluster setup...${NC}"
kubectl cluster-info --context kind-cygni-test

# Test registry connectivity
echo -e "\n${YELLOW}Testing registry connectivity...${NC}"
docker pull alpine:latest
docker tag alpine:latest localhost:5000/test:latest
docker push localhost:5000/test:latest

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Registry is accessible${NC}"
else
    echo -e "${RED}✗ Registry test failed${NC}"
    exit 1
fi

echo -e "\n${GREEN}✓ Kind cluster setup complete!${NC}"
echo -e "\nCluster: cygni-test"
echo -e "Registry: localhost:5000"
echo -e "Namespace: cygni-builds"
echo -e "\nTo use this cluster:"
echo -e "  kubectl config use-context kind-cygni-test"
echo -e "\nTo delete the cluster:"
echo -e "  kind delete cluster --name cygni-test"