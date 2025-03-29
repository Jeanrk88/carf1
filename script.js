import * as THREE from 'three';

// --- Variáveis globais ---
let mergedTreesGeometry = null;
let mergedHorsesGeometry = null;
let mapScene, mapCamera, mapRenderer, carDot, trackLine;
let scene, camera, renderer, car, clock, speedometerElement;
let controls = { forward: false, backward: false, left: false, right: false };

// --- Configurações do jogo ---
let carSpeed = 0;
const maxSpeed = 7;
const acceleration = 0.015;
const deceleration = 0.005;
const brakePower = 0.05;
const turnSpeed = 0.025;
const maxTurnAngle = Math.PI / 1;
const carRadius = 1.0;
const roadWidth = 25;
const groundSize = 3000;
const trackSegmentLength = 450;
const trackCurveRadius = 200;

// --- Arrays de objetos ---
let trees = [];
let horses = [];
let mountains = [];
let signs = [];
let objectsToAnimateKnockdown = [];

// --- Trilha ---
let trackPoints = [];
let trackCurve;

// --- Áudio ---
let audioContext;
let engineSoundSource;
let gainNode;
const minPlaybackRate = 0.4;
const maxPlaybackRate = 2;
let audioReady = false;
const startButton = document.getElementById('start-button');

// --- Funções de inicialização ---
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 200, 1000);

    clock = new THREE.Clock();

    camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 10000);
    camera.position.set(0, 50, -50);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    speedometerElement = document.getElementById('speedometer');

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(100, 150, 150);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    createGround();
    createTrackSign();
    createTrackPath();
    createRoad();
    createMiniMap();
    car = createCar();
    scene.add(car);
    
    car.position.copy(trackPoints[0]);
    car.position.y = 0.4;
    const lookAtPoint = trackCurve.getPointAt(0.01);
    lookAtPoint.y = car.position.y;
    car.lookAt(lookAtPoint);

    createTrees();
    createHorses();
    createMountains();
    createSigns();
    createClouds();

    setupControls();
    setupAudio();
    window.addEventListener('resize', onWindowResize, false);

    animate();
}

// --- Áudio ---
function setupAudio() {
    startButton.addEventListener('click', async () => {
        if (audioContext) return;

        try {
            startButton.disabled = true;
            startButton.textContent = "Loading Audio...";

            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await getEngineSoundBuffer(audioContext);

            gainNode = audioContext.createGain();
            gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
            gainNode.connect(audioContext.destination);

            engineSoundSource = audioContext.createBufferSource();
            engineSoundSource.buffer = audioBuffer;
            engineSoundSource.loop = true;
            engineSoundSource.playbackRate.setValueAtTime(minPlaybackRate, audioContext.currentTime);
            engineSoundSource.connect(gainNode);
            engineSoundSource.start(0);

            audioReady = true;
            startButton.style.display = 'none';
            document.getElementById('touch-capture').style.pointerEvents = 'auto';
        } catch (error) {
            console.error("Failed to initialize audio:", error);
            startButton.textContent = "Audio Error";
            startButton.disabled = false;
        }
    });
}

async function getEngineSoundBuffer(context) {
    const duration = 1.0;
    const sampleRate = context.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = context.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    const frequency = 100;
    
    for (let i = 0; i < frameCount; i++) {
        const time = i / sampleRate;
        data[i] = 2 * (time * frequency - Math.floor(0.5 + time * frequency)) - 1;
        if (i > frameCount * 0.95) {
            data[i] *= (frameCount - i) / (frameCount * 0.05);
        }
    }
    return buffer;
}

// --- Criação de objetos 3D ---
function createGround() {
    const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x3A5F0B });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    scene.add(ground);
}

function createTrackPath() {
    trackPoints = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, trackSegmentLength * 1.5),
        new THREE.Vector3(trackCurveRadius, 0, trackSegmentLength * 1.5 + trackCurveRadius),
        new THREE.Vector3(trackCurveRadius * 2, 0, trackSegmentLength * 1.5),
        new THREE.Vector3(trackCurveRadius * 2 + trackSegmentLength, 0, trackSegmentLength * 1.5),
        new THREE.Vector3(trackCurveRadius * 2 + trackSegmentLength + trackCurveRadius, 0, trackSegmentLength * 1.5 - trackCurveRadius),
        new THREE.Vector3(trackCurveRadius * 2 + trackSegmentLength, 0, trackSegmentLength * 1.5 - 2 * trackCurveRadius),
        new THREE.Vector3(trackCurveRadius * 2 + trackSegmentLength, 0, -trackSegmentLength * 0.5),
        new THREE.Vector3(trackCurveRadius * 2 + trackSegmentLength - trackCurveRadius, 0, -trackSegmentLength * 0.5 - trackCurveRadius),
        new THREE.Vector3(trackCurveRadius, 0, -trackSegmentLength * 0.5 - trackCurveRadius * 2),
        new THREE.Vector3(-trackCurveRadius, 0, -trackSegmentLength * 0.5 - trackCurveRadius),
        new THREE.Vector3(0, 0, -trackSegmentLength * 0.5),
        new THREE.Vector3(0, 0, 0)
    ];

    trackCurve = new THREE.CatmullRomCurve3(trackPoints, true, 'catmullrom', 0.3);
}

