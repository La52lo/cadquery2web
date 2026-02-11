const axios = require('axios');

const GROQ_URL = process.env.GROQ_BASE_URL || null; // e.g. https://your-groq-service.example.com/query
const GROQ_API_KEY = process.env.GROQ_API_KEY || null;
const GROQ_TIMEOUT_MS = parseInt(process.env.GROQ_TIMEOUT_MS || '60000', 10);
const GROQ_MODEL = process.env.GROQ_MODEL || null; // e.g. 
const GROQ_MAX_TOKENS = parseInt(process.env.GROQ_MAX_TOKENS|| '1024', 10);
const GROQ_REASONING_EFFORT = process.env.GROQ_REASONING_EFFORT;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = process.env.GEMINI_BASE_URL;
const GEMINI_MODEL = process.env.GEMINI_MODEL;
if (!GROQ_URL) {
  console.warn('Warning: GROQ_URL is not configured. /prompt will fail until GROQ_URL is set.');
}
console.log('url:',GEMINI_URL );
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
you’re operating in an absolute, stateless, CSG-like modeling paradigm and avoid 
CadQuery's orignally intended feature-relative, history-based approach.

GLOBAL RULES (mandatory):
- The only objects allowed to own CadQuery methods are: cq (the module) and result (the main solid).
You are generating CadQuery (Python) code under strict absolute-coordinate rules.

All geometry creation MUST start from an explicit world-aligned workplane, using one of:
cq.Workplane("XY", origin=(x, y, z))
cq.Workplane("YZ", origin=(x, y, z))
cq.Workplane("XZ", origin=(x, y, z))

The origin is always an absolute world coordinate.

Face-based workplanes are forbidden.
Do NOT use:
- faces(...)
- edges(...)
- vertices(...)
- workplane() without an explicit plane and origin

No feature may rely on implicit workplane inheritance.
Every sketch–extrude/cut sequence must begin with a fresh cq.Workplane(...).
All positioning must be done via explicit numeric coordinates or offsets, never by:
- face selection
- centerOption="CenterOfMass"
- implicit “top face” behavior
- chained .center() calls that depend on previous geometry

Extrusions and cuts must be world-reasoned, meaning:
- the intended world-axis direction is stated or obvious
- extrusion direction is never assumed from prior context

Multiple solids must be combined explicitly using:
- result = result.union(new_solid)
- result = result.cut(cutter_solid)

Do NOT rely on visual intuition. Track bounding boxes mentally.
Do NOT apply fillets
Prefer area primitives over polylines whenever possible.

GENERAL WORKPLANE ORIENTATION RULE (MANDATORY):

Every workplane has:
- two in-plane axes
- one normal axis (perpendicular to the plane)
The normal axis is ALWAYS the world axis that is NOT present in the plane name.

Positive extrusion direction is ALWAYS along the positive normal axis.
Negative extrusion direction is ALWAYS opposite the normal axis.

The sign of extrusion MUST be chosen explicitly.
Never assume a default direction.

WORKPLANE → NORMAL AXIS MAPPING:

- "XY" plane → normal = +Z
- "YZ" plane → normal = +X
- "XZ" plane → normal = -Y

CUT-SAFETY RULES (critical):

- cutBlind distances must be explicitly justified in comments.
- Do NOT reuse sketches.
- No cut or hole may be tangent to an outer face; all features must leave a positive wall thickness ≥ 0.2 mm.
- Lips are created by not cutting material, not by cutting more.


POLYLINE RULES (critical):
- Never extrude a polyline unless it has ≥3 points
- Never extrude a polyline unless .close() is called beforehand
- Never extrude a polyline if the polyline points are collinear

CadQuery Default Centering & Coordinate Guidelines:
- cq.Workplane().box() and cq.Workplane().sphere(): Centered on all three axes (X,Y,Z) by default. A box of height H spans from (-H/2) to (+H/2). To start at (Z=0), use centered=(True, True, False).
- Radial Primitives (cylinder, cone): Centered on (X) and (Y), but not (Z). They grow from (Z=0) upwards.
- 2D Shapes (rect, circle): Centered on the Workplane origin (0,0).

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


