import * as THREE from 'three';
import { io } from 'socket.io-client';

import {
    MESSAGE_TYPES,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    COLOUR_WHITE,
    VIEW_WIDTH,
    VIEW_TOP,
    VIEW_BOTTOM,
    SHADOW_MAP_SIZE,
    CYLINDER_RADIUS,
    CYLINDER_SEGMENTS,
    MAX_CYLINDER_HEIGHT,
    INITIAL_CYLINDER_HEIGHT,
    CUBE_TYPES,
    CUBE_LARGE,
    CUBE_SMALL,
    SCORE_UNIT,
    CUBE_QUEUE_MAX,
} from './constants';

function seek(value, target, increment) {
    if (target > value) {
        return Math.min(value + increment, target);
    }
    if (target < value) {
        return Math.max(value - increment, target);
    }
    return value;
}

function withCommas(value) {
    return value >= 10000 ? Math.round(value).toLocaleString() : String(Math.round(value));
}

function round(value, decimalPlaces) {
    const multiplier = 10 ** decimalPlaces;
    return Math.round(value * (10 ** decimalPlaces)) / multiplier;
}

function getTeamProgress(currentPoints, lanProgress, maxPoints) {
    return Math.min(1, lanProgress * currentPoints / maxPoints);
}

function getCylinderHeight(progress) {
    return INITIAL_CYLINDER_HEIGHT + progress * MAX_CYLINDER_HEIGHT;
}

window.teamPoints = {};
window.syncing = new Set();