function createRoad() {
    const divisions = 2000;
    const points = trackCurve.getPoints(divisions);
    const vertices = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const roadHeight = 0.01;

    for (let i = 0; i <= divisions; i++) {
        const t = i / divisions;
        const point = trackCurve.getPointAt(t);
        const tangent = trackCurve.getTangentAt(t).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        const v1 = point.clone().add(normal.clone().multiplyScalar(roadWidth / 2));
        const v2 = point.clone().sub(normal.clone().multiplyScalar(roadWidth / 2));

        vertices.push(v1.x, roadHeight, v1.z);
        vertices.push(v2.x, roadHeight, v2.z);
        uvs.push(t, 1);
        uvs.push(t, 0);
        normals.push(0, 1, 0);
        normals.push(0, 1, 0);

        if (i < divisions) {
            const idx = i * 2;
            indices.push(idx, idx + 1, idx + 2);
            indices.push(idx + 1, idx + 3, idx + 2);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    const material = new THREE.MeshStandardMaterial({ color: 0x444444, side: THREE.DoubleSide });
    const roadMesh = new THREE.Mesh(geometry, material);
    scene.add(roadMesh);

    // Faixa quadriculada
    const checkeredStripWidth = roadWidth;
    const checkeredStripDepth = 15.0;
    const squareSize = 2.0;

    const canvasSize = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const context = canvas.getContext('2d');

    const squaresX = Math.ceil(checkeredStripWidth / squareSize);
    const squaresY = Math.ceil(checkeredStripDepth / squareSize);
    const squarePixelSize = canvasSize / Math.max(squaresX, squaresY);

    for (let y = 0; y < squaresY; y++) {
        for (let x = 0; x < squaresX; x++) {
            context.fillStyle = (x + y) % 2 === 0 ? '#FFFFFF' : '#000000';
            context.fillRect(
                x * squarePixelSize,
                y * squarePixelSize,
                squarePixelSize,
                squarePixelSize
            );
        }
    }

    const checkeredTexture = new THREE.CanvasTexture(canvas);
    checkeredTexture.wrapS = THREE.RepeatWrapping;
    checkeredTexture.wrapT = THREE.RepeatWrapping;
    checkeredTexture.repeat.set(1, 1);

    const checkeredMaterial = new THREE.MeshStandardMaterial({
        map: checkeredTexture,
        side: THREE.DoubleSide,
        roughness: 0.7,
        metalness: 0.1
    });

    const checkeredStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(checkeredStripWidth, checkeredStripDepth),
        checkeredMaterial
    );

    const startPoint = trackCurve.getPointAt(0);
    const startTangent = trackCurve.getTangentAt(0).normalize();
    const startNormal = new THREE.Vector3(-startTangent.z, 0, startTangent.x).normalize();

    checkeredStrip.position.copy(startPoint);
    checkeredStrip.position.y += 0.02;
    checkeredStrip.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3().crossVectors(startNormal, new THREE.Vector3(0, 1, 0)).normalize()
    );
    checkeredStrip.rotation.x = Math.PI / 2;

    checkeredStrip.geometry.attributes.uv.array[1] = squaresY / squaresX;
    checkeredStrip.geometry.attributes.uv.array[3] = squaresY / squaresX;
    checkeredStrip.geometry.attributes.uv.needsUpdate = true;

    scene.add(checkeredStrip);

    // Linhas laterais
    const lineMaterial = new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
    });

    const lineWidth = 2.5;
    const leftLineVertices = [];
    const rightLineVertices = [];
    const lineIndices = [];

    for (let i = 0; i <= divisions; i++) {
        const t = i / divisions;
        const point = trackCurve.getPointAt(t);
        const tangent = trackCurve.getTangentAt(t).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        const leftCenter = point.clone().add(normal.clone().multiplyScalar(roadWidth / 2));
        const rightCenter = point.clone().sub(normal.clone().multiplyScalar(roadWidth / 2));

        const leftOuter = leftCenter.clone().add(normal.clone().multiplyScalar(lineWidth / 2));
        const leftInner = leftCenter.clone().sub(normal.clone().multiplyScalar(lineWidth / 2));
        leftLineVertices.push(leftOuter.x, roadHeight + 0.01, leftOuter.z);
        leftLineVertices.push(leftInner.x, roadHeight + 0.01, leftInner.z);

        const rightOuter = rightCenter.clone().sub(normal.clone().multiplyScalar(lineWidth / 2));
        const rightInner = rightCenter.clone().add(normal.clone().multiplyScalar(lineWidth / 2));
        rightLineVertices.push(rightOuter.x, roadHeight + 0.01, rightOuter.z);
        rightLineVertices.push(rightInner.x, roadHeight + 0.01, rightInner.z);

        if (i < divisions) {
            const idx = i * 2;
            lineIndices.push(idx, idx + 1, idx + 2);
            lineIndices.push(idx + 1, idx + 3, idx + 2);
        }
    }

    const leftLineGeometry = new THREE.BufferGeometry();
    leftLineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(leftLineVertices, 3));
    leftLineGeometry.setIndex(lineIndices);

    const rightLineGeometry = new THREE.BufferGeometry();
    rightLineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(rightLineVertices, 3));
    rightLineGeometry.setIndex(lineIndices);

    const leftLineMesh = new THREE.Mesh(leftLineGeometry, lineMaterial);
    const rightLineMesh = new THREE.Mesh(rightLineGeometry, lineMaterial);

    scene.add(leftLineMesh);
    scene.add(rightLineMesh);

    // Linha central
    const centerLineMaterial = new THREE.LineBasicMaterial({ color: 0xFFFFFF, opacity: 0.1, linewidth: 2 });
    const centerLinePoints = points.map(p => new THREE.Vector3(p.x, roadHeight + 0.01, p.z));
    const centerLineGeometry = new THREE.BufferGeometry().setFromPoints(centerLinePoints);
    const centerLine = new THREE.Line(centerLineGeometry, centerLineMaterial);
    scene.add(centerLine);
}

