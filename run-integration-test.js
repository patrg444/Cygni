const axios = require("axios");

const API_URL = "http://localhost:3000";
const BUILDER_URL = "http://localhost:3001";
const API_KEY = "test-api-key";

async function runTest() {
  console.log("Running integration test...");

  try {
    // 1. Test health endpoint
    console.log("Testing health endpoint...");
    const healthResponse = await axios.get(`${API_URL}/health`);
    console.log("Health check:", healthResponse.data);

    // 2. Test project creation via API
    console.log("\nCreating a test project...");
    const projectRequest = {
      name: "Test Project",
      slug: "test-project-integration",
      repository: "https://github.com/test/repo",
      framework: "node",
    };

    try {
      const projectResponse = await axios.post(
        `${API_URL}/api/projects`,
        projectRequest,
        {
          headers: {
            "X-API-Key": API_KEY,
            "Content-Type": "application/json",
          },
        },
      );
      console.log("Project created:", projectResponse.data);
    } catch (error) {
      console.log(
        "Project creation failed:",
        error.response?.data || error.message,
      );
    }

    // 3. Create a test build via Builder service
    console.log("\nCreating a test build...");
    const buildRequest = {
      projectId: "test-project-1",
      repoUrl: "https://github.com/test/repo",
      commitSha: "abc123",
      branch: "main",
      dockerfilePath: "./Dockerfile",
    };

    try {
      const createResponse = await axios.post(
        `${BUILDER_URL}/api/builds`,
        buildRequest,
        {
          headers: {
            "X-API-Key": API_KEY,
            "Content-Type": "application/json",
          },
        },
      );
      console.log("Build created:", createResponse.data);
    } catch (error) {
      console.log(
        "Build creation failed:",
        error.response?.data || error.message,
      );
    }

    // 4. Test builder health
    console.log("\nTesting builder health...");
    const builderHealthResponse = await axios.get(`${BUILDER_URL}/health`);
    console.log("Builder health:", builderHealthResponse.data);

    console.log("\nIntegration test completed!");
  } catch (error) {
    console.error("Test failed:", error.response?.data || error.message);
    process.exit(1);
  }
}

runTest();