export function renderTeamScore(container) {
    const teamId = Number(container.dataset.teamId);
    const teamName = container.dataset.teamName;

    const syncingMessage = document.querySelector('[data-syncing]');

    const pointsMarker = container.querySelector('[data-points-marker]');
    pointsMarker.classList.remove('hidden');

    const pointsMarkerText = pointsMarker.querySelector('[data-text]');

    const userScores = pointsMarker.querySelector('[data-user-scores]');
    const useScoreTemplate = pointsMarker.querySelector('[data-user-score-template]');

    const colourPrimary = teamName === 'Red' ? 0xff0000 : 0x3344ff;
    const colourSecondary = teamName === 'Red' ? 0x0000ee : 0x990000;

    let actualLanProgress = Number(container.dataset.lanProgress);
    let targetLanProgress = actualLanProgress;

    let actualMaxPoints = Number(container.dataset.maxPoints) || 1;
    let targetMaxPoints = actualMaxPoints;

    let actualPoints = Number(container.dataset.teamPoints);
    let targetPoints = actualPoints;
    let currentPoints = actualPoints;

    let userQueue = [];

    let cubeQueue = 0;

    window.teamPoints[teamId] = currentPoints;

    // Compute this later because we have to wait for the other score to initialise
    setTimeout(() => {
        actualMaxPoints = Math.max(...Object.values(window.teamPoints));
    }, 0);

    const progress = getTeamProgress(actualPoints, actualLanProgress, actualMaxPoints)
    const cylinderHeight = getCylinderHeight(progress);
    pointsMarker.style.bottom = `${round(progress * (47 - 7.3) + 7.3, 2)}%`;

    const socket = io(window.location.origin);

    socket.on('SCORE_UPDATE', (data) => {
        const team = data.teams[teamId];
        actualMaxPoints = data.maxPoints;
        actualLanProgress = data.lanProgress;
        actualPoints = team.points;

        if (cubeQueue === 0 && window.syncing.size === 0) {
            const diff = actualPoints - targetPoints;
            if (diff !== 0) {
                if (diff > 0 && diff <= 500) {
                    cubeQueue = Math.min(cubeQueue + Math.ceil(diff / SCORE_UNIT), CUBE_QUEUE_MAX);
                } else {
                    if (!window.syncing.has(teamId)) {
                        window.syncing.add(teamId);
                        syncingMessage.classList.remove('hidden');
                    }
                    targetPoints = actualPoints;
                }
            }
        }
    });

    socket.on('NEW_SCORES', (scores) => {
        const teamScores = scores.filter((score) => score.teamId === teamId);
        if (teamScores.length > 0) {
            let totalPoints = teamScores.reduce((sum, score) => sum + score.points, 0);
            cubeQueue = Math.min(cubeQueue + Math.ceil(totalPoints / SCORE_UNIT), CUBE_QUEUE_MAX);
            actualPoints += totalPoints;
        }
        console.log(teamScores);
        userQueue = userQueue.concat(teamScores.filter((score) => score.username));
    });

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.OrthographicCamera(
        -VIEW_WIDTH / 2, VIEW_WIDTH / 2, VIEW_TOP, VIEW_BOTTOM, 0.1, 1000,
    );
    camera.position.set(0, 3, 10);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);

    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = 'auto';

    const ambientLight = new THREE.AmbientLight(colourPrimary, 0.8);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(colourPrimary, 1);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = SHADOW_MAP_SIZE;
    directionalLight.shadow.mapSize.height = SHADOW_MAP_SIZE;
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(colourSecondary, 0.5);
    directionalLight2.position.set(5, 5, -5);
    scene.add(directionalLight2);

    const material = new THREE.MeshStandardMaterial({
        color: COLOUR_WHITE,
        metalness: 0.1,
        roughness: 0.9,
        flatShading: true,
    });

    const cylinderMaterial = new THREE.MeshStandardMaterial({
        color: COLOUR_WHITE,
        metalness: 0.1,
        roughness: 0.9,
    });

    const cubeGeometry = new THREE.BoxGeometry(CUBE_LARGE, CUBE_LARGE, CUBE_LARGE);
    const subCubeGeometry = new THREE.BoxGeometry(CUBE_SMALL, CUBE_SMALL, CUBE_SMALL);

    const cylinderGeometry = new THREE.CylinderGeometry(
        CYLINDER_RADIUS,
        CYLINDER_RADIUS,
        INITIAL_CYLINDER_HEIGHT,
        CYLINDER_SEGMENTS,
    );
    const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
    cylinder.position.y = INITIAL_CYLINDER_HEIGHT / 2;
    cylinder.receiveShadow = true;
    cylinder.scale.y = cylinderHeight / INITIAL_CYLINDER_HEIGHT;
    cylinder.position.y = cylinderHeight / 2;

    scene.add(cylinder);

    const worker = new Worker('./physicsWorker.js', { type: 'module' });

    const cubeMeshes = new Map();

    function createCubeMesh(cubeId, cubeType) {
        const mesh = new THREE.Mesh(cubeType === CUBE_TYPES.LARGE ? cubeGeometry : subCubeGeometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);

        cubeMeshes.set(cubeId, mesh);
    }

    function removeCubeMesh(cubeId) {
        const mesh = cubeMeshes.get(cubeId);
        if (mesh) {
            scene.remove(mesh);
            cubeMeshes.delete(cubeId);
        }
    }

    worker.addEventListener('message', ({ data }) => {
        if (data.type === MESSAGE_TYPES.CUBE_LANDED) {
            targetPoints = Math.min(targetPoints + SCORE_UNIT, actualPoints);

            const user = userQueue.shift();
            if (user) {
                for (const userScore of userScores.children) {
                    userScore.style.top = (parseInt(userScore.style.top) + 30) + 'px';
                }

                const newUserScore = useScoreTemplate.cloneNode();
                newUserScore.classList.remove('hidden');
                newUserScore.textContent = `${user.username} +${user.points}`;
                newUserScore.style.opacity = 0;
                newUserScore.style.top = 0;
                userScores.prepend(newUserScore);
                setTimeout(() => {
                    newUserScore.style.opacity = 1;
                }, 20);

                setTimeout(() => {
                    newUserScore.style.opacity = 0;
                    setTimeout(() => newUserScore.remove(), 500);
                }, 20 * 1000);

                console.log(userScores.children.length > 6);
                if (userScores.children.length > 6) {
                    const last = userScores.children[userScores.children.length - 2];
                    last.style.opacity = 0;
                    setTimeout(() => last.remove(), 500);
                }
            }
            return;
        }

        if (data.type === MESSAGE_TYPES.STEP_RESULT) {
            const { positions, quaternions, cubeIds, cubeTypes, cylinderHeight } = data;

            // Add new cubes
            for (let i = 0; i < cubeIds.length; i++) {
                const cubeId = cubeIds[i];
                if (!cubeMeshes.has(cubeId)) {
                    createCubeMesh(cubeId, cubeTypes[i]);
                }
            }

            // Remove dead cubes
            const currentCubeIds = new Set(cubeIds);
            for (const cubeId of cubeMeshes.keys()) {
                if (!currentCubeIds.has(cubeId)) {
                    removeCubeMesh(cubeId);
                }
            }

            // Update positions and rotations for all existing cubes
            for (let i = 0; i < cubeIds.length; i++) {
                const cubeId = cubeIds[i];
                const mesh = cubeMeshes.get(cubeId);
                if (!mesh) continue;

                const positionIndex = i * 3;
                mesh.position.set(
                    positions[positionIndex],
                    positions[positionIndex + 1],
                    positions[positionIndex + 2]
                );

                const quaternionIndex = i * 4;
                mesh.quaternion.set(
                    quaternions[quaternionIndex],
                    quaternions[quaternionIndex + 1],
                    quaternions[quaternionIndex + 2],
                    quaternions[quaternionIndex + 3]
                );
            }

            cylinder.scale.y = cylinderHeight / INITIAL_CYLINDER_HEIGHT;
            cylinder.position.y = cylinderHeight / 2;
            return;
        }

        throw new Error(`Unexpected message type ${data.type}`);
    });

    let queueFrameCount = 0;

    function animate() {
        requestAnimationFrame(animate);

        const anySyncing = window.syncing.size > 0;
        const multiplier = actualMaxPoints / 300;

        if (!anySyncing && queueFrameCount === 0) {
            if (cubeQueue > 0) {
                worker.postMessage({ type: MESSAGE_TYPES.CREATE_CUBE });
                cubeQueue--;
            }
        }
        queueFrameCount = (queueFrameCount + 1) % 15;

        let updated = false;
        if (currentPoints !== targetPoints) {
            currentPoints = seek(currentPoints, targetPoints, anySyncing ? multiplier : 1.25);
            updated = true;
        }
        window.teamPoints[teamId] = currentPoints;

        actualMaxPoints = Math.max(...Object.values(window.teamPoints));

        if (actualMaxPoints !== targetMaxPoints) {
            targetMaxPoints = seek(targetMaxPoints, actualMaxPoints, anySyncing ? multiplier : 0.02);
            updated = true;
        }

        if (actualLanProgress !== targetLanProgress) {
            targetLanProgress = seek(targetLanProgress, actualLanProgress, anySyncing ? multiplier / 1000 : 0.00001);
            updated = true;
        }

        if (
            window.syncing.has(teamId) &&
            actualMaxPoints === targetMaxPoints &&
            currentPoints === targetPoints &&
            actualLanProgress === targetLanProgress
        ) {
            window.syncing.delete(teamId);
            if (window.syncing.size === 0) {
                syncingMessage.classList.add('hidden');
            }
        }

        const progress = getTeamProgress(currentPoints, targetLanProgress, targetMaxPoints);

        if (updated) {
            pointsMarker.style.bottom = `${round(progress * (47 - 7.3) + 7.3, 2)}%`;
            pointsMarkerText.textContent = withCommas(currentPoints);
        }

        const targetCylinderHeight = getCylinderHeight(progress);
        worker.postMessage({ type: MESSAGE_TYPES.STEP, targetCylinderHeight });
        renderer.render(scene, camera);
    }

    // container.addEventListener('click', () => {
    //     cubeQueue = Math.min(cubeQueue + 1, CUBE_QUEUE_MAX);
    //     actualPoints += 25;
    // });

    renderer.render(scene, camera);

    setTimeout(() => {
        animate();
    }, 500);
}