function createCar() {
    const carGroup = new THREE.Group();

    // Corpo principal
    const bodyGeometry = new THREE.BoxGeometry(1.8, 0.4, 3.5);
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        metalness: 0.7,
        roughness: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.2;
    carGroup.add(body);

    // Cone frontal
    const noseGeometry = new THREE.CylinderGeometry(0.2, 0.4, 2.5, 8, 1, false);
    const nose = new THREE.Mesh(noseGeometry, bodyMaterial);
    nose.position.set(0, 0.4, 1.2);
    nose.rotation.x = Math.PI / 2;
    carGroup.add(nose);

    // Cockpit
    const cockpitGeometry = new THREE.BoxGeometry(0.8, 0.3, 0.8);
    const cockpitMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
    cockpit.position.set(0, 0.5, -0.3);
    carGroup.add(cockpit);

    // Para-brisa
    const windshieldGeometry = new THREE.BoxGeometry(0.6, 0.3, 0.5);
    const windshieldMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 1
    });
    const windshield = new THREE.Mesh(windshieldGeometry, windshieldMaterial);
    windshield.position.set(0, 0.7, -0.4);
    carGroup.add(windshield);

    // Rodas
    const wheelRadius = 0.40;
    const wheelWidth = 0.5;
    const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 64);
    const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const rimMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 0.9,
        roughness: 0.1
    });

    const frontWheels = [];
    const wheelPositions = [
        { x: -0.9, y: wheelRadius, z: 1.3, front: true },
        { x: 0.9, y: wheelRadius, z: 1.3, front: true },
        { x: -0.9, y: wheelRadius, z: -1.3, front: false },
        { x: 0.9, y: wheelRadius, z: -1.3, front: false }
    ];

    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, tireMaterial);
        wheel.position.set(pos.x, pos.y, pos.z);
        wheel.rotation.z = Math.PI / 2;
        wheel.name = pos.front ? 'frontWheel' : 'rearWheel';
        
        if (pos.front) {
            frontWheels.push(wheel);
        }
        
        carGroup.add(wheel);

        const rimGeometry = new THREE.CylinderGeometry(
            wheelRadius * 0.7,
            wheelRadius * 0.7,
            wheelWidth + 0.01,
            16
        );
        const rim = new THREE.Mesh(rimGeometry, rimMaterial);
        rim.position.set(pos.x, pos.y, pos.z);
        rim.rotation.z = Math.PI / 2;
        carGroup.add(rim);
    });

    // Asa dianteira
    const wingMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        metalness: 0.5
    });

    const frontWingGeo = new THREE.BoxGeometry(1.8, 0.05, 0.4);
    const frontWing = new THREE.Mesh(frontWingGeo, wingMaterial);
    frontWing.position.set(0, 0.2, 2.8);
    carGroup.add(frontWing);

    const endPlateGeo = new THREE.BoxGeometry(0.05, 0.2, 0.4);
    const leftEndPlate = new THREE.Mesh(endPlateGeo, wingMaterial);
    leftEndPlate.position.set(-0.9, 0.3, 2.8);
    carGroup.add(leftEndPlate);

    const rightEndPlate = new THREE.Mesh(endPlateGeo, wingMaterial);
    rightEndPlate.position.set(0.9, 0.3, 2.8);
    carGroup.add(rightEndPlate);

    // Asa traseira
    const rearWingMainGeo = new THREE.BoxGeometry(1.2, 0.05, 0.4);
    const rearWingMain = new THREE.Mesh(rearWingMainGeo, wingMaterial);
    rearWingMain.position.set(0, 0.8, -2.2);
    carGroup.add(rearWingMain);

    const rearWingUpperGeo = new THREE.BoxGeometry(1.0, 0.05, 0.3);
    const rearWingUpper = new THREE.Mesh(rearWingUpperGeo, wingMaterial);
    rearWingUpper.position.set(0, 1.0, -2.2);
    carGroup.add(rearWingUpper);

    const rearEndPlateGeo = new THREE.BoxGeometry(0.05, 0.4, 0.4);
    const leftRearEndPlate = new THREE.Mesh(rearEndPlateGeo, wingMaterial);
    leftRearEndPlate.position.set(-0.6, 0.9, -2.2);
    carGroup.add(leftRearEndPlate);

    const rightRearEndPlate = new THREE.Mesh(rearEndPlateGeo, wingMaterial);
    rightRearEndPlate.position.set(0.6, 0.9, -2.2);
    carGroup.add(rightRearEndPlate);

    // Side pods
    const sidePodGeometry = new THREE.BoxGeometry(0.6, 0.3, 1.5);
    const sidePodMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });

    const leftSidePod = new THREE.Mesh(sidePodGeometry, sidePodMaterial);
    leftSidePod.position.set(-0.6, 0.3, 0.2);
    carGroup.add(leftSidePod);

    const rightSidePod = new THREE.Mesh(sidePodGeometry, sidePodMaterial);
    rightSidePod.position.set(0.6, 0.3, 0.2);
    carGroup.add(rightSidePod);

    // Exhaust pipes
    const exhaustGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8);
    const exhaustMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });

    const leftExhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
    leftExhaust.position.set(-0.3, 0.3, -1.8);
    leftExhaust.rotation.z = Math.PI / 2;
    carGroup.add(leftExhaust);

    const rightExhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
    rightExhaust.position.set(0.3, 0.3, -1.8);
    rightExhaust.rotation.z = Math.PI / 2;
    carGroup.add(rightExhaust);

    // Texto no parachoque traseiro
    function createTextMesh() {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 256;
        const context = canvas.getContext('2d');

        context.fillStyle = 'rgba(0, 0, 0, 0)';
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.font = 'Bold 120px Arial';
        context.textAlign = 'center';
        context.fillStyle = '#FFFFFF';
        context.fillText('@jeanrogerkist', canvas.width / 2, canvas.height / 2 + 50);

        const texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });

        const geometry = new THREE.PlaneGeometry(1.3, 0.4);
        const textMesh = new THREE.Mesh(geometry, material);

        return textMesh;
    }

    const textMesh = createTextMesh();
    textMesh.position.set(0, 0.5, -2.85);
    textMesh.rotation.y = Math.PI;
    textMesh.rotation.x = -0.2;
    carGroup.add(textMesh);

    carGroup.userData.frontWheels = frontWheels;
    return carGroup;
}

