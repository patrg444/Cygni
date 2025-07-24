import axios from "axios";
import express from "express";
import crypto from "crypto";

const API_BASE_URL = "http://localhost:4000/api";
let authToken: string;
let webhookSecret: string;
let testServer: any;

// Create a test webhook receiver
function createTestWebhookReceiver(port: number = 3001): Promise<void> {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());
    
    const receivedEvents: any[] = [];
    
    app.post("/webhook", (req, res) => {
      console.log("\n📨 Webhook received:");
      console.log("Headers:", {
        "X-Webhook-Id": req.headers["x-webhook-id"],
        "X-Webhook-Event": req.headers["x-webhook-event"],
        "X-Webhook-Signature": req.headers["x-webhook-signature"],
        "X-Webhook-Timestamp": req.headers["x-webhook-timestamp"],
      });
      console.log("Body:", JSON.stringify(req.body, null, 2));
      
      // Verify signature
      if (webhookSecret) {
        const signature = req.headers["x-webhook-signature"] as string;
        const [algorithm, hash] = signature?.split("=") || [];
        
        if (algorithm && hash) {
          const payload = JSON.stringify(req.body);
          const expectedHash = crypto
            .createHmac(algorithm, webhookSecret)
            .update(payload)
            .digest("hex");
          
          const valid = hash === expectedHash;
          console.log("Signature valid:", valid);
        }
      }
      
      receivedEvents.push(req.body);
      res.status(200).send("OK");
    });
    
    testServer = app.listen(port, () => {
      console.log(`🎧 Test webhook receiver listening on http://localhost:${port}/webhook`);
      resolve();
    });
  });
}

async function testWebhooks() {
  console.log("🪝 Testing Webhook System...\n");

  try {
    // Start test webhook receiver
    await createTestWebhookReceiver();
    
    // 1. Login
    console.log("1. Logging in...");
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: "admin@example.com",
      password: "password123",
    });
    authToken = loginResponse.data.token;
    console.log("✅ Login successful\n");

    // 2. Get available event types
    console.log("2. Getting available event types...");
    const eventTypesResponse = await axios.get(`${API_BASE_URL}/webhooks/event-types`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    console.log("Available categories:", eventTypesResponse.data.categories);
    console.log("Total event types:", eventTypesResponse.data.eventTypes.length);
    console.log("✅ Event types retrieved\n");

    // 3. Create webhook
    console.log("3. Creating webhook...");
    const createResponse = await axios.post(
      `${API_BASE_URL}/webhooks`,
      {
        url: "http://localhost:3001/webhook",
        events: [
          "deployment.created",
          "deployment.succeeded",
          "deployment.failed",
          "project.created",
          "webhook.test",
        ],
        description: "Test webhook for development",
        headers: {
          "X-Custom-Header": "test-value",
        },
      },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    
    const webhook = createResponse.data;
    webhookSecret = webhook.signingSecret;
    console.log("Webhook created:");
    console.log("  ID:", webhook.id);
    console.log("  URL:", webhook.url);
    console.log("  Events:", webhook.events);
    console.log("  Secret:", webhookSecret);
    console.log("✅ Webhook created\n");

    // 4. List webhooks
    console.log("4. Listing webhooks...");
    const listResponse = await axios.get(`${API_BASE_URL}/webhooks`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    console.log("Total webhooks:", listResponse.data.webhooks.length);
    console.log("✅ Webhooks listed\n");

    // 5. Test webhook
    console.log("5. Testing webhook...");
    const testResponse = await axios.post(
      `${API_BASE_URL}/webhooks/${webhook.id}/test`,
      {},
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    console.log("Test result:", testResponse.data);
    console.log("✅ Webhook test sent\n");
    
    // Wait a moment for the webhook to be received
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 6. Trigger a real event (create a project)
    console.log("6. Creating a project to trigger webhook...");
    try {
      const projectResponse = await axios.post(
        `${API_BASE_URL}/v2/projects`,
        {
          name: "Webhook Test Project",
          description: "Testing webhook events",
          framework: "node",
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      console.log("Project created:", projectResponse.data.name);
      console.log("✅ Project created (should trigger webhook)\n");
    } catch (error: any) {
      console.log("⚠️  Project creation failed (might already exist):", error.response?.data?.error || error.message);
    }
    
    // Wait for webhook delivery
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 7. Check webhook deliveries
    console.log("7. Checking webhook deliveries...");
    const deliveriesResponse = await axios.get(
      `${API_BASE_URL}/webhooks/deliveries?webhookId=${webhook.id}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    console.log("Total deliveries:", deliveriesResponse.data.deliveries.length);
    
    const successful = deliveriesResponse.data.deliveries.filter((d: any) => d.status === "success").length;
    const failed = deliveriesResponse.data.deliveries.filter((d: any) => d.status === "failed").length;
    console.log("  Successful:", successful);
    console.log("  Failed:", failed);
    console.log("✅ Deliveries checked\n");

    // 8. Update webhook
    console.log("8. Updating webhook...");
    const updateResponse = await axios.put(
      `${API_BASE_URL}/webhooks/${webhook.id}`,
      {
        events: ["deployment.succeeded", "deployment.failed"],
        enabled: false,
      },
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    console.log("Webhook updated:");
    console.log("  Events:", updateResponse.data.events);
    console.log("  Enabled:", updateResponse.data.enabled);
    console.log("✅ Webhook updated\n");

    // 9. Delete webhook
    console.log("9. Deleting webhook...");
    await axios.delete(
      `${API_BASE_URL}/webhooks/${webhook.id}`,
      { headers: { Authorization: `Bearer ${authToken}` } }
    );
    console.log("✅ Webhook deleted\n");

    console.log("✨ All webhook tests passed!");
    
  } catch (error: any) {
    console.error("\n❌ Test failed:", error.response?.data || error.message);
    process.exit(1);
  } finally {
    // Close test server
    if (testServer) {
      testServer.close();
    }
  }
}

// Run the test
testWebhooks();