export const MESSAGE_TYPES = {
    STEP: 'STEP',
    STEP_RESULT: 'STEP_RESULT',
    CREATE_CUBE: 'CREATE_CUBE',
    CUBE_LANDED: 'CUBE_LANDED',
};

export const FRAME_TIME = 1 / 60;
export const GRAVITY = 5;

export const PAUSE_RENDERING_DELAY = 8;

export const CANVAS_WIDTH = 300;
export const CANVAS_HEIGHT = 1000;

export const COLOUR_WHITE = 0xffffff;

export const CYLINDER_RADIUS = 1.8;
export const CYLINDER_SEGMENTS = 32;
export const MAX_CYLINDER_HEIGHT = 5.5;

export const VIEW_WIDTH = 2.1 * CYLINDER_RADIUS;
export const VIEW_TOP = VIEW_WIDTH * CANVAS_HEIGHT / CANVAS_WIDTH;
export const VIEW_BOTTOM = -0.7;

export const SHADOW_MAP_SIZE = 1024;

export const TARGET_MIN_CUBES = 130;
export const TARGET_MAX_CUBES = 350;
export const CUBE_START_POSITIONS = 8;
export const CUBE_SPLIT_PERIOD = 6;
export const SETTLE_DURATION = 0.5;
export const CUBE_OUTER_RADIUS = Math.sqrt(3) / 2;
export const SETTLE_SPEED_SQUARED_THRESHOLD = 0.1;
export const MIN_SINK_SPEED = 0.03;
export const MAX_SINK_SPEED = 0.09;

export const CONTAINER_HEIGHT = 12;
export const INITIAL_CYLINDER_HEIGHT = 0.3;

export const CUBE_TYPES = { LARGE: 2, SMALL: 1 };
export const CUBE_LARGE = 0.5;
export const CUBE_SMALL = CUBE_LARGE / 2;

export const WALL_HEIGHT = CONTAINER_HEIGHT * 1.5;

export const SCORE_UNIT = 25;

export const MAX_POINTS_DIFF = 1000;
export const CUBE_QUEUE_MAX = MAX_POINTS_DIFF / SCORE_UNIT;
export const MAX_USER_MESSAGES = 5;
export const MIN_USER_MESSAGE_DELAY = 200;
