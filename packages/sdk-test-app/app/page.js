"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Home;
const react_1 = require("react");
const sdk_1 = require("@cygni/sdk");
function DeploymentDemo() {
    const [deploymentId, setDeploymentId] = (0, react_1.useState)(null);
    // Create deployment mutation
    const createDeployment = (0, sdk_1.useCreateDeployment)();
    // Monitor deployment status
    const { deployment, isDeploying, isCompleted, isFailed } = (0, sdk_1.useDeploymentMonitor)(deploymentId);
    // List deployments
    const { data: deploymentsData } = (0, sdk_1.useProjectDeployments)("test-project", {
        limit: 5,
    });
    const handleDeploy = () => {
        const request = {
            cloudexpressConfig: {
                version: "1.0",
                services: [
                    {
                        name: "test-backend",
                        type: "backend",
                        path: "./backend",
                    },
                    {
                        name: "test-frontend",
                        type: "frontend",
                        path: "./frontend",
                    },
                ],
            },
            environment: "production",
            provider: "cloudexpress",
        };
        createDeployment.mutate(request, {
            onSuccess: (data) => {
                console.log("Deployment created:", data);
                setDeploymentId(data.deploymentId);
            },
            onError: (error) => {
                console.error("Deployment failed:", error);
            },
        });
    };
    return (<div style={{ padding: "20px", fontFamily: "system-ui" }}>
      <h1>Cygni SDK Test</h1>

      <section>
        <h2>Create Deployment</h2>
        <button onClick={handleDeploy} disabled={createDeployment.isPending || isDeploying} style={{
            padding: "10px 20px",
            fontSize: "16px",
            cursor: createDeployment.isPending || isDeploying
                ? "not-allowed"
                : "pointer",
            opacity: createDeployment.isPending || isDeploying ? 0.6 : 1,
        }}>
          {createDeployment.isPending ? "Creating..." : "Deploy Application"}
        </button>
      </section>

      {deploymentId && (<section style={{ marginTop: "30px" }}>
          <h2>Deployment Status</h2>
          <div style={{
                padding: "15px",
                border: "1px solid #ccc",
                borderRadius: "5px",
                backgroundColor: isCompleted
                    ? "#e8f5e9"
                    : isFailed
                        ? "#ffebee"
                        : "#f5f5f5",
            }}>
            <p>
              <strong>ID:</strong> {deploymentId}
            </p>
            <p>
              <strong>Status:</strong> {deployment?.status || "Loading..."}
            </p>
            <p>
              <strong>Environment:</strong> {deployment?.environment}
            </p>

            {deployment?.services && (<div style={{ marginTop: "10px" }}>
                <strong>Services:</strong>
                <ul>
                  {deployment.services.map((service) => (<li key={service.name}>
                      {service.name} - {service.status}
                      {service.url && (<span>
                          {" "}
                          -{" "}
                          <a href={service.url} target="_blank" rel="noopener noreferrer">
                            {service.url}
                          </a>
                        </span>)}
                    </li>))}
                </ul>
              </div>)}
          </div>
        </section>)}

      <section style={{ marginTop: "30px" }}>
        <h2>Recent Deployments</h2>
        {deploymentsData?.deployments?.length ? (<ul>
            {deploymentsData.deployments.map((deploy) => (<li key={deploy.id}>
                {deploy.id} - {deploy.status} -{" "}
                {new Date(deploy.createdAt).toLocaleString()}
              </li>))}
          </ul>) : (<p>No deployments found</p>)}
      </section>
    </div>);
}
function Home() {
    const [apiUrl, setApiUrl] = (0, react_1.useState)("");
    (0, react_1.useEffect)(() => {
        // Get the test server URL from the environment or use default
        const testApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
        setApiUrl(testApiUrl);
    }, []);
    if (!apiUrl) {
        return <div>Loading...</div>;
    }
    return (<sdk_1.CygniProvider config={{ baseUrl: apiUrl }}>
      <DeploymentDemo />
    </sdk_1.CygniProvider>);
}
//# sourceMappingURL=page.js.map