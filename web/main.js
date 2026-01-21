// main.js — updated to send Preview requests to either /code or /prompt depending on radio selection

const api = window.location.origin + '/api/'; // base for endpoints; will call /code, /prompt, /stl, /step

// Helper: read which mode is selected ("code" or "prompt")
function getMode() {
  const el = document.querySelector('input[name="mode"]:checked');
  return el ? el.value : 'code';
}

// Minimal UI helpers (kept small and compatible with previous behaviour)
function updateOutput(message, success = true) {
  const out = document.getElementById('output-container');
  out.textContent = message;
  out.style.color = success ? '#0a0' : '#a00';
}

function setProcessing(enabled) {
  const previewBtn = document.getElementById('preview-btn');
  if (enabled) {
    previewBtn.disabled = true;
    previewBtn.textContent = 'Processing...';
  } else {
    previewBtn.disabled = false;
    previewBtn.textContent = 'Preview';
  }
}

// Attach event listeners
document.addEventListener('DOMContentLoaded', () => {
  const previewBtn = document.getElementById('preview-btn');
  const stlBtn = document.getElementById('stl-btn');
  const stepBtn = document.getElementById('step-btn');

  previewBtn.addEventListener('click', onPreviewClick);
  stlBtn.addEventListener('click', onStlClick);
  stepBtn.addEventListener('click', onStepClick);
});

async function onPreviewClick(e) {
  const codeOrPrompt = document.getElementById('code-input').value || '';
  const mode = getMode(); // 'code' or 'prompt'
  setProcessing(true);
  updateOutput('Processing...', false);

  try {
    let body;
    let endpoint;

    if (mode === 'prompt') {
      endpoint = 'prompt';
      body = { prompt: codeOrPrompt };
    } else {
      endpoint = 'code';
      body = { code: codeOrPrompt };
    }

    const resp = await fetch(api + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const statusCode = resp.status;

    // preview (code/prompt) returns JSON with message/data shape; handle errors
    const data = await resp.json().catch(() => ({ data: 'none', message: 'Invalid JSON response' }));

    const success = statusCode === 200 && data.message !== "none";
    updateOutput(data.message || JSON.stringify(data), success);

    if (success && data.data && data.data !== "None") {
      // Build or update model in three.js viewer (original behavior preserved)
      // NOTE: existing three.js logic expected data.data.vertices and data.data.faces
      // If you have the previous rendering logic, keep it — here's a minimal integration:
      try {
        // remove existing model if any
        if (window.currentModel) {
          window.scene.remove(window.currentModel);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.data.vertices, 3));
        geometry.setIndex(data.data.faces);
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.4, roughness: 0.6 });
        const mesh = new THREE.Mesh(geometry, material);
        window.currentModel = mesh;
        if (window.scene) {
          scene.add(mesh);
        }
      } catch (err) {
        console.warn('Failed to render preview geometry:', err);
      }
    }

  } catch (err) {
    console.error('Preview request failed:', err);
    updateOutput('Preview request failed: ' + (err.message || err), false);
  } finally {
    setProcessing(false);
  }
}

async function onStlClick(e) {
  const code = document.getElementById('code-input').value || '';
  if (!code) {
    updateOutput('Please enter CadQuery code before requesting STL', false);
    return;
  }
  try {
    updateOutput('Preparing STL...', false);
    const resp = await fetch(api + 'stl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    if (!resp.ok) {
      const json = await resp.json().catch(() => null);
      updateOutput(json?.message || 'STL request failed', false);
      return;
    }
    const blob = await resp.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'model.stl';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    updateOutput('STL download started', true);
  } catch (err) {
    console.error('STL request failed:', err);
    updateOutput('STL request failed: ' + (err.message || err), false);
  }
}

async function onStepClick(e) {
  const code = document.getElementById('code-input').value || '';
  if (!code) {
    updateOutput('Please enter CadQuery code before requesting STEP', false);
    return;
  }
  try {
    updateOutput('Preparing STEP...', false);
    const resp = await fetch(api + 'step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    if (!resp.ok) {
      const json = await resp.json().catch(() => null);
      updateOutput(json?.message || 'STEP request failed', false);
      return;
    }
    const blob = await resp.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'model.step';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    updateOutput('STEP download started', true);
  } catch (err) {
    console.error('STEP request failed:', err);
    updateOutput('STEP request failed: ' + (err.message || err), false);
  }
}