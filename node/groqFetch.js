const axios = require('axios');

const GROQ_URL = process.env.GROQ_BASE_URL || null; // e.g. https://your-groq-service.example.com/query
const GROQ_API_KEY = process.env.GROQ_API_KEY || null;
const GROQ_TIMEOUT_MS = parseInt(process.env.GROQ_TIMEOUT_MS || '60000', 10);
const GROQ_MODEL = process.env.GROQ_MODEL || null; // e.g. 
const GROQ_MAX_TOKENS = parseInt(process.env.GROQ_MAX_TOKENS|| '1024', 10);
const GROQ_REASONING_EFFORT = process.env.GROQ_REASONING_EFFORT;
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

const systemPrompt = `You are an expert mechanical CAD engineer generating CadQuery v2 code for fabrication-grade solids.

You must reason in terms of SOLIDS, not sketches or intentions.

GLOBAL RULES (mandatory):
- The only objects allowed to own CadQuery methods are: cq (the module) and result (the main solid).
- All geometry must be explicitly defined in Z.
- Use centered=(True, True, False) unless there is a clear, stated reason not to.
- Never create cuts from assumed offsets or absolute Z values.
- Every cut MUST originate from an explicitly selected face using faces(">Z"), faces("<Z"), faces(">X"), etc.
- Every cutting operation must remove a non-zero volume that provably intersects the target solid.
- Do NOT rely on visual intuition. Track bounding boxes mentally.

CUT-SAFETY RULES (critical):
- Every cut must follow this exact pattern:
  select face → create sketch → consume sketch exactly once → verify intersection
- cutBlind distances must be explicitly justified in comments.
- Do NOT reuse sketches.
- Do NOT create cutting solids that merely touch a face; they must overlap in Z.
- If a cut would accidentally hollow the part, redesign it as a bounded cut.
- No cut or hole may be tangent to an outer face; all features must leave a positive wall thickness ≥ 0.2 mm.
- Lips are created by not cutting material, not by cutting more.

WORKPLANE RULES:
- workplane(offset=...) is only allowed immediately after a face selection.
- transformed(offset=...) without a face selection is forbidden.
- If you need a Z shift, explain which face defines the reference plane.

REASONING REQUIREMENTS:
- Declare all parameters at the top.
- Explicitly state the coordinate system (origin, axes, Z direction).
- For each major feature:
  1) State the current solid’s Z-range
  2) Describe what volume is added or removed
  3) State the resulting Z-range
- Before outputting code, mentally validate:
  - Every sketch is consumed
  - Every cut intersects
  - No operation results in a zero-volume change

OUTPUT FORMAT:
- Output a single, complete CadQuery script.
- No pseudocode.
- No markdown.
- No explanations outside comments in the code.
- The final solid must be stored in the variable named "result".

If a requested feature cannot be built safely under these rules, redesign it conservatively rather than guessing.
Before finalizing, silently re-evaluate the script and ask:
- Does every cut remove material?
- Does any cut accidentally open the part?
- Does any feature rely on an assumed reference plane?
If yes, correct it before output.
`;


async function groqFetch(prompt)
{
  try {
	
    const response = await axios.post(
      GROQ_URL,
      {
        messages: [
          {
            role: 'system',
            content: systemPrompt,
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
		reasoning_effort:GROQ_REASONING_EFFORT,
		max_tokens: GROQ_MAX_TOKENS,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
      }
    );
	console.log('request', JSON.parse(response.config.data)); 
    //console.log('API Call Result:', response.data);
	//const rawResponse = response?.["assistant response"].content;
	const rawResponse = response.data.choices[0].message.content;
	const stringResponse = (typeof rawResponse === "string") ? rawResponse : "";
    
    console.log('\nfull response', response.data.choices[0]);
	// 3. Extract the content [11]
    
    // 4. Extract code (assuming markdown ```code``` blocks)
    const codeBlockRegex = /```(?:python|)\n([\s\S]*?)\n```/g;
    const matches = [...stringResponse.matchAll(codeBlockRegex)];
	//console.log('matches Response:', matches);
    const extractedCode = matches.map(match => match[1]).join('\n');
	console.log('Code Response:', extractedCode?.trim() || rawResponse);
	const result = {}; // Create an empty object

	// Add and populate the fields
	result.code = extractedCode?.trim() || stringResponse;
	result.raw = stringResponse;
	return result;
  } catch (error) {
    console.error('Error making Groq API request:', error.response ? error.response.data : error.message);
  }
};



module.exports = { groqFetch };