function isPointOnRoad(point, tolerance = roadWidth * 1.5) {
    const divisions = 100;
    let minDistSq = Infinity;
    for (let i = 0; i <= divisions; i++) {
        const trackPoint = trackCurve.getPointAt(i / divisions);
        const distSq = point.distanceToSquared(trackPoint);
        if (distSq < minDistSq) {
            minDistSq = distSq;
        }
    }
    return minDistSq < tolerance * tolerance;
}

function createTrackSign() {
    const signGroup = new THREE.Group();
    const roadWidth = 25;
    const poleHeight = 12;
    const signWidth = roadWidth * 1.8;
    const signThickness = 0.2;

    // Postes
    const poleGeometry = new THREE.CylinderGeometry(0.5, 0.5, poleHeight, 8);
    const poleMaterial = new THREE.MeshStandardMaterial({
        color: 0x606060,
        metalness: 0.7,
        roughness: 0.3
    });

    const leftPole = new THREE.Mesh(poleGeometry, poleMaterial);
    leftPole.position.set(-roadWidth / 2 - 2, poleHeight / 2, +0.5);

    const rightPole = new THREE.Mesh(poleGeometry, poleMaterial);
    rightPole.position.set(roadWidth / 2 + 2, poleHeight / 2, +0.5);

    signGroup.add(leftPole);
    signGroup.add(rightPole);

    // Placa
    const canvas = document.createElement('canvas');
    canvas.width = 4096;
    canvas.height = 2048;
    const context = canvas.getContext('2d');

    context.fillStyle = '#FFFACD';
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = '#8B0000';
    context.lineWidth = 100;
    context.strokeRect(100, 100, 3896, 1848);

    context.font = 'Bold 200px Arial';
    context.textAlign = 'center';
    context.fillStyle = '#8B0000';

    context.fillText('Carrosséis que encantam', canvas.width / 2, 600);
    context.font = 'Bold 140px Arial';
    context.fillText('Se torne um mestre', canvas.width / 2, 800);
    context.fillText('na criação de Carrosséis!', canvas.width / 2, 1000);
    context.font = 'Bold 120px Arial';
    context.fillText('Acesse:', canvas.width / 2, 1300);
    context.font = 'Bold 160px Arial';
    context.fillText('anacristibeier.com.br/carrosseis-que-encantam', canvas.width / 2, 1500);
    context.font = 'Bold 30px Arial';

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const signGeometry = new THREE.PlaneGeometry(signWidth, 10);
    const signMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.97
    });

    const sign = new THREE.Mesh(signGeometry, signMaterial);
    sign.position.set(0, poleHeight - 2, 0);
    sign.rotation.y = Math.PI;

    // Estrutura de suporte
    const crossbarGeometry = new THREE.BoxGeometry(signWidth + 2, 0.5, 0.5);
    const crossbarMaterial = new THREE.MeshStandardMaterial({ color: 0x404040 });

    const topBar = new THREE.Mesh(crossbarGeometry, crossbarMaterial);
    topBar.position.set(0, poleHeight - 1, 0.3);

    const bottomBar = new THREE.Mesh(crossbarGeometry, crossbarMaterial);
    bottomBar.position.set(0, poleHeight - 4, 0.3);

    signGroup.add(topBar);
    signGroup.add(bottomBar);
    signGroup.add(leftPole);
    signGroup.add(rightPole);
    signGroup.add(sign);

    signGroup.position.set(-5, 0, 200);
    signGroup.rotation.y = Math.PI / 18;
    signGroup.rotation.z = 0.0;

    scene.add(signGroup);
}

