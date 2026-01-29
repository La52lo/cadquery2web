const axios = require('axios');

const GROQ_URL = process.env.GROQ_BASE_URL || null; // e.g. https://your-groq-service.example.com/query
const GROQ_API_KEY = process.env.GROQ_API_KEY || null;
const GROQ_TIMEOUT_MS = parseInt(process.env.GROQ_TIMEOUT_MS || '10000', 10);
const GROQ_MODEL = process.env.GROQ_MODEL || null; // e.g. 
if (!GROQ_URL) {
  console.warn('Warning: GROQ_URL is not configured. /prompt will fail until GROQ_URL is set.');
}
console.log('url:',GROQ_URL );
/**
 * Execute a GROQ query against a generic GROQ service.
 * Expects the GROQ service to accept POST { query, params } and return JSON.
 * Returns the raw response body (resp.data) for downstream processing.
 *
 * - query: string (GROQ query)
 * - params: object mapping parameter names to values (these will be sent as-is)
 */

async function groqFetch(prompt)
{
  try {
	
    const response = await axios.post(
      GROQ_URL,
      {
        messages: [
          {
            role: 'system',
            content: 'You are generating CadQuery v2 code for fabrication-relevant geometry.Always model CadQuery geometry explicitly in Z. Use centered=(True,True,False) by default. Create cuts only from selected faces (faces(">Z").workplane()), never from assumed offsets. Ensure cutting solids intersect the target. Verify Z-ranges after each operation.Requirements:Declare all parameters at the top.Explicitly state coordinate system assumptions (origin, Z direction).For each major feature, briefly explain the construction logic in comments.Before presenting the final script, mentally validate that every cut or union removes/adds a non-zero volume.Output:A single, complete CadQuery script.No pseudocode.No omitted steps.The code has to comply with a validator that assumes that only these names can legally own CadQuery methods:cq (the module) and result. The finished geometry is stored in the result variable',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: GROQ_MODEL, // Example model, check Groq docs for latest models
        temperature: 0.7,
        top_p: 1,
        stream: false,
		include_reasoning:false,
		reasoning_effort:'high',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
      }
    );

    //console.log('API Call Result:', response.data);
	//const rawResponse = response?.["assistant response"].content;
	const rawResponse = response.data.choices[0].message.content;
	const stringResponse = (typeof rawResponse === "string") ? rawResponse : "";
    
    //console.log('Assistant Response:', stringResponse);
	// 3. Extract the content [11]
    
    // 4. Extract code (assuming markdown ```code``` blocks)
    const codeBlockRegex = /```(?:python|)\n([\s\S]*?)\n```/g;
    const matches = [...stringResponse.matchAll(codeBlockRegex)];
	//console.log('matches Response:', matches);
    const extractedCode = matches.map(match => match[1]).join('\n');
	console.log('Code Response:', extractedCode);
	const result = {}; // Create an empty object

	// Add and populate the fields
	result.code = extractedCode;
	result.raw = stringResponse;
	return result;
  } catch (error) {
    console.error('Error making Groq API request:', error.response ? error.response.data : error.message);
  }
};



module.exports = { groqFetch };