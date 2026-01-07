import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3002;

// Enable CORS for all origins (adjust for production)
app.use(cors());
app.use(express.json());

// Proxy endpoint for Jira API calls
app.post('/api/jira/proxy', async (req, res) => {
  const { url, method = 'GET', headers = {}, body } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const fetchOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...headers,
      },
    };

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
    }

    console.log(`Proxying request to: ${url}`);
    const response = await fetch(url, fetchOptions);
    const contentType = response.headers.get('content-type');

    let data;
    const text = await response.text();

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    } else {
      data = null;
    }

    console.log(`Response status: ${response.status}, ok: ${response.ok}`);

    res.json({
      ok: response.ok,
      status: response.status,
      data,
    });
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Failed to fetch from Jira API',
    });
  }
});

// Root route
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Jira proxy server is running on port ' + PORT });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Jira proxy server is running' });
});

app.listen(PORT, () => {
  console.log(`Jira proxy server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