function createMiniMap() {
    mapScene = new THREE.Scene();
    mapScene.rotation.x = Math.PI;

    const aspect = 1;
    const viewSize = 1700;
    mapCamera = new THREE.OrthographicCamera(
        -viewSize / 2 * aspect, viewSize / 2 * aspect,
        viewSize / 2, -viewSize / 2,
        1, 1000
    );
    mapScene.scale.x = -1;
    mapCamera.position.set(-400, 100, -100);
    mapCamera.lookAt(0, 0, 0);

    mapRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    mapRenderer.setSize(200, 200);
    document.getElementById('map-viewport').appendChild(mapRenderer.domElement);

    const trackGeometry = new THREE.BufferGeometry().setFromPoints(trackPoints);
    const trackMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
    trackLine = new THREE.Line(trackGeometry, trackMaterial);
    mapScene.add(trackLine);

    const dotGeometry = new THREE.SphereGeometry(48, 256, 256);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    carDot = new THREE.Mesh(dotGeometry, dotMaterial);
    mapScene.add(carDot);
}

function updateMiniMap() {
    carDot.position.copy(car.position);
    mapCamera.rotation.copy(new THREE.Euler(-Math.PI / 2, 0, 0));
    mapRenderer.render(mapScene, mapCamera);
}

function createTrees() {
    const treeCount = 100;
    const trunkHeight = 1;
    const leavesHeight = 10;
    const trunkRadius = 0.3;
    const leavesRadius = 5;
    const collisionRadius = leavesRadius * 0.8;

    const trunkGeometry = new THREE.CylinderGeometry(trunkRadius, trunkRadius, trunkHeight, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    const leavesGeometry = new THREE.ConeGeometry(leavesRadius, leavesHeight, 8);
    const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x006400 });

    trees = [];
    const treeMeshesGroup = new THREE.Group();

    for (let i = 0; i < treeCount; i++) {
        let placed = false;
        let attempts = 0;
        while (!placed && attempts < 20) {
            attempts++;
            const range = groundSize * 0.4;
            const x = (Math.random() - 0.5) * range * 2;
            const z = (Math.random() - 0.5) * range * 2;
            const pos = new THREE.Vector3(x, 0, z);

            if (isPointOnRoad(pos)) continue;

            let tooCloseToMountain = false;
            for (const mountain of mountains) {
                if (pos.distanceToSquared(mountain.position) < Math.pow(mountain.radius + leavesRadius + 10, 2)) {
                    tooCloseToMountain = true;
                    break;
                }
            }
            if (tooCloseToMountain) continue;

            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.position.y = trunkHeight / 2;
            const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
            leaves.position.y = trunkHeight + leavesHeight / 2;

            const singleTreeGroup = new THREE.Group();
            singleTreeGroup.add(trunk);
            singleTreeGroup.add(leaves);
            singleTreeGroup.position.set(x, 0, z);

            treeMeshesGroup.add(singleTreeGroup);
            trees.push({
                mesh: singleTreeGroup,
                radius: collisionRadius,
                position: singleTreeGroup.position,
                isKnockedDown: false,
                type: 'tree'
            });
            placed = true;
        }
    }
    scene.add(treeMeshesGroup);
}

function createHorseModel() {
    const horseGroup = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x964B00 });
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x733D00 });

    // Corpo
    const bodyGeo = new THREE.BoxGeometry(1.8, 0.8, 0.6);
    const body = new THREE.Mesh(bodyGeo, bodyMaterial);
    body.position.y = 0.8;
    horseGroup.add(body);

    // Cabeça/Pescoço
    const neckGeo = new THREE.BoxGeometry(0.4, 1.0, 0.4);
    const neck = new THREE.Mesh(neckGeo, bodyMaterial);
    neck.position.set(0.9, 1.2, 0);
    neck.rotation.z = -Math.PI / 6;
    horseGroup.add(neck);
    
    const headGeo = new THREE.BoxGeometry(0.6, 0.4, 0.4);
    const head = new THREE.Mesh(headGeo, bodyMaterial);
    head.position.set(1.2, 1.5, 0);
    horseGroup.add(head);

    // Pernas
    const legGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6);
    const legPositions = [
        { x: 0.7, y: 0.4, z: 0.2 }, { x: 0.7, y: 0.4, z: -0.2 },
        { x: -0.7, y: 0.4, z: 0.2 }, { x: -0.7, y: 0.4, z: -0.2 }
    ];
    
    legPositions.forEach(pos => {
        const leg = new THREE.Mesh(legGeo, legMaterial);
        leg.position.set(pos.x, pos.y, pos.z);
        horseGroup.add(leg);
    });

    horseGroup.scale.set(1.5, 1.5, 1.5);
    return horseGroup;
}

