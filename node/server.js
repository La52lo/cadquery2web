/// @file server.js
/// @brief Node server with /prompt -> Groq -> extract code -> queue -> cadquery preview/stl/step

require('dotenv').config();
const express = require('express');
const rate_limit = require('express-rate-limit');
const cors = require('cors');

const RequestQueue = require('./RequestQueue');
const { groqFetch } = require('./groqFetch');


const app = express();
app.set('trust proxy', 1);

const limiter = rate_limit({
  windowMs: 10 * 60 * 1000, // 10 mins
  max: 30,
  message: {
    data: 'none',
    message: 'Rate limited (>30 requests in 10 mins)'
  }
});

app.use(cors());
app.use(express.json({ limit: '200kb' }));
app.use(limiter);

const VALID_ENDPOINTS = ['prompt', 'code', 'stl', 'step'];
const requestQueue = new RequestQueue();

// map node endpoint -> cadquery endpoint
function cadqueryEndpointFor(nodeEndpoint) {
  if (nodeEndpoint === 'code' || nodeEndpoint === 'prompt') return 'preview';
  if (nodeEndpoint === 'stl') return 'stl';
  if (nodeEndpoint === 'step') return 'step';
  throw new Error('Unsupported endpoint mapping');
}

// logging middleware (keeps previous behavior)
const fs = require('fs').promises;
const path = require('path');

app.post('/:endpoint', async (req, res, next) => {
  const timestamp = new Date().toISOString();
  const safeBody = typeof req.body['code'] === 'string' ? req.body['code'] : JSON.stringify(req.body);
  const formattedLog = `{
  "timestamp": "${timestamp}",
  "endpoint": "${req.params.endpoint}",
  "body":
${safeBody.toString().split('\n').map(line => '    ' + line).join('\n')}
  ,
  "ip": "${req.headers['x-real-ip'] || req.ip}"
}\n`;
  try {
    const logDir = '/logs/';
    const logFile = path.join(logDir, `requests-${timestamp.split('T')[0]}.log`);
    await fs.appendFile(logFile, formattedLog, 'utf8');
  } catch (error) {
    console.error('Error logging request:', error);
  }
  next();
});

app.post('/:endpoint', async (req, res) => {
  try {
    const endpoint = req.params.endpoint;
    if (!VALID_ENDPOINTS.includes(endpoint)) {
      return res.status(400).json({ data: 'none', message: 'Invalid endpoint' });
    }

    // 1) Prompt endpoint: expect { prompt: "..." }
    if (endpoint === 'prompt') {
      const prompt = req.body?.prompt;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ data: 'none', message: 'Missing "prompt" string in request body' });
      }

      // Call Groq and extract first fenced code block
      let groqResult;
      try {
        groqResult = await groqFetch(prompt);
      } catch (err) {
        console.error('[GROQ] request failed:', err.message || err.toString());
        return res.status(502).json({ data: 'none', message: `Groq processing failed: ${err.message || 'unknown'}` });
      }
	  
      const extractedCode = groqResult.code;
      if (!extractedCode) {
        // no fenced code block found — return the raw response for debugging
        return res.status(422).json({
          data: 'none',
          message: 'No fenced code block found in Groq response',
          rawResponse: groqResult.raw
        });
      }

      // Queue extracted code for cadquery preview
      const cadqEndpoint = cadqueryEndpointFor('prompt'); // preview
      const response = await requestQueue.addRequest(cadqEndpoint, extractedCode);

      if (response && response.status === 200) {
        return res.status(200).json(response.data);
      } else {
        const status = response?.status || 500;
        const data = response?.data || { data: 'none', message: 'Unknown error from cadquery' };
        return res.status(status).json(data);
      }
    }

    // 2) code / stl / step endpoints: expect { code: "..." } in body
    const code = req.body?.code;
    if (typeof code !== 'string') {
      return res.status(400).json({ data: 'none', message: 'Request must include a string "code" field in body' });
    }

    const cadqEndpoint = cadqueryEndpointFor(endpoint);
    const response = await requestQueue.addRequest(cadqEndpoint, code);

    if ((endpoint === 'stl') || (endpoint === 'step')) {
      const contentDisposition = response.headers?.['content-disposition'];
      if (contentDisposition) {
        res.setHeader('Content-Disposition', contentDisposition);
      }
      res.setHeader('Content-Type', response.headers?.['content-type'] || 'application/octet-stream');
      return res.status(response.status || 200).send(response.data);
    } else {
      return res.status(response.status || 200).json(response.data);
    }

  } catch (error) {
    if (error && error.status && error.data) {
      return res.status(error.status).json(error.data);
    }
    console.error('[SERVER] unhandled error:', error);
    return res.status(500).json({ data: 'none', message: error.message || 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Node.js server running on port ${PORT}`);
});