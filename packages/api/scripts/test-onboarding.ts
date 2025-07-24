import axios from "axios";

const API_BASE_URL = "http://localhost:4000/api";
let authToken: string;

async function testOnboarding() {
  console.log("🚀 Testing Onboarding Flow...\n");

  try {
    // 1. Login first to get auth token
    console.log("1. Logging in...");
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: "admin@example.com",
      password: "password123",
    });
    authToken = loginResponse.data.token;
    console.log("✅ Login successful\n");

    // 2. Get onboarding status
    console.log("2. Getting onboarding status...");
    const statusResponse = await axios.get(`${API_BASE_URL}/onboarding/status`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    console.log("Onboarding Status:", JSON.stringify(statusResponse.data, null, 2));
    console.log("✅ Status retrieved\n");

    // 3. Get interactive checklist
    console.log("3. Getting onboarding checklist...");
    const checklistResponse = await axios.get(`${API_BASE_URL}/onboarding/checklist`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    console.log("Checklist items:", checklistResponse.data.checklist.length);
    console.log("Completed:", checklistResponse.data.completedCount);
    console.log("Total:", checklistResponse.data.totalCount);
    console.log("✅ Checklist retrieved\n");

    // 4. Complete a step
    if (statusResponse.data.progress.completedSteps.length < statusResponse.data.steps.length) {
      const nextStep = statusResponse.data.steps.find((s: any) => !s.completed);
      if (nextStep) {
        console.log(`4. Completing step: ${nextStep.id}...`);
        const completeResponse = await axios.post(
          `${API_BASE_URL}/onboarding/complete-step`,
          { stepId: nextStep.id },
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        console.log("✅ Step completed:", completeResponse.data.message);
        console.log("Progress:", completeResponse.data.progress.completedSteps.length, "steps completed\n");
      }
    }

    // 5. Get analytics (admin only)
    console.log("5. Getting onboarding analytics...");
    try {
      const analyticsResponse = await axios.get(`${API_BASE_URL}/onboarding/analytics`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      console.log("Analytics:", JSON.stringify(analyticsResponse.data, null, 2));
      console.log("✅ Analytics retrieved\n");
    } catch (error: any) {
      if (error.response?.status === 403) {
        console.log("⚠️  Analytics endpoint requires admin permissions\n");
      } else {
        throw error;
      }
    }

    // 6. Submit feedback
    console.log("6. Submitting onboarding feedback...");
    const feedbackResponse = await axios.post(
      `${API_BASE_URL}/onboarding/feedback`,
      {
        rating: 5,
        feedback: "Great onboarding experience!",
        completedSteps: statusResponse.data.progress.completedSteps,
        timeSpent: 15,
      },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    console.log("✅ Feedback submitted:", feedbackResponse.data.message);

    console.log("\n✨ All onboarding tests passed!");
  } catch (error: any) {
    console.error("\n❌ Test failed:", error.response?.data || error.message);
    process.exit(1);
  }
}

// Run the test
testOnboarding();