function createHorses() {
    const horseCount = 50;
    const collisionRadius = 1.2;
    horses = [];
    const horseMeshesGroup = new THREE.Group();

    for (let i = 0; i < horseCount; i++) {
        let placed = false;
        let attempts = 0;
        while (!placed && attempts < 20) {
            attempts++;
            const range = groundSize * 0.35;
            const x = (Math.random() - 0.5) * range * 2;
            const z = (Math.random() - 0.5) * range * 2;
            const pos = new THREE.Vector3(x, 0, z);

            if (isPointOnRoad(pos, roadWidth * 1.5)) continue;

            let tooCloseToOther = false;
            for (const mountain of mountains) {
                if (pos.distanceToSquared(mountain.position) < Math.pow(mountain.radius + collisionRadius + 15, 2)) {
                    tooCloseToOther = true; break;
                }
            }
            if (tooCloseToOther) continue;
            
            for (const tree of trees) {
                if (pos.distanceToSquared(tree.position) < Math.pow(tree.radius + collisionRadius + 5, 2)) {
                    tooCloseToOther = true; break;
                }
            }
            if (tooCloseToOther) continue;
            
            for (const horse of horses) {
                if (pos.distanceToSquared(horse.position) < Math.pow(horse.radius + collisionRadius + 5, 2)) {
                    tooCloseToOther = true; break;
                }
            }
            if (tooCloseToOther) continue;

            const singleHorseGroup = createHorseModel();
            singleHorseGroup.position.set(x, 0, z);
            singleHorseGroup.rotation.y = Math.random() * Math.PI * 2;

            horseMeshesGroup.add(singleHorseGroup);
            horses.push({
                mesh: singleHorseGroup,
                radius: collisionRadius,
                position: singleHorseGroup.position,
                isKnockedDown: false,
                type: 'horse'
            });
            placed = true;
        }
    }
    scene.add(horseMeshesGroup);
}

function createMountains() {
    const mountainCount = 15;
    const mountainMaterial = new THREE.MeshStandardMaterial({ color: 0x696969, flatShading: true });
    const mountainGroup = new THREE.Group();
    mountains = [];

    const safeZonePadding = roadWidth * 10;

    for (let i = 0; i < mountainCount; i++) {
        const radius = Math.random() * 60 + 20;
        const height = Math.random() * 100 + 50;
        const mountainGeometry = new THREE.ConeGeometry(radius, height, Math.floor(Math.random() * 4) + 5);
        const mountainMesh = new THREE.Mesh(mountainGeometry, mountainMaterial);

        let placed = false;
        let attempts = 0;

        while (!placed && attempts < 100) {
            attempts++;
            const angle = Math.random() * Math.PI * 2;
            const minDist = trackCurveRadius * 3 + trackSegmentLength * 0.5 + radius + safeZonePadding;
            const maxDist = groundSize / 2 - radius * 1.5;

            if (minDist >= maxDist) continue;

            const distance = minDist + Math.random() * (maxDist - minDist);
            const x = Math.cos(angle) * distance;
            const z = Math.sin(angle) * distance;
            const pos = new THREE.Vector3(x, 0, z);

            let tooCloseToTrack = false;
            for (let t = 0; t <= 1; t += 0.05) {
                const trackPoint = trackCurve.getPointAt(t);
                if (pos.distanceTo(trackPoint) < roadWidth + safeZonePadding) {
                    tooCloseToTrack = true;
                    break;
                }
            }

            if (tooCloseToTrack) continue;

            let tooCloseToOther = false;
            for (const mountain of mountains) {
                if (pos.distanceTo(mountain.position) < mountain.radius + radius + 50) {
                    tooCloseToOther = true;
                    break;
                }
            }

            if (!tooCloseToOther) {
                mountainMesh.position.set(x, height / 2 - 0.1, z);
                mountainGroup.add(mountainMesh);
                mountains.push({
                    position: pos,
                    radius: radius,
                    type: 'mountain',
                    height: height
                });
                placed = true;
            }
        }
    }
    scene.add(mountainGroup);
}

function createSigns() {
    const signMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const signGroup = new THREE.Group();
    signs = [];

    const signPositionsT = [0.1, 0.25, 0.45, 0.6, 0.8, 0.95];

    for (const t of signPositionsT) {
        const point = trackCurve.getPointAt(t);
        const tangent = trackCurve.getTangentAt(t).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        const side = (Math.random() < 0.5) ? 1 : -1;
        const offsetDistance = roadWidth / 2 + 2;

        const signPosition = point.clone().add(normal.clone().multiplyScalar(offsetDistance * side));
        signPosition.y = 0;

        // Poste
        const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.5, 8);
        const post = new THREE.Mesh(postGeo, postMaterial);
        post.position.copy(signPosition);
        post.position.y = 2.5 / 2;
        signGroup.add(post);

        // Placa
        const faceGeo = new THREE.PlaneGeometry(1.5, 1);
        const face = new THREE.Mesh(faceGeo, signMaterial);
        face.position.copy(signPosition);
        face.position.y = 2.0;
        face.lookAt(point.clone().add(tangent.clone().multiplyScalar(-10)));
        face.rotation.y += Math.PI;

        signGroup.add(face);
        signs.push(face);
    }
    scene.add(signGroup);
}

function createClouds() {
    const cloudCount = 30;
    const cloudMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff, 
        transparent: true, 
        opacity: 0.8 
    });
    const cloudGroup = new THREE.Group();
    
    for (let i = 0; i < cloudCount; i++) {
        const cloudCluster = new THREE.Group();
        const numSpheres = Math.floor(Math.random() * 6) + 4;
        
        for (let j = 0; j < numSpheres; j++) {
            const sphereRadius = Math.random() * 15 + 8;
            const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 8, 8);
            const sphere = new THREE.Mesh(sphereGeometry, cloudMaterial);
            sphere.position.set(
                (Math.random() - 0.5) * 40,
                (Math.random() - 0.5) * 15,
                (Math.random() - 0.5) * 30
            );
            cloudCluster.add(sphere);
        }
        
        cloudCluster.position.set(
            (Math.random() - 0.5) * (groundSize * 1.5),
            Math.random() * 80 + 120,
            (Math.random() - 0.5) * (groundSize * 1.5)
        );
        cloudGroup.add(cloudCluster);
    }
    
    scene.add(cloudGroup);
}

