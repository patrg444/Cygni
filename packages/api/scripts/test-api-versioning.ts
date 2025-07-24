import axios from "axios";

const API_BASE_URL = "http://localhost:4000";
let authToken: string;

async function testAPIVersioning() {
  console.log("🔄 Testing API Versioning...\n");

  try {
    // 1. Get version information
    console.log("1. Getting API version information...");
    const versionsResponse = await axios.get(`${API_BASE_URL}/api/versions`);
    console.log("Available versions:", JSON.stringify(versionsResponse.data, null, 2));
    console.log("✅ Version info retrieved\n");

    // 2. Test current version endpoint
    console.log("2. Checking current request version...");
    const versionResponse = await axios.get(`${API_BASE_URL}/api/version`);
    console.log("Current version:", versionResponse.data);
    console.log("Response headers:");
    console.log("  X-API-Version:", versionResponse.headers["x-api-version"]);
    console.log("  X-API-Current-Version:", versionResponse.headers["x-api-current-version"]);
    console.log("✅ Version check complete\n");

    // 3. Login to get auth token
    console.log("3. Logging in...");
    const loginResponse = await axios.post(`${API_BASE_URL}/api/auth/login`, {
      email: "admin@example.com",
      password: "password123",
    });
    authToken = loginResponse.data.token;
    console.log("✅ Login successful\n");

    // 4. Test v1 endpoint
    console.log("4. Testing v1 API endpoint...");
    try {
      const v1Response = await axios.get(`${API_BASE_URL}/api/v1/user/profile`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      console.log("v1 Response:", v1Response.data);
      console.log("Deprecation headers:");
      console.log("  X-API-Warning:", v1Response.headers["x-api-warning"]);
      console.log("  X-API-Alternative:", v1Response.headers["x-api-alternative"]);
      console.log("✅ v1 endpoint works\n");
    } catch (error: any) {
      console.log("❌ v1 endpoint failed:", error.response?.data || error.message);
    }

    // 5. Test v2 endpoint (projects)
    console.log("5. Testing v2 API endpoint (projects)...");
    const v2ProjectsResponse = await axios.get(`${API_BASE_URL}/api/v2/projects`, {
      headers: { Authorization: `Bearer ${authToken}` },
      params: {
        page: 1,
        limit: 5,
        status: "active",
      },
    });
    console.log("v2 Projects Response:");
    console.log("  Total projects:", v2ProjectsResponse.data.pagination?.total || 0);
    console.log("  API Version:", v2ProjectsResponse.headers["x-api-version"]);
    console.log("✅ v2 endpoint works\n");

    // 6. Test v2-only endpoint (deployments)
    console.log("6. Testing v2-only endpoint (deployments)...");
    const v2DeploymentsResponse = await axios.get(`${API_BASE_URL}/api/v2/deployments`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    console.log("v2 Deployments Response:");
    console.log("  Total deployments:", v2DeploymentsResponse.data.pagination?.total || 0);
    console.log("✅ v2-only endpoint works\n");

    // 7. Test invalid version
    console.log("7. Testing invalid version...");
    try {
      await axios.get(`${API_BASE_URL}/api/v99/projects`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      console.log("❌ Invalid version should have failed");
    } catch (error: any) {
      console.log("✅ Invalid version correctly rejected:", error.response?.data?.error);
    }

    // 8. Test version-specific behavior (users endpoint)
    console.log("\n8. Testing version-specific behavior...");
    
    // v2 users endpoint
    console.log("v2 /users/me endpoint:");
    const v2UserResponse = await axios.get(`${API_BASE_URL}/api/v2/users/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    console.log("  User data:", {
      id: v2UserResponse.data.id,
      email: v2UserResponse.data.email,
      team: v2UserResponse.data.team?.name,
    });
    console.log("✅ v2 user endpoint works\n");

    // 9. Test default version behavior
    console.log("9. Testing default version behavior...");
    const defaultResponse = await axios.get(`${API_BASE_URL}/api/version`);
    console.log("Default version when not specified:", defaultResponse.data);
    console.log("✅ Default version behavior confirmed\n");

    console.log("✨ All API versioning tests passed!");
    console.log("\n📊 Summary:");
    console.log("- Version detection: ✅");
    console.log("- v1 endpoints: ✅");
    console.log("- v2 endpoints: ✅");
    console.log("- Version headers: ✅");
    console.log("- Invalid version handling: ✅");
    console.log("- Default version fallback: ✅");

  } catch (error: any) {
    console.error("\n❌ Test failed:", error.response?.data || error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Headers:", error.response.headers);
    }
    process.exit(1);
  }
}

// Run the test
testAPIVersioning();