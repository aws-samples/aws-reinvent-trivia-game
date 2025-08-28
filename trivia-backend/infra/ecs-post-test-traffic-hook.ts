import { Handler } from 'aws-lambda';
import * as https from 'https';

const TARGET_URL = process.env.TARGET_URL!;

const sleep = (seconds: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, seconds * 1000));

const makeRequest = (url: string): Promise<{ status: number; data: string }> =>
  new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      let data = '';
      response.on('data', (chunk) => data += chunk);
      response.on('end', () => resolve({
        status: response.statusCode!,
        data
      }));
    });

    request.on('error', reject);
    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });

export const handler: Handler = async (event) => {
  console.log('ECS Post Test Traffic Hook: ', JSON.stringify(event));
  console.log('Target URL: ', TARGET_URL);

  try {
    // Ensure test traffic is fully shifted over to new target group
    console.log("Waiting 30 seconds");
    await sleep(30);

    // Perform validation or pre-warming steps.
    // Make a request to the target URL and check the response
    const response = await makeRequest(TARGET_URL);
    console.log(`Response: ${response.status}`);

    if (response.status !== 200) {
      console.error(`Validation failed: HTTP ${response.status}`);
      return { hookStatus: 'FAILED' };
    }

    const categories = JSON.parse(response.data);
    if (!Array.isArray(categories) || categories.length !== 4) {
      console.error(`Wrong categories count: ${categories.length}`);
      return { hookStatus: 'FAILED' };
    }

    console.log('Validation successful');
    return { hookStatus: 'SUCCEEDED' };

  } catch (error) {
    console.error('Hook failed:', error);
    return { hookStatus: 'FAILED' };
  }
};