// --- Controles ---
function setupControls() {
    // Teclado
    document.addEventListener('keydown', (event) => {
        switch (event.key) {
            case 'w': case 'ArrowUp': controls.forward = true; break;
            case 's': case 'ArrowDown': controls.backward = true; break;
            case 'a': case 'ArrowLeft': controls.left = true; break;
            case 'd': case 'ArrowRight': controls.right = true; break;
        }
    });
    
    document.addEventListener('keyup', (event) => {
        switch (event.key) {
            case 'w': case 'ArrowUp': controls.forward = false; break;
            case 's': case 'ArrowDown': controls.backward = false; break;
            case 'a': case 'ArrowLeft': controls.left = false; break;
            case 'd': case 'ArrowRight': controls.right = false; break;
        }
    });

    // Touch
    const touchCaptureArea = document.getElementById('touch-capture');
    touchCaptureArea.style.pointerEvents = 'none';

    function handleTouchStart(event) { 
        event.preventDefault(); 
        processTouches(event.touches); 
    }
    
    function handleTouchMove(event) { 
        event.preventDefault(); 
        processTouches(event.touches); 
    }
    
    function handleTouchEnd(event) {
        event.preventDefault();
        if (event.touches.length === 0) resetTouchControls();
        else processTouches(event.touches);
    }
    
    function resetTouchControls() { 
        controls.forward = false; 
        controls.backward = false; 
        controls.left = false; 
        controls.right = false; 
    }

    function processTouches(touches) {
        resetTouchControls();
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const bottomAreaHeight = screenHeight * 0.3;

        for (let i = 0; i < touches.length; i++) {
            const touch = touches[i];
            const touchX = touch.clientX;
            const touchY = touch.clientY;

            if (touchY > screenHeight - bottomAreaHeight) {
                if (touchY > screenHeight - bottomAreaHeight / 2) {
                    controls.backward = true;
                } else {
                    controls.forward = true;
                }

                if (touchX < screenWidth / 2) {
                    controls.left = true;
                } else {
                    controls.right = true;
                }
            }
        }
    }

    touchCaptureArea.addEventListener('touchstart', handleTouchStart, { passive: false });
    touchCaptureArea.addEventListener('touchmove', handleTouchMove, { passive: false });
    touchCaptureArea.addEventListener('touchend', handleTouchEnd, { passive: false });
    touchCaptureArea.addEventListener('touchcancel', handleTouchEnd, { passive: false });
}

// --- Detecção de colisão ---
function checkCollisions(nextPosition) {
    const checkObstacleArray = (obstacleArray) => {
        for (const obstacle of obstacleArray) {
            if (obstacle.isKnockedDown) continue;

            const dx = nextPosition.x - obstacle.position.x;
            const dz = nextPosition.z - obstacle.position.z;
            const distanceSq = dx * dx + dz * dz;
            const combinedRadius = carRadius + obstacle.radius;
            const combinedRadiusSq = combinedRadius * combinedRadius;

            if (distanceSq < combinedRadiusSq) {
                return obstacle;
            }
        }
        return null;
    };

    let collidedObject = checkObstacleArray(trees);
    if (collidedObject) return collidedObject;

    collidedObject = checkObstacleArray(horses);
    if (collidedObject) return collidedObject;

    collidedObject = checkObstacleArray(mountains);
    if (collidedObject) return collidedObject;

    if (Math.abs(nextPosition.x) > groundSize / 2 || Math.abs(nextPosition.z) > groundSize / 2) {
        return { type: 'boundary' };
    }

    return null;
}

// --- Animação de objetos derrubados ---
function animateKnockDown(delta) {
    const fallSpeed = Math.PI * 0.8;
    const targetRotationX = -Math.PI / 2;

    for (let i = objectsToAnimateKnockdown.length - 1; i >= 0; i--) {
        const obj = objectsToAnimateKnockdown[i];
        const mesh = obj.mesh;

        if (mesh.rotation.x > targetRotationX) {
            mesh.rotation.x -= fallSpeed * delta;
            if (mesh.rotation.x < targetRotationX) {
                mesh.rotation.x = targetRotationX;
            }
        } else {
            objectsToAnimateKnockdown.splice(i, 1);
        }
    }
}

// --- Atualização do velocímetro ---
function updateSpeedometer() {
    const maxRPM = 10000;
    const rpm = Math.abs(carSpeed / maxSpeed) * maxRPM;
    const gear = Math.min(6, Math.max(1, Math.floor(rpm / 1500) + 1));

    const rpmBar = document.querySelector('.rpm-bar');
    const gearDisplay = document.querySelector('.gear-display');
    const speedNumber = document.querySelector('.speed-number');

    rpmBar.style.width = `${(rpm / maxRPM) * 100}%`;
    rpmBar.style.background = rpm > 8000 ?
        'linear-gradient(90deg, #ff0000 0%, #ff4500 100%)' :
        'linear-gradient(90deg, #00ff00 0%, #ff0000 100%)';

    if (gearDisplay.textContent !== gear.toString()) {
        gearDisplay.style.animation = 'gearShift 0.3s';
        setTimeout(() => {
            gearDisplay.style.animation = '';
        }, 372);
    }
    gearDisplay.textContent = gear === 0 ? 'N' : gear.toString();

    const currentSpeed = Math.abs(carSpeed / maxSpeed) * 372;
    speedNumber.textContent = Math.min(372, currentSpeed).toFixed(0);
}

setInterval(updateSpeedometer, 50);

// --- Loop de animação principal ---
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const activeControls = audioReady ? controls : { forward: false, backward: false, left: false, right: false };

    // Física do carro
    const speedRatio = Math.abs(carSpeed) / maxSpeed;
    let turnFactor = Math.min(1, Math.abs(carSpeed / (maxSpeed * 5.0)));
    let stabilityFactor = 1 - speedRatio * 0.5;
    turnFactor = turnFactor * stabilityFactor;
    
    let wheelTurnAngle = 0;

    if (activeControls.left && Math.abs(carSpeed) > 0.01) {
        car.rotation.y += turnSpeed * (turnFactor + 0.3);
        wheelTurnAngle = maxTurnAngle * turnFactor;
    }
    if (activeControls.right && Math.abs(carSpeed) > 0.01) {
        car.rotation.y -= turnSpeed * (turnFactor + 0.3);
        wheelTurnAngle = -maxTurnAngle * turnFactor;
    }

    if (car.userData.frontWheels) {
        car.userData.frontWheels.forEach(wheel => {
            wheel.rotation.set(
                wheel.rotation.x,
                wheelTurnAngle,
                Math.PI / 2
            );
        });
    }

    turnFactor = turnFactor * stabilityFactor;

    if (activeControls.left && Math.abs(carSpeed) > 0.01) {
        car.rotation.y += turnSpeed * (turnFactor + 0.3);
    }
    if (activeControls.right && Math.abs(carSpeed) > 0.01) {
        car.rotation.y -= turnSpeed * (turnFactor + 0.3);
    }

    if (activeControls.forward) carSpeed += acceleration;
    else if (activeControls.backward) carSpeed -= brakePower;
    else {
        const dynamicDeceleration = deceleration + speedRatio * 0.02;
        carSpeed *= (1 - dynamicDeceleration);
        if (Math.abs(carSpeed) < 0.01) carSpeed = 0;
    }
    carSpeed = Math.max(-maxSpeed / 1.5, Math.min(maxSpeed, carSpeed));

    const moveDirection = new THREE.Vector3(0, 0, 1);
    moveDirection.applyQuaternion(car.quaternion);
    const moveSpeed = carSpeed * delta * 46;

    // Colisão
    let collidedObject = null;
    if (Math.abs(moveSpeed) > 0.001) {
        const nextPosition = car.position.clone();
        nextPosition.addScaledVector(moveDirection, moveSpeed);
        collidedObject = checkCollisions(nextPosition);
    }

    // Atualização de posição
    if (collidedObject) {
        if (collidedObject.type === 'tree' || collidedObject.type === 'horse') {
            if (!collidedObject.isKnockedDown) {
                collidedObject.isKnockedDown = true;
                if (!objectsToAnimateKnockdown.includes(collidedObject)) {
                    objectsToAnimateKnockdown.push(collidedObject);
                }
                carSpeed *= 0.2;
            }
            car.position.addScaledVector(moveDirection, moveSpeed * 0.5);
        } else if (collidedObject.type === 'mountain') {
            carSpeed *= -0.3;
            if (Math.abs(carSpeed) < 0.1) carSpeed = 0;
        }
    } else {
        car.position.addScaledVector(moveDirection, moveSpeed);
    }

    // Câmera
    const cameraOffset = new THREE.Vector3(0, 5, -10);
    const cameraTarget = new THREE.Vector3();
    cameraOffset.applyQuaternion(car.quaternion);
    cameraTarget.copy(car.position).add(cameraOffset);

    const lerpFactor = Math.min(delta * 18.0, 1.0);
    camera.position.lerp(cameraTarget, lerpFactor);

    const lookAtTarget = new THREE.Vector3(0, 1, 4);
    lookAtTarget.applyQuaternion(car.quaternion);
    lookAtTarget.add(car.position);
    camera.lookAt(lookAtTarget);

    // Áudio
    if (audioReady && engineSoundSource) {
        const speedRatio = Math.min(1.0, Math.abs(carSpeed) / maxSpeed);
        let targetPlaybackRate = minPlaybackRate + (maxPlaybackRate - minPlaybackRate) * speedRatio;
        targetPlaybackRate = Math.max(minPlaybackRate, Math.min(maxPlaybackRate, targetPlaybackRate));

        engineSoundSource.playbackRate.setTargetAtTime(targetPlaybackRate, audioContext.currentTime, 0.05);

        let targetGain = 0.3 + speedRatio * 0.7;
        if (activeControls.forward && carSpeed < maxSpeed * 0.95) targetGain = Math.min(1.0, targetGain + 0.1);
        if (activeControls.backward && carSpeed > -maxSpeed / 2 * 0.9) targetGain = Math.min(1.0, targetGain + 0.05);
        gainNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.1);
    }

    // UI
    updateSpeedometer();
    updateMiniMap();
    animateKnockDown(delta);

    renderer.render(scene, camera);
}

// --- Redimensionamento da janela ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Inicialização ---
init();