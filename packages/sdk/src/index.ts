export class CygniClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: { apiKey: string; baseUrl?: string }) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://api.cygni.dev';
  }

  async deploy(projectId: string, options?: { branch?: string }) {
    // Implementation placeholder
    console.log(`Deploying project ${projectId}`);
  }

  async getDeployments(projectId: string) {
    // Implementation placeholder
    return [];
  }
}

export default CygniClient;