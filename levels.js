// 4 Complete Reachable Mario Arcade Worlds

export const GROUND_Y = 500;
export const TOTAL_LEVELS = 4;

export function getLevelConfig(levelNum) {
  const tier1_y = GROUND_Y - 96;
  const tier2_y = GROUND_Y - 180;
  const tier3_y = GROUND_Y - 260;

  let levelEndX = 3600;
  let checkpointX = 1820;
  let groundSections = [];
  let pipes = [];
  let brickCoords = [];
  let qCoords = [];
  let movingPlatforms = [];
  let springs = [];
  let stairs = [];
  let coinCoords = [];
  let goombas = [];
  let hills = [];
  let bushes = [];
  let clouds = [];

  if (levelNum === 1) {
    // WORLD 1-1: Classic Overworld
    levelEndX = 3600;
    checkpointX = 1820;
    groundSections = [
      { x: 0, y: GROUND_Y, w: 1320, h: 100 },
      { x: 1388, y: GROUND_Y, w: 1080, h: 100 },
      { x: 2536, y: GROUND_Y, w: 1250, h: 100 }
    ];
    pipes = [
      { x: 460, y: GROUND_Y - 56, w: 56, h: 56 },
      { x: 760, y: GROUND_Y - 72, w: 56, h: 72 },
      { x: 1080, y: GROUND_Y - 84, w: 56, h: 84 },
      { x: 1980, y: GROUND_Y - 64, w: 56, h: 64 },
      { x: 2760, y: GROUND_Y - 72, w: 56, h: 72 }
    ];
    brickCoords = [
      [260, tier1_y], [324, tier1_y], [388, tier1_y],
      [880, tier1_y], [912, tier1_y], [944, tier1_y],
      [1520, tier1_y], [1584, tier1_y], [1616, tier1_y],
      [1648, tier2_y], [1680, tier2_y], [1712, tier2_y],
      [2140, tier1_y], [2204, tier1_y], [2268, tier1_y],
      [2204, tier2_y], [2236, tier2_y],
      [2920, tier1_y], [2984, tier1_y], [3016, tier1_y]
    ];
    qCoords = [
      [196, tier1_y], [292, tier1_y], [356, tier1_y], [324, tier2_y],
      [912, tier2_y], [1552, tier1_y], [1680, tier1_y],
      [2172, tier1_y], [2236, tier1_y], [2952, tier1_y], [2984, tier2_y]
    ];
    movingPlatforms = [
      { x: 1328, y: GROUND_Y - 40, w: 56, h: 16, vx: 0.0, vy: -1.2, min_x: 1328, max_x: 1328, min_y: GROUND_Y - 120, max_y: GROUND_Y - 24 },
      { x: 2472, y: GROUND_Y - 48, w: 56, h: 16, vx: 1.4, vy: 0.0, min_x: 2448, max_x: 2520, min_y: GROUND_Y - 48, max_y: GROUND_Y - 48 }
    ];
    springs = [
      { x: 1220, y: GROUND_Y - 28, w: 28, h: 28 },
      { x: 2660, y: GROUND_Y - 28, w: 28, h: 28 }
    ];
    stairs = Array.from({ length: 6 }, (_, s) => ({
      x: 3180 + s * 32,
      y: GROUND_Y - (s + 1) * 28,
      w: 32,
      h: (s + 1) * 28
    }));
    coinCoords = [
      [203, tier1_y - 40], [299, tier1_y - 40], [363, tier1_y - 40], [331, tier2_y - 40],
      [480, GROUND_Y - 96], [780, GROUND_Y - 112], [919, tier2_y - 40],
      [1225, tier2_y - 30], [1655, tier2_y - 40], [1687, tier2_y - 40], [1719, tier2_y - 40],
      [2000, GROUND_Y - 104], [2211, tier2_y - 40], [2243, tier2_y - 40],
      [2780, GROUND_Y - 112], [2959, tier1_y - 40], [2991, tier2_y - 40]
    ];
    goombas = [
      { x: 400, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.2, min_x: 180, max_x: 445, state: "walk", timer: 0 },
      { x: 680, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.2, min_x: 530, max_x: 745, state: "walk", timer: 0 },
      { x: 990, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.2, min_x: 830, max_x: 1065, state: "walk", timer: 0 },
      { x: 1760, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.3, min_x: 1440, max_x: 1950, state: "walk", timer: 0 },
      { x: 2320, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.3, min_x: 2050, max_x: 2440, state: "walk", timer: 0 },
      { x: 3060, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.4, min_x: 2830, max_x: 3150, state: "walk", timer: 0 }
    ];
    hills = [[40, 160, 80], [580, 110, 56], [1160, 160, 80], [1780, 120, 60], [2340, 150, 75], [2980, 140, 70]];
    bushes = [[220, 96], [660, 72], [1260, 96], [1860, 72], [2240, 96], [2860, 84]];
    clouds = [[100, 70, 96], [380, 52, 72], [720, 78, 112], [1120, 58, 88], [1560, 70, 96], [2040, 56, 84], [2500, 68, 96], [3050, 58, 92]];

  } else if (levelNum === 2) {
    // WORLD 1-2: Underground Blue-Brick Caverns
    levelEndX = 3700;
    checkpointX = 1860;
    groundSections = [
      { x: 0, y: GROUND_Y, w: 1180, h: 100 },
      { x: 1260, y: GROUND_Y, w: 1060, h: 100 },
      { x: 2400, y: GROUND_Y, w: 1450, h: 100 }
    ];
    pipes = [
      { x: 520, y: GROUND_Y - 64, w: 56, h: 64 },
      { x: 980, y: GROUND_Y - 80, w: 56, h: 80 },
      { x: 1680, y: GROUND_Y - 72, w: 56, h: 72 },
      { x: 2620, y: GROUND_Y - 64, w: 56, h: 64 }
    ];
    brickCoords = [
      [240, tier1_y], [272, tier1_y], [304, tier1_y],
      [368, tier2_y], [400, tier2_y], [432, tier2_y],
      [700, tier1_y], [732, tier1_y], [764, tier1_y],
      [1360, tier1_y], [1392, tier1_y], [1424, tier1_y],
      [1456, tier2_y], [1488, tier2_y], [1520, tier2_y],
      [1920, tier1_y], [1952, tier1_y], [1984, tier1_y],
      [2016, tier2_y], [2048, tier2_y],
      [2780, tier1_y], [2812, tier1_y], [2876, tier1_y], [2908, tier2_y]
    ];
    qCoords = [
      [208, tier1_y], [336, tier1_y], [400, tier1_y],
      [732, tier2_y], [1392, tier2_y], [1952, tier2_y],
      [2480, tier1_y], [2844, tier1_y], [2876, tier2_y]
    ];
    movingPlatforms = [
      { x: 1188, y: GROUND_Y - 60, w: 64, h: 16, vx: 0.0, vy: -1.4, min_x: 1188, max_x: 1188, min_y: tier2_y, max_y: GROUND_Y - 20 },
      { x: 2328, y: GROUND_Y - 70, w: 64, h: 16, vx: 0.0, vy: 1.4, min_x: 2328, max_x: 2328, min_y: tier2_y, max_y: GROUND_Y - 20 }
    ];
    springs = [
      { x: 880, y: GROUND_Y - 28, w: 28, h: 28 },
      { x: 2160, y: GROUND_Y - 28, w: 28, h: 28 }
    ];
    stairs = Array.from({ length: 6 }, (_, s) => ({
      x: 3260 + s * 32,
      y: GROUND_Y - (s + 1) * 28,
      w: 32,
      h: (s + 1) * 28
    }));
    coinCoords = [
      [248, tier1_y - 40], [280, tier1_y - 40], [376, tier2_y - 40], [408, tier2_y - 40],
      [540, GROUND_Y - 104], [739, tier2_y - 40], [1000, GROUND_Y - 118],
      [1464, tier2_y - 40], [1496, tier2_y - 40], [1528, tier2_y - 40],
      [1700, GROUND_Y - 110], [1959, tier2_y - 40], [2024, tier2_y - 40],
      [2640, GROUND_Y - 104], [2851, tier1_y - 40], [2883, tier2_y - 40]
    ];
    goombas = [
      { x: 430, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.3, min_x: 180, max_x: 500, state: "walk", timer: 0 },
      { x: 820, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.3, min_x: 590, max_x: 960, state: "walk", timer: 0 },
      { x: 1560, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.4, min_x: 1280, max_x: 1660, state: "walk", timer: 0 },
      { x: 2040, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.4, min_x: 1750, max_x: 2280, state: "walk", timer: 0 },
      { x: 3020, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.5, min_x: 2700, max_x: 3220, state: "walk", timer: 0 }
    ];
    hills = [];
    bushes = [];
    clouds = [];

  } else if (levelNum === 3) {
    // WORLD 1-3: Athletic Sky Treetops
    levelEndX = 3700;
    checkpointX = 1820;
    groundSections = [
      { x: 0, y: GROUND_Y, w: 920, h: 100 },
      { x: 1020, y: GROUND_Y, w: 740, h: 100 },
      { x: 1860, y: GROUND_Y, w: 760, h: 100 },
      { x: 2720, y: GROUND_Y, w: 1150, h: 100 }
    ];
    pipes = [
      { x: 440, y: GROUND_Y - 64, w: 56, h: 64 },
      { x: 1420, y: GROUND_Y - 72, w: 56, h: 72 },
      { x: 2280, y: GROUND_Y - 64, w: 56, h: 64 }
    ];
    brickCoords = [
      [220, tier1_y], [252, tier1_y], [284, tier1_y],
      [580, tier2_y], [612, tier2_y], [644, tier2_y], [676, tier2_y],
      [1160, tier1_y], [1192, tier1_y], [1224, tier1_y],
      [1256, tier2_y], [1288, tier2_y], [1320, tier2_y],
      [1980, tier1_y], [2012, tier1_y], [2044, tier1_y],
      [2076, tier2_y], [2108, tier2_y], [2140, tier3_y], [2172, tier3_y],
      [2880, tier1_y], [2912, tier1_y], [2944, tier2_y], [2976, tier2_y]
    ];
    qCoords = [
      [252, tier2_y], [612, tier1_y], [1192, tier2_y],
      [1600, tier1_y], [2012, tier2_y], [2140, tier2_y],
      [2912, tier2_y], [3040, tier1_y]
    ];
    movingPlatforms = [
      { x: 928, y: GROUND_Y - 44, w: 84, h: 16, vx: 1.3, vy: 0.0, min_x: 916, max_x: 1016, min_y: GROUND_Y - 44, max_y: GROUND_Y - 44 },
      { x: 1768, y: GROUND_Y - 52, w: 84, h: 16, vx: 1.5, vy: 0.0, min_x: 1756, max_x: 1856, min_y: GROUND_Y - 52, max_y: GROUND_Y - 52 },
      { x: 2628, y: GROUND_Y - 60, w: 84, h: 16, vx: 0.0, vy: -1.5, min_x: 2628, max_x: 2628, min_y: tier2_y, max_y: GROUND_Y - 24 }
    ];
    springs = [
      { x: 520, y: GROUND_Y - 28, w: 28, h: 28 },
      { x: 1520, y: GROUND_Y - 28, w: 28, h: 28 },
      { x: 2420, y: GROUND_Y - 28, w: 28, h: 28 }
    ];
    stairs = Array.from({ length: 6 }, (_, s) => ({
      x: 3260 + s * 32,
      y: GROUND_Y - (s + 1) * 28,
      w: 32,
      h: (s + 1) * 28
    }));
    coinCoords = [
      [259, tier2_y - 40], [588, tier2_y - 40], [620, tier2_y - 40], [652, tier2_y - 40],
      [955, GROUND_Y - 90], [1264, tier2_y - 40], [1296, tier2_y - 40],
      [1795, GROUND_Y - 96], [2148, tier3_y - 40], [2180, tier3_y - 40],
      [2655, tier2_y - 40], [2952, tier2_y - 40], [2984, tier2_y - 40]
    ];
    goombas = [
      { x: 360, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.3, min_x: 160, max_x: 420, state: "walk", timer: 0 },
      { x: 780, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.4, min_x: 560, max_x: 890, state: "walk", timer: 0 },
      { x: 1320, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.4, min_x: 1060, max_x: 1400, state: "walk", timer: 0 },
      { x: 2160, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.5, min_x: 1900, max_x: 2260, state: "walk", timer: 0 },
      { x: 3100, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.5, min_x: 2760, max_x: 3220, state: "walk", timer: 0 }
    ];
    hills = [[60, 140, 70], [1100, 150, 75], [1950, 140, 70], [2820, 150, 75]];
    bushes = [[280, 96], [1240, 84], [2080, 96], [2960, 84]];
    clouds = [[80, 60, 110], [320, 48, 88], [620, 64, 112], [960, 50, 96], [1340, 62, 108], [1720, 48, 92], [2120, 60, 110], [2560, 52, 96], [3020, 60, 108]];

  } else {
    // WORLD 1-4: Bowser's Stone Fortress with Lava Pits
    levelEndX = 3800;
    checkpointX = 1880;
    groundSections = [
      { x: 0, y: GROUND_Y, w: 1040, h: 100 },
      { x: 1140, y: GROUND_Y, w: 820, h: 100 },
      { x: 2060, y: GROUND_Y, w: 820, h: 100 },
      { x: 2980, y: GROUND_Y, w: 1000, h: 100 }
    ];
    pipes = [
      { x: 500, y: GROUND_Y - 64, w: 56, h: 64 },
      { x: 1540, y: GROUND_Y - 72, w: 56, h: 72 },
      { x: 2520, y: GROUND_Y - 64, w: 56, h: 64 }
    ];
    brickCoords = [
      [240, tier1_y], [272, tier1_y], [304, tier1_y], [336, tier1_y],
      [660, tier1_y], [692, tier1_y], [724, tier2_y], [756, tier2_y],
      [1260, tier1_y], [1292, tier1_y], [1324, tier2_y], [1356, tier2_y],
      [1680, tier1_y], [1712, tier1_y], [1744, tier1_y],
      [2200, tier1_y], [2232, tier1_y], [2264, tier2_y], [2296, tier2_y],
      [2660, tier1_y], [2692, tier1_y], [2724, tier2_y],
      [3100, tier1_y], [3132, tier1_y], [3164, tier2_y]
    ];
    qCoords = [
      [272, tier2_y], [692, tier2_y], [1292, tier2_y],
      [1712, tier2_y], [2232, tier2_y], [2692, tier2_y], [3132, tier2_y]
    ];
    movingPlatforms = [
      { x: 1048, y: GROUND_Y - 40, w: 84, h: 16, vx: 1.4, vy: 0.0, min_x: 1036, max_x: 1136, min_y: GROUND_Y - 40, max_y: GROUND_Y - 40 },
      { x: 1968, y: GROUND_Y - 48, w: 84, h: 16, vx: 1.5, vy: 0.0, min_x: 1956, max_x: 2056, min_y: GROUND_Y - 48, max_y: GROUND_Y - 48 },
      { x: 2888, y: GROUND_Y - 48, w: 84, h: 16, vx: 1.6, vy: 0.0, min_x: 2876, max_x: 2976, min_y: GROUND_Y - 48, max_y: GROUND_Y - 48 }
    ];
    springs = [
      { x: 860, y: GROUND_Y - 28, w: 28, h: 28 },
      { x: 1820, y: GROUND_Y - 28, w: 28, h: 28 },
      { x: 2780, y: GROUND_Y - 28, w: 28, h: 28 }
    ];
    stairs = Array.from({ length: 6 }, (_, s) => ({
      x: 3340 + s * 32,
      y: GROUND_Y - (s + 1) * 28,
      w: 32,
      h: (s + 1) * 28
    }));
    coinCoords = [
      [280, tier2_y - 40], [732, tier2_y - 40], [764, tier2_y - 40],
      [1075, GROUND_Y - 90], [1332, tier2_y - 40], [1364, tier2_y - 40],
      [1995, GROUND_Y - 96], [2272, tier2_y - 40], [2304, tier2_y - 40],
      [2915, GROUND_Y - 96], [3172, tier2_y - 40]
    ];
    goombas = [
      { x: 420, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.4, min_x: 160, max_x: 480, state: "walk", timer: 0 },
      { x: 800, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.5, min_x: 570, max_x: 980, state: "walk", timer: 0 },
      { x: 1460, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.5, min_x: 1180, max_x: 1520, state: "walk", timer: 0 },
      { x: 2420, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.6, min_x: 2100, max_x: 2500, state: "walk", timer: 0 },
      { x: 3220, y: GROUND_Y - 32, w: 32, h: 32, vx: -1.6, min_x: 3010, max_x: 3310, state: "walk", timer: 0 }
    ];
    hills = [];
    bushes = [];
    clouds = [];
  }

  const bricks = brickCoords.map(([x, y]) => ({ x, y, w: 32, h: 32 }));
  const qBlocks = qCoords.map(([x, y]) => ({ x, y, w: 32, h: 32, used: false, bounce: 0 }));
  const coins = coinCoords.map(([x, y]) => ({ x, y, w: 18, h: 24 }));

  return {
    levelEndX,
    checkpointX,
    groundSections,
    pipes,
    bricks,
    qBlocks,
    movingPlatforms,
    springs,
    stairs,
    coins,
    goombas,
    hills,
    bushes,
    clouds
  };
}

