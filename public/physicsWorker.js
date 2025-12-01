import RAPIER from '@dimforge/rapier3d';
import * as THREE from 'three';

import {
    MESSAGE_TYPES,
    FRAME_TIME,
    GRAVITY,
    CUBE_START_POSITIONS,
    CUBE_SPLIT_PERIOD,
    CUBE_OUTER_RADIUS,
    SETTLE_DURATION,
    SETTLE_SPEED_SQUARED_THRESHOLD,
    MIN_SINK_SPEED,
    MAX_SINK_SPEED,
    CYLINDER_RADIUS,
    CYLINDER_SEGMENTS,
    INITIAL_CYLINDER_HEIGHT,
    CONTAINER_HEIGHT,
    CUBE_TYPES,
    CUBE_LARGE,
    CUBE_SMALL,
    WALL_HEIGHT,
    TARGET_MIN_CUBES,
    TARGET_MAX_CUBES,
} from './constants';

const BINARY_POSITIONS = [-1, 1];
const SUB_CUBE_OFFSETS = [];
for (const x of BINARY_POSITIONS) {
    for (const y of BINARY_POSITIONS) {
        for (const z of BINARY_POSITIONS) {
            SUB_CUBE_OFFSETS.push(new THREE.Vector3(x, y, z).multiplyScalar(CUBE_SMALL / 2));
        }
    }
}

function getBoundingHeight(rotation, size) {
    const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    const halfSize = size / 2;

    const cornerHeights = [];
    for (const x of BINARY_POSITIONS) {
        for (const y of BINARY_POSITIONS) {
            for (const z of BINARY_POSITIONS) {
                cornerHeights.push(
                    new THREE.Vector3(x, y, z)
                    .multiplyScalar(halfSize)
                    .applyQuaternion(quaternion).y,
                );
            }
        }
    }

    return Math.max(...cornerHeights);
}

const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });

let eventQueue = new RAPIER.EventQueue(true);

function createCylinderDesc(height, radius, segments) {
    const vertices = [];
    const indices = [];

    // Create vertices for top and bottom of walls
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        vertices.push(x, height, z);
        vertices.push(x, 0, z);
    }

    // Create indices for the wall quads (as triangles)
    for (let i = 0; i < segments; i++) {
        const top1 = i * 2;
        const top2 = (i + 1) * 2;
        const bottom1 = i * 2 + 1;
        const bottom2 = (i + 1) * 2 + 1;

        indices.push(top1, bottom1, top2);
        indices.push(top2, bottom1, bottom2);
    }

    return RAPIER.ColliderDesc.trimesh(
        new Float32Array(vertices),
        new Uint32Array(indices),
    );
}

const wallColliderDesc = createCylinderDesc(WALL_HEIGHT, CYLINDER_RADIUS - 0.05, CYLINDER_SEGMENTS);
const wallCollider = world.createCollider(wallColliderDesc);

const cylinderColliderDesc = RAPIER.ColliderDesc.cylinder(
    INITIAL_CYLINDER_HEIGHT / 2,
    CYLINDER_RADIUS,
)
.setTranslation(0, -INITIAL_CYLINDER_HEIGHT / 2, 0);

world.createCollider(cylinderColliderDesc);

let targetCylinderHeight;
let cylinderHeight;
let cubeStartAngle = 0;
let cubesAdded = 0;

const cubes = new Map();

function createSubCube(parentCube, offset) {
    const position = parentCube.collider.translation();
    const rotation = parentCube.collider.rotation();

    // Rotate the offset vector by the parent cube's rotation quaternion
    const rotationQuaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    const rotatedOffset = offset.clone().applyQuaternion(rotationQuaternion);

    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(
        position.x + rotatedOffset.x,
        position.y + rotatedOffset.y,
        position.z + rotatedOffset.z,
    )
    .setRotation(rotation);

    const rigidBody = world.createRigidBody(rigidBodyDesc);
    rigidBody.setLinvel(parentCube.lastVelocity);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(
        CUBE_SMALL / 2,
        CUBE_SMALL / 2,
        CUBE_SMALL / 2,
    )
    .setDensity(1.0)
    .setRestitution(0.05)
    .setFriction(0.7);

    const data = {
        rigidBody,
        collider: world.createCollider(colliderDesc, rigidBody),
        type: CUBE_TYPES.SMALL,
        size: CUBE_SMALL,
        shouldSplit: false,
        canSplit: false,
        restTime: 0,
        isSinking: false,
        sinkingProgress: 0,
    };

    cubes.set(data.collider.handle, data);
    return data;
}

function splitCube(cube) {
    const subCubes = [];
    for (const offset of SUB_CUBE_OFFSETS) {
        subCubes.push(createSubCube(cube, offset));
    }

    world.removeRigidBody(cube.rigidBody);
    cubes.delete(cube.collider.handle);

    return subCubes.map(cube => cube.collider.handle);
}

function createCube() {
    cubeStartAngle = (cubeStartAngle + Math.PI * 2 / CUBE_START_POSITIONS) % (Math.PI * 2);
    const distance = CYLINDER_RADIUS - CUBE_LARGE * 2;

    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(
        Math.cos(cubeStartAngle) * distance,
        CONTAINER_HEIGHT,
        Math.sin(cubeStartAngle) * distance,
    );

    const rigidBody = world.createRigidBody(rigidBodyDesc);
    rigidBody.setAngvel({
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
        z: (Math.random() - 0.5) * 2,
    });
    rigidBody.setLinvel({
        x: 0,
        y: -2,
        z: 0,
    });

    const colliderDesc = RAPIER.ColliderDesc.cuboid(CUBE_LARGE / 2, CUBE_LARGE / 2, CUBE_LARGE / 2)
    .setDensity(1.0)
    .setRestitution(0.05)
    .setFriction(0.7)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    const collider = world.createCollider(colliderDesc, rigidBody);

    const data = {
        rigidBody,
        collider,
        type: CUBE_TYPES.LARGE,
        size: CUBE_LARGE,
        shouldSplit: false,
        canSplit: cubesAdded < CUBE_SPLIT_PERIOD - 1,
        restTime: 0,
        isSinking: false,
        sinkingProgress: 0,
    };

    cubes.set(data.collider.handle, data);
    cubesAdded = (cubesAdded + 1) % CUBE_SPLIT_PERIOD;
}

