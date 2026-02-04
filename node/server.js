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
  let code;
  try {
    const endpoint = req.params.endpoint;
    if (!VALID_ENDPOINTS.includes(endpoint)) {
      return res.status(400).json({ data: 'none', message: 'Invalid endpoint' });
    }

    // 1) Prompt endpoint: expect { prompt: "..." }
	if (endpoint === 'prompt') {
	  // ---- validate early (before flush) ----
	  const prompt = req.body?.prompt;
	  if (!prompt || typeof prompt !== 'string') {
		return res.status(400).json({
		  ok: false,
		  message: 'Missing "prompt" string in request body'
		});
	  }

	  // ---- commit headers EARLY ----
	  res.status(200);
	  res.setHeader("Content-Type", "application/json; charset=utf-8");
	  res.flushHeaders();
	  const heartbeat = setInterval(() => {
		  if (!res.writableEnded) {
			res.write(" ");
		  }
		}, 10_000);

	  let extractedCode;

	  try {
		const groqResult = await groqFetch(prompt);
		extractedCode = groqResult.code;
		if (!extractedCode) {
			clearInterval(heartbeat);
		  return res.end(JSON.stringify({
			ok: false,
			message: 'No fenced code block found in Groq response',
			rawResponse: groqResult.raw
		  }));
		} else {
			extractedCode = extractedCode.replace(/`+$/, ""); //remove random backticks
		}
		}
	   catch (err) {
		console.error('[LLM] request failed:', err);
		clearInterval(heartbeat);
		return res.end(JSON.stringify({
		  ok: false,
		  message: 'LLM processing failed',
		  error: err.message || String(err)
		}));
	  }

	  try {
		const cadqEndpoint = cadqueryEndpointFor('prompt');
		
		const response = await requestQueue.addRequest(cadqEndpoint, extractedCode);

		if (response?.status === 200) {
			clearInterval(heartbeat);
		  return res.end(JSON.stringify({
			ok: true,
			geometry: response.data,
			code: extractedCode
		  }));
		}
		clearInterval(heartbeat);
		return res.end(JSON.stringify({
		  ok: false,
		  message: 'CadQuery backend error',
		  status: response?.status ?? 500,
		  data: response?.data ?? null
		}));

	  } catch (err) {
		console.error('[QUEUE] failed:', err);
		clearInterval(heartbeat);
		return res.end(JSON.stringify({
		  ok: false,
		  message: 'Internal queue error',
		  error: err.message || String(err),
		  code: extractedCode || ""
		}));
	  }
	}


    // 2) code / stl / step endpoints: expect { code: "..." } in body
    code = req.body?.code;
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
      return res.status(response.status || 200).json({
		  geometry: response.data,
		  code:code
		});
    }

  } catch (error) {
    if (error && error.status && error.data) {
		return res.end(JSON.stringify({
			  ok: false,
			  message: 'python error',
			  error: error.message || String(error),
			  code: code ?? ""
		}))
      //return res.status(error.status).json(error.data);
    }
    console.error('[SERVER] unhandled error:', error);
    return res.status(500).json({ data: 'none', message: error.message || 'Internal server error',code: code || "" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Node.js server running on port ${PORT}`);
});