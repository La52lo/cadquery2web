// main.js — updated to send Preview requests to either /code or /prompt depending on radio selection
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.173.0/+esm';
import CameraControls from 'https://cdn.jsdelivr.net/npm/camera-controls@2.9.0/+esm';


const api = window.location.origin + '/api/'; // base for endpoints; will call /code, /prompt, /stl, /step  
//const api = "http://172.27.99.108:49157" + '/api/';

// Helper: read which mode is selected ("code" or "prompt")
//import { EditorView } from "@codemirror/view";
//import { EditorState } from "@codemirror/state";
//import { basicSetup } from "@codemirror/basic-setup";
import { python } from "@codemirror/lang-python";
import {EditorView, basicSetup} from "codemirror"
import { darcula } from "@uiw/codemirror-theme-darcula"; // Example import


let tabs, panels,
    btnPreview, btnSTL, btnSTEP,
    promptInput, codeInput, viewer;

 

// ---- Tab state ----
let activeTab = 'prompt';

let codeEditor;

function initCodeEditor(initialCode = "") {
  const parent = document.getElementById("codeEditor");
  const forceLight = EditorView.theme({}, { dark: false });
  codeEditor = new EditorView({
    doc: initialCode,
    parent,
    extensions: [basicSetup,darcula,python()]
  });
  console.log(python());
}

function setActiveTab(name) {
	activeTab = name;
	
	tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
	Object.keys(panels).forEach(k => panels[k].classList.toggle('active', k === name));
	// Preview is always allowed
	btnPreview.disabled = false;
	// Export only allowed from Code tab
	const exportDisabled = name === 'prompt';
	btnSTL.disabled = exportDisabled;
	btnSTEP.disabled = exportDisabled;
	
	const layout = document.getElementById("container");

	if (name == 'viewer') {
		layout.classList.remove("code-mode");
		document.querySelectorAll(".render-btn").forEach(el => {
			el.classList.add("hidden");
		});
	}
		else {
			layout.classList.add("code-mode");
			document.querySelectorAll(".render-btn").forEach(el => {
			el.classList.remove("hidden");
		});
			if (codeEditor) {
			  setTimeout(() => codeEditor.requestMeasure(), 0);
			}
		}
}
// Minimal UI helpers (kept small and compatible with previous behaviour)
function updateOutput(message, success = true) {
  const out = document.getElementById('output-container');
  out.textContent = message ;
  out.style.color = success ? '#0a0' : '#a00';
}

function setEditorCode(code) {
  const transaction = codeEditor.state.update({
    changes: {
      from: 0,
      to: codeEditor.state.doc.length,
      insert: code
    }
  });
  codeEditor.dispatch(transaction);
}

function getEditorCode() {
  return codeEditor.state.doc.toString();
}

function setProcessing(enabled) {
 
  if (enabled) {
    btnPreview.disabled = true;
    btnPreview.textContent = 'Processing...';
  } else {
    btnPreview.disabled = false;
    btnPreview.textContent = 'Preview';
  }
}

// three.js viewer initialization
function initViewer() {
  try {
    const container = document.getElementById('viewer');
    if (!container) throw new Error('#viewer element not found');

    // renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.innerHTML = ''; // clear any previous content
    container.appendChild(renderer.domElement);

    // scene & camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 10000);

    // lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemi.position.set(0, 200, 0);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(0, 200, 100);
    scene.add(dir);

    CameraControls.install({ THREE });
	renderer.setClearColor(0xffffff);
	scene.background = new THREE.Color(0xffffff);
    // store on window for other functions to access
    
	
	let gridHelper = new THREE.GridHelper(10, 10);
	scene.add(gridHelper);

    // default camera position
    
	camera.position.set(8, 8, 8);
	camera.lookAt(0, 0, 0);

	const cameraControls = new CameraControls(camera, renderer.domElement);
	// expose controls and objects globally so other functions can access them
	window.renderer = renderer;
    window.scene = scene;
    window.camera = camera;
    window.controls = cameraControls;

    // CameraControls requires a delta each frame; use a clock to provide it
    const clock = new THREE.Clock();

    if (window.controls && window.controls.update) window.controls.update(0);

    // resize handler
    //window.addEventListener('resize', () => {
     // });
 
	const resizeObserver = new ResizeObserver((container) => {
    // Access the new dimensions
    const { width, height } = container[0].contentRect;
	//const w = container.clientWidth;
     // const h = container.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      console.log(`Element resized to: ${width}px x ${height}px`);
    
    // Add your logic here (e.g., re-render a chart or adjust UI)
	});
	resizeObserver.observe(container);
    // animation loop
    function animate() {
      requestAnimationFrame(animate);
      const delta = clock.getDelta();
      if (window.controls && window.controls.update) window.controls.update(delta);
      renderer.render(scene, camera);
    }
    animate();

    console.info('Viewer initialized');
  } catch (err) {
    console.error('initViewer failed:', err);
    // ensure window.scene is not left undefined silently
    window.scene = window.scene || null;
  }
}


// Attach event listeners (handle the case DOMContentLoaded already fired)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onDomReady);
} else {
  // document already ready
  onDomReady();
}


async function onPreviewClick(e) {
  const payload = activeTab === 'prompt'
	? { prompt: promptInput.value }
	: { code: getEditorCode() };
  setProcessing(true);
  updateOutput('Processing...can take minutes', false);

  try {
    let body;
    let endpoint;

    if (activeTab === 'prompt') {
      endpoint = 'prompt';
    } else {
      endpoint = 'code';
    }

	
    const resp = await fetch(api + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const statusCode = resp.status;

    // preview (code/prompt) returns JSON with message/data shape; handle errors
    const data = await resp.json().catch(() => ({ data: 'none', message: 'Invalid JSON response' }));

    const success = statusCode === 200 && data.message !== "none";
    updateOutput(data.message || JSON.stringify(data), success);

    if (success && data.geometry && data.geometry !== "None") {
      // Build or update model in three.js viewer
      if (activeTab === 'prompt') setEditorCode(data.code);
	  try {
        // ensure viewer exists
        if (!window.scene) throw new Error('Viewer not initialized (window.scene is null)');

        // remove existing model if any
        if (window.currentModel && window.scene) {
          window.scene.remove(window.currentModel);
          if (window.currentModel.geometry) window.currentModel.geometry.dispose();
          if (window.currentModel.material) window.currentModel.material.dispose();
          window.currentModel = null;
        }

        // Positions - ensure Float32Array
        const positions = new Float32Array(data.geometry.data.vertices);
        const vertexCount = positions.length / 3;

        // Indices - ensure appropriate TypedArray
        let indexArray;
        if (vertexCount > 65535) {
          indexArray = new Uint32Array(data.geometry.data.faces);
        } else {
          indexArray = new Uint16Array(data.geometry.data.faces);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();

        const material = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.4, roughness: 0.6, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        window.currentModel = mesh;
        window.scene.add(mesh);

        // fit camera to model
        if (geometry.boundingSphere && window.camera && window.controls) {
          const bs = geometry.boundingSphere;
          const center = bs.center;
          const radius = bs.radius;
          const cam = window.camera;
          const distance = Math.max(radius * 2.5, 10);
          cam.position.copy(center.clone().add(new THREE.Vector3(distance, distance, distance)));
          cam.lookAt(center);
          // prefer CameraControls API if available
          if (typeof window.controls.setTarget === 'function') {
            window.controls.setTarget(center.x, center.y, center.z, true);
          } else if (window.controls.target) {
            window.controls.target.copy(center);
            window.controls.update(0);
          }
        }

      } catch (err) {
        console.warn('Failed to render preview geometry:', err);
        updateOutput('Failed to render preview geometry: ' + (err.message || err), false);
      }
    } else {
	
		updateOutput('Server error: ' + 'msg:' + data.message +"\nCode:\n" + data.code, false);
		if (activeTab === 'prompt') setEditorCode(data.code || "");
	};

  } catch (err) {
    console.error('Preview request failed:', err);
    updateOutput('Preview request failed: ' + (err.message || err), false);
  } finally {
    setProcessing(false);
  }
};

async function onStlClick(e) {
  const code = getEditorCode() || '';
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
  const code = getEditorCode() || '';
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

// Dom-ready handler to attach UI event listeners and init viewer
function onDomReady() {
  try { 
	 tabs = document.querySelectorAll('.tab');
		panels = {
			prompt: document.getElementById('panel-prompt'),
			code: document.getElementById('panel-code')
		};

		btnPreview = document.getElementById('btnPreview');
		btnSTL = document.getElementById('btnSTL');
		btnSTEP = document.getElementById('btnSTEP');

		promptInput = document.getElementById('promptInput');
		viewer = document.getElementById('viewer');
		setActiveTab('prompt');
	 tabs.forEach(tab => {
		tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
	});

	// Preview is always allowed
	btnPreview.disabled = false;
	btnPreview.addEventListener('click', onPreviewClick);
	btnSTL.addEventListener('click', onStlClick);
	btnSTEP.addEventListener('click', onStepClick);
	initCodeEditor("# CadQuery code will appear here\n");
	initViewer();
  } catch (err) {
    console.error('Error initializing viewer on DOM ready:', err);
  }

}