function stepPhysics() {
    const shouldSink = cubes.size > TARGET_MIN_CUBES;
    const sinkRate = Math.min(1, Math.max(0, cubes.size - TARGET_MIN_CUBES) / (TARGET_MAX_CUBES - TARGET_MIN_CUBES));
    const sinkSpeed = sinkRate * (MAX_SINK_SPEED - MIN_SINK_SPEED) + MIN_SINK_SPEED;

    for (const cube of cubes.values()) {
        if (cube.shouldSplit) {
            splitCube(cube);
            continue;
        }

        if (!cube.isSinking) {
            const cubeY = cube.collider.translation().y;
            const cubeBottom = cubeY - (cube.size * CUBE_OUTER_RADIUS);
            if (cubeBottom < 0) {
                const velocity = cube.rigidBody.linvel();
                const speedSquared = velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2;

                if (speedSquared < SETTLE_SPEED_SQUARED_THRESHOLD) {
                    cube.restTime += FRAME_TIME;
                } else {
                    cube.restTime = 0;
                }

                if (cube.restTime >= SETTLE_DURATION && !cube.isSinking) {
                    cube.isSinking = true;
                    cube.initialSinkPosition = cubeY;

                    cube.boundingHeight = getBoundingHeight(cube.collider.rotation(), cube.size) + 0.01;

                    cube.rigidBody.setLinvel({ x: 0, y: 0, z: 0 });
                    cube.rigidBody.setAngvel({ x: 0, y: 0, z: 0 });
                    cube.rigidBody.setBodyType(RAPIER.RigidBodyType.KinematicVelocityBased, true);
                }
            }
        }

        if (cube.isSinking) {
            const cubeY = cube.collider.translation().y;
            if (shouldSink) cube.rigidBody.wakeUp();
            cube.rigidBody.setLinvel({ x: 0, y: shouldSink ? -sinkSpeed : 0, z: 0 });

            const target = -cube.boundingHeight;
            cube.sinkingProgress = (
                (cube.initialSinkPosition - cubeY) / (cube.initialSinkPosition - target)
            );

            if (cube.sinkingProgress >= 1) {
                world.removeRigidBody(cube.rigidBody);
                cubes.delete(cube.collider.handle);
            }
        }
    }

    cylinderHeight = targetCylinderHeight;

    world.step(eventQueue);

    eventQueue.drainCollisionEvents((handle1, handle2) => {
        const cube1 = cubes.get(handle1);
        if (cube1 && handle2 !== wallCollider.handle) {
            cube1.collider.setActiveEvents(0);
            if (cube1.canSplit) cube1.shouldSplit = true;
            self.postMessage({ type: MESSAGE_TYPES.CUBE_LANDED });
        }
        const cube2 = cubes.get(handle2);
        if (cube2 && handle1 !== wallCollider.handle) {
            cube2.collider.setActiveEvents(0);
            if (cube2.canSplit) cube2.shouldSplit = true;
            self.postMessage({ type: MESSAGE_TYPES.CUBE_LANDED });
        }
    });

    for (const cube of cubes.values()) {
        if (cube.canSplit) cube.lastVelocity = cube.rigidBody.linvel();
    }

    const cubeArray = Array.from(cubes.values());
    const positions = new Float32Array(cubeArray.length * 3);
    const quaternions = new Float32Array(cubeArray.length * 4);
    const cubeIds = new Float64Array(cubeArray.length);
    const cubeTypes = new Uint8Array(cubeArray.length);

    for (let i = 0; i < cubeArray.length; i++) {
        const cube = cubeArray[i];
        const position = cube.rigidBody.translation();
        const quaternion = cube.rigidBody.rotation();

        positions[i * 3] = position.x;
        positions[i * 3 + 1] = position.y + cylinderHeight;
        positions[i * 3 + 2] = position.z;

        quaternions[i * 4] = quaternion.x;
        quaternions[i * 4 + 1] = quaternion.y;
        quaternions[i * 4 + 2] = quaternion.z;
        quaternions[i * 4 + 3] = quaternion.w;

        cubeIds[i] = cube.collider.handle;
        cubeTypes[i] = cube.type;
    }

    return {
        positions,
        quaternions,
        cubeIds,
        cubeTypes,
        cylinderHeight,
    };
}

self.addEventListener('message', ({ data }) => {
    if (data.type === MESSAGE_TYPES.STEP) {
        targetCylinderHeight = data.targetCylinderHeight;
        if (cylinderHeight === undefined) {
            cylinderHeight = targetCylinderHeight;
        }

        const result = stepPhysics();
        self.postMessage({ type: MESSAGE_TYPES.STEP_RESULT, ...result }, [
            result.positions.buffer,
            result.quaternions.buffer,
            result.cubeIds.buffer,
            result.cubeTypes.buffer,
        ]);
        return;
    }

    if (data.type === MESSAGE_TYPES.CREATE_CUBE) {
        createCube();
        return;
    }

    throw new Error(`Unexpected message type ${data.type}`);
});