const validatorPrompt = `here is a code snipptet from the validator listing allowed operations.  Make sure the produced code complies these rules. self.allowed_imports = {
      'cadquery': {'as': {'cq'}},  # only allow "import cadquery as cq"
      'math': {'functions': {
        'sin', 'cos', 'tan', 'pi', 'sqrt',
        'radians', 'degrees', 'atan2'
      }},
      'numpy': {
        'as': {'np'},
        'functions': {
          # array creation and manipulation
          'array', 'zeros', 'ones', 'linspace', 'arange',
          # math operations
          'sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'arctan2',
          'deg2rad', 'rad2deg', 'pi',
          'sqrt', 'square', 'power', 'exp', 'log', 'log10',
          # statistics
          'mean', 'median', 'std', 'min', 'max',
          # linear algebra
          'dot', 'cross', 'transpose',
          # rounding
          'floor', 'ceil', 'round',
          # array operations
          'concatenate', 'stack', 'reshape', 'flatten'
        }
      }
    }
    # expanded set of allowed CadQuery operations
    self.allowed_cq_operations = {
      # core operations
      'Workplane', 'box', 'circle', 'cylinder', 'sphere',
      'extrude', 'revolve', 'union', 'cut', 'fillet',
      'chamfer', 'vertices', 'edges', 'faces', 'shell',
      'offset2D', 'offset', 'wire', 'rect', 'polygon',
      'polyline', 'spline', 'close', 'moveTo', 'lineTo',
      'line', 'vLineTo', 'hLineTo', 'mirrorY', 'mirrorX',
      'translate', 'rotate', 'size',
      # additional 2D operations
      'center', 'radiusArc', 'threePointArc', 'ellipse',
      'ellipseArc', 'close', 'section', 'slot',
      # 3D operations
      'loft', 'sweep', 'twistExtrude', 'ruled',
      'wedge', 'cone', 'hull', 'mirror',
      # selection operations
      'all', 'size', 'item', 'itemAt', 'first', 'last',
      'end', 'vertices', 'faces', 'edges', 'wires', 'solids',
      'shells', 'compounds', 'vals', 'add', 'combine',
      # workplane operations
      'workplane', 'plane', 'plane', 'transformed',
      'center', 'pushPoints', 'cutBlind', 'cutThruAll',
      'close', 'toPending', 'workplaneFromTagged',
      # selector strings as attributes
      'tag', 'end', 'val', 'wire', 'solid', 'face',
      # direction selectors
      'rarray', 'polarArray', 'grid',
      # boolean operations
      'intersect', 'combine', 'each',
      # measurement and inspection
      'val', 'vals', 'dump',
      # string constants for plane selection
      'XY', 'YZ', 'XZ', 'front', 'back', 'left', 
      'right', 'top', 'bottom',
      # common string selectors
      '|Z', '>Z', '<Z', '|X', '>X', '<X', 
      '|Y', '>Y', '<Y', '#Z', '#X', '#Y'
    }
    # extremely limited set of allowed builtins
    self.allowed_builtins = {
      'float', 'int', 'bool', 'str', 'list', 'tuple',
      'True', 'False', 'None', 'range', 'len'
    }`;

async function groqFetch(prompt)
{
  try {
	
    const response = await axios.post(
      GEMINI_URL,
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
		  {
            role: 'user',
            content: validatorPrompt,
          },
        ],
        model: GEMINI_MODEL, // Example model, check Groq docs for latest models
        //temperature: 0.7,
        //top_p: 1,
        stream: false,
		//include_reasoning:false,
		//reasoning_effort:GROQ_REASONING_EFFORT,
		extra_body: {
		  "google": {
			"thinking_config": {
			  //"thinking_level": "low",
			  "include_thoughts": false
			}
		  }
		},
		//max_tokens: GROQ_MAX_TOKENS,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GEMINI_API_KEY}`,
        },
      }
    );
	//console.log('request', response); 
    //console.log('API Call Result:', response.data);
	//const rawResponse = response?.["assistant response"].content;
	const rawResponse = response.data.choices[0].message.content;
	const stringResponse = (typeof rawResponse === "string") ? rawResponse : "";
    
    //console.log('\nfull response', response.data.choices[0]);
	// 3. Extract the content [11]
    
    // 4. Extract code (assuming markdown ```code``` blocks)
    const codeBlockRegex = /```(?:python|)\n([\s\S]*?)\n```/g;
    const matches = [...stringResponse.matchAll(codeBlockRegex)];
	//console.log('matches Response:', matches);
    const extractedCode = matches.map(match => match[1]).join('\n');
	//console.log('extrCode Response:' + extractedCode?.trim()  +  "\nstringresp:" + stringResponse) ;
	const result = {}; // Create an empty object

	// Add and populate the fields
	result.code = extractedCode?.trim() || stringResponse;
	result.raw = stringResponse;
	return result;
  } catch (error) {
    console.error('Error making Groq API request:', error.response ? error.response.data : error.message);
  }
};

function debugVar(name, v) {
  console.log(name, {
    value: v,
    typeof: typeof v,
    isNull: v === null,
    isUndefined: v === undefined,
    isFalsy: !v,
    length: typeof v === "string" ? v.length : undefined,
    json: JSON.stringify(v),
    chars: typeof v === "string"
      ? [...v].map(c => c.charCodeAt(0))
      : undefined
  });
}


module.exports = { groqFetch };