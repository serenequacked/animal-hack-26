import { Map, Play, RotateCcw, Shield } from "lucide-react";
import { useCallback, useRef, useState, useEffect } from "react";

type EntityKind = "net" | "bag" | "boat" | "oil" | "hook" | "cleanup" | "reef";
type GameState = "ready" | "playing" | "ended";
type RouteKey = "reef" | "shipping" | "fishing";
type TrashKind = "net" | "bag" | "oil" | "hook";
type AnimalKey = "turtle" | "vaquita" | "whaleShark";

type Entity = {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  bob: number;
};

type FloatingText = {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
  life: number;
};

type Lesson = {
  title: string;
  body: string;
  action: string;
};

type RunSummary = {
  distance: number;
  lessons: string[];
  hardestThreat: string;
};

type Keys = {
  jump: boolean;
};

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 540;
const TURTLE_SIZE = 46;
const MAX_HEALTH = 100;
const GRAVITY = 0.34;
const JUMP_FORCE = -7.8;
const MAX_FALL_SPEED = 7.4;

const lessons: Record<EntityKind, Lesson> = {
  net: {
    title: "Entangled in a drift net",
    body: "Lost or abandoned fishing nets can keep trapping turtles, dolphins, and fish for years.",
    action: "Solution: support net retrieval programs and wildlife-safe fishing gear."
  },
  bag: {
    title: "Mistook plastic for food",
    body: "Floating plastic bags can look like jellyfish, a normal food source for sea turtles.",
    action: "Solution: reduce single-use plastics and join beach or river cleanups."
  },
  boat: {
    title: "Hit by boat traffic",
    body: "Fast boats in coastal habitats can injure turtles when they surface to breathe.",
    action: "Solution: slow-speed zones and marked turtle habitats reduce collisions."
  },
  oil: {
    title: "Crossed an oil slick",
    body: "Oil can poison food chains, irritate animals, and damage nesting beaches.",
    action: "Solution: safer shipping, spill response, and cleaner energy lower the risk."
  },
  hook: {
    title: "Caught by fishing line",
    body: "Hooks and discarded line can stop turtles from feeding or swimming normally.",
    action: "Solution: use circle hooks, collect discarded line, and report injured wildlife."
  },
  cleanup: {
    title: "Beach cleanup helped",
    body: "Removing plastic before it reaches the ocean protects turtles and many other animals.",
    action: "Player impact: this is a human action that makes the habitat safer."
  },
  reef: {
    title: "Reached a protected reef",
    body: "Healthy reefs provide food, shelter, and resting areas during long migrations.",
    action: "Player impact: protected marine areas give wildlife safe places to recover."
  }
};

const entityMeta: Record<EntityKind, { label: string; danger: number; points: number }> = {
  net: { label: "Drift Net", danger: 34, points: 18 },
  bag: { label: "Plastic Bag", danger: 14, points: 10 },
  boat: { label: "Boat Wake", danger: 22, points: 16 },
  oil: { label: "Oil Slick", danger: 18, points: 14 },
  hook: { label: "Fishing Hook", danger: 20, points: 15 },
  cleanup: { label: "Beach Cleanup", danger: -15, points: 22 },
  reef: { label: "Reef Sanctuary", danger: -25, points: 30 }
};

const routes: Record<RouteKey, { label: string; description: string; risk: string; threatBias: EntityKind[]; scoreRate: number }> = {
  reef: {
    label: "Protected Reef Route",
    description: "Safer habitat with more recovery zones, but the migration takes longer.",
    risk: "Lower threat density, lower score growth",
    threatBias: ["bag", "oil", "hook", "cleanup", "reef"],
    scoreRate: 0.05
  },
  shipping: {
    label: "Busy Shipping Route",
    description: "Faster currents near ports, with more boats, oil slicks, and plastic waste.",
    risk: "Higher score growth, more human traffic",
    threatBias: ["boat", "boat", "oil", "bag", "cleanup", "reef"],
    scoreRate: 0.07
  },
  fishing: {
    label: "Fishing Ground Route",
    description: "Food-rich waters, but fishing gear creates a serious entanglement risk.",
    risk: "More nets and hooks, more learning moments",
    threatBias: ["net", "net", "hook", "hook", "bag", "cleanup", "reef"],
    scoreRate: 0.065
  }
};

const animals: Record<AnimalKey, { species: string; status: string; habitat: string; mission: string; color: string; accent: string }> = {
  turtle: {
    species: "Hawksbill Sea Turtle",
    status: "Critically Endangered",
    habitat: "Warm coral reefs and coastal waters",
    mission: "Survive the migration tide and reach a protected reef.",
    color: "#70c27a",
    accent: "#1e5d4f"
  },
  vaquita: {
    species: "Vaquita",
    status: "Critically Endangered",
    habitat: "Northern Gulf of California",
    mission: "Avoid fishing gear and survive through a shrinking safe habitat.",
    color: "#b9d6df",
    accent: "#596d75"
  },
  whaleShark: {
    species: "Whale Shark",
    status: "Endangered",
    habitat: "Warm tropical oceans",
    mission: "Migrate through polluted waters while avoiding boats and discarded gear.",
    color: "#6fa9c6",
    accent: "#244c68"
  }
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pollutionLevel(score: number) {
  return clamp(Math.floor(score / 10), 0, 100);
}

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function weightedChoice<T>(items: Array<{ item: T; weight: number }>) {
  const total = items.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;

  for (const entry of items) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.item;
    }
  }

  return items[items.length - 1].item;
}

function randomEntity(id: number, score: number, route: RouteKey): Entity {
  const roll = Math.random();
  const routeData = routes[route];
  const pollution = pollutionLevel(score);
  const trash: TrashKind[] = ["net", "bag", "oil", "hook"];
  const routeThreat = routeData.threatBias.filter((kind) => !["cleanup", "reef"].includes(kind));
  const risingTrash = trash[Math.floor(Math.random() * trash.length)];
  const kind: EntityKind =
    roll > 0.94
      ? "reef"
      : roll > 0.84
        ? "cleanup"
        : weightedChoice([
            { item: routeThreat[Math.floor(Math.random() * routeThreat.length)] ?? "bag", weight: 100 - pollution * 0.55 },
            { item: risingTrash, weight: 18 + pollution * 1.35 },
            { item: "bag", weight: 10 + pollution * 0.8 },
            { item: "net", weight: route === "fishing" ? 16 + pollution * 0.9 : 6 + pollution * 0.45 }
          ]);
  const baseSpeed = 1.45 + Math.min(score / 520, 4.2);
  const dimensions: Record<EntityKind, [number, number]> = {
    net: [136, 92],
    bag: [36, 42],
    boat: [92, 44],
    oil: [88, 34],
    hook: [42, 48],
    cleanup: [54, 42],
    reef: [66, 56]
  };
  const [width, height] = dimensions[kind];

  return {
    id,
    kind,
    x: CANVAS_WIDTH + 80,
    y: 56 + Math.random() * (CANVAS_HEIGHT - 132),
    width,
    height,
    speed: baseSpeed + Math.random() * 0.8,
    bob: Math.random() * Math.PI * 2
  };
}

function drawPixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = "#e8fcff") {
  ctx.save();
  ctx.font = "700 14px 'Courier New', monospace";
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawAnimal(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number, animal: AnimalKey) {
  if (animal !== "turtle") {
    const template = animals[animal];
    ctx.save();
    ctx.translate(x, y);
    const tail = Math.sin(tick / 8) * 4;
    ctx.fillStyle = template.accent;
    ctx.fillRect(4, 22 + tail, 14, 10);
    ctx.fillStyle = template.color;
    ctx.fillRect(14, 15, 34, 24);
    ctx.fillRect(42, 20, 13, 14);
    ctx.fillStyle = "#e8fcff";
    ctx.fillRect(26, 20, 4, 4);
    ctx.fillRect(36, 28, 4, 4);
    ctx.fillStyle = template.accent;
    ctx.fillRect(20, 10, 18, 7);
    ctx.fillRect(22, 39, 18, 7);
    ctx.fillStyle = "#062931";
    ctx.fillRect(50, 24, 3, 3);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(x, y);
  const paddle = Math.sin(tick / 9) * 4;

  ctx.fillStyle = "#2f8f74";
  ctx.fillRect(12, 18 + paddle, 10, 8);
  ctx.fillRect(12, 34 - paddle, 10, 8);
  ctx.fillRect(35, 18 - paddle, 10, 8);
  ctx.fillRect(35, 34 + paddle, 10, 8);

  ctx.fillStyle = "#70c27a";
  ctx.fillRect(14, 14, 28, 32);
  ctx.fillStyle = "#1e5d4f";
  ctx.fillRect(18, 18, 20, 24);
  ctx.fillStyle = "#9bdc7d";
  ctx.fillRect(22, 20, 6, 7);
  ctx.fillRect(30, 29, 6, 7);

  ctx.fillStyle = "#74c87d";
  ctx.fillRect(39, 24, 13, 12);
  ctx.fillStyle = "#062931";
  ctx.fillRect(48, 27, 3, 3);
  ctx.fillStyle = "#d8b76b";
  ctx.fillRect(6, 25, 10, 10);
  ctx.restore();
}

function drawEntity(ctx: CanvasRenderingContext2D, entity: Entity, tick: number) {
  const y = entity.y + Math.sin(tick / 18 + entity.bob) * 5;
  ctx.save();
  ctx.translate(entity.x, y);

  if (entity.kind === "net") {
    ctx.strokeStyle = "#a9c6c8";
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, entity.width, entity.height);
    ctx.lineWidth = 1;
    for (let x = 10; x < entity.width; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - 16, entity.height);
      ctx.stroke();
    }
    for (let yLine = 10; yLine < entity.height; yLine += 13) {
      ctx.beginPath();
      ctx.moveTo(0, yLine);
      ctx.lineTo(entity.width, yLine - 8);
      ctx.stroke();
    }
  }

  if (entity.kind === "bag") {
    ctx.fillStyle = "rgba(235, 247, 255, 0.78)";
    ctx.fillRect(7, 10, 24, 28);
    ctx.fillRect(12, 5, 14, 8);
    ctx.clearRect(15, 8, 8, 6);
    ctx.fillStyle = "rgba(123, 178, 195, 0.55)";
    ctx.fillRect(12, 29, 13, 4);
  }

  if (entity.kind === "boat") {
    ctx.fillStyle = "#ffcf5d";
    ctx.fillRect(16, 4, 38, 17);
    ctx.fillStyle = "#f76f63";
    ctx.fillRect(4, 21, 76, 14);
    ctx.fillStyle = "#7ad9ff";
    ctx.fillRect(25, 8, 12, 8);
    ctx.fillStyle = "rgba(233, 252, 255, 0.7)";
    ctx.fillRect(52, 35, 36, 5);
  }

  if (entity.kind === "oil") {
    ctx.fillStyle = "rgba(12, 14, 21, 0.82)";
    ctx.fillRect(4, 9, 72, 18);
    ctx.fillStyle = "rgba(84, 64, 121, 0.8)";
    ctx.fillRect(18, 4, 43, 10);
    ctx.fillStyle = "rgba(35, 122, 119, 0.65)";
    ctx.fillRect(48, 22, 35, 9);
  }

  if (entity.kind === "hook") {
    ctx.strokeStyle = "#d8dde4";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(20, 24);
    ctx.quadraticCurveTo(20, 45, 38, 35);
    ctx.stroke();
    ctx.strokeStyle = "#b74d4f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(20, -22);
    ctx.stroke();
  }

  if (entity.kind === "cleanup") {
    ctx.fillStyle = "#58d186";
    ctx.fillRect(6, 12, 38, 22);
    ctx.fillStyle = "#e8fcff";
    ctx.fillRect(12, 8, 26, 7);
    ctx.fillStyle = "#0d4054";
    ctx.fillRect(18, 20, 14, 5);
    ctx.fillRect(22, 16, 5, 14);
  }

  if (entity.kind === "reef") {
    ctx.fillStyle = "#f25f7f";
    ctx.fillRect(8, 22, 8, 24);
    ctx.fillRect(15, 14, 8, 32);
    ctx.fillStyle = "#f0b65b";
    ctx.fillRect(34, 26, 8, 20);
    ctx.fillRect(42, 18, 8, 28);
    ctx.fillStyle = "#58d186";
    ctx.fillRect(20, 34, 36, 10);
  }

  ctx.restore();
}

function drawFloatingText(ctx: CanvasRenderingContext2D, text: FloatingText) {
  ctx.save();
  ctx.globalAlpha = clamp(text.life / 70, 0, 1);
  ctx.font = "800 18px 'Courier New', monospace";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(3, 18, 28, 0.9)";
  ctx.strokeText(text.text, text.x, text.y);
  ctx.fillStyle = text.color;
  ctx.fillText(text.text, text.x, text.y);
  ctx.restore();
}

function drawOcean(ctx: CanvasRenderingContext2D, tick: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, "#0f5d74");
  gradient.addColorStop(0.42, "#0b405c");
  gradient.addColorStop(1, "#082235");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  for (let row = 0; row < 7; row += 1) {
    ctx.strokeStyle = row % 2 === 0 ? "rgba(147, 220, 230, 0.17)" : "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const y = 42 + row * 68;
    for (let x = -80; x <= CANVAS_WIDTH + 80; x += 20) {
      const wave = Math.sin((x + tick * (1.2 + row * 0.2)) / 42) * 7;
      if (x === -80) {
        ctx.moveTo(x, y + wave);
      } else {
        ctx.lineTo(x, y + wave);
      }
    }
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  for (let i = 0; i < 36; i += 1) {
    const x = (i * 83 - tick * (0.55 + (i % 5) * 0.08)) % (CANVAS_WIDTH + 30);
    const y = 26 + ((i * 47) % (CANVAS_HEIGHT - 50));
    ctx.fillRect(x, y, 3 + (i % 3), 3 + (i % 2));
  }
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef<Keys>({ jump: false });
  const frameRef = useRef(0);
  const entityIdRef = useRef(1);
  const floatingTextIdRef = useRef(1);
  const activeLessonRef = useRef<Lesson | null>(null);
  const learnedLessonsRef = useRef<string[]>([]);
  const [gameState, setGameState] = useState<GameState>("ready");
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => Number(localStorage.getItem("wildfile-best") ?? 0));
  const [health, setHealth] = useState(MAX_HEALTH);
  const [pollution, setPollution] = useState(0);
  const [lastFact, setLastFact] = useState("Fishing gear, plastic, and boat traffic are daily survival challenges for sea turtles.");
  const [rescued, setRescued] = useState(0);
  const [runId, setRunId] = useState(0);
  const [selectedAnimal, setSelectedAnimal] = useState<AnimalKey>("turtle");
  const [selectedRoute, setSelectedRoute] = useState<RouteKey>("reef");
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [learnedLessons, setLearnedLessons] = useState<string[]>([]);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);

  const resetGame = useCallback(() => {
    frameRef.current = 0;
    entityIdRef.current = 1;
    setScore(0);
    setHealth(MAX_HEALTH);
    setPollution(0);
    setRescued(0);
    setActiveLesson(null);
    setLearnedLessons([]);
    setRunSummary(null);
    activeLessonRef.current = null;
    learnedLessonsRef.current = [];
    setLastFact(`${routes[selectedRoute].label}: ${routes[selectedRoute].description}`);
    setRunId((value) => value + 1);
    setGameState("playing");
  }, [selectedRoute]);

  useEffect(() => {
    const gameKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Spacebar", "w", "W"]);
    const down = (event: KeyboardEvent) => {
      if (gameKeys.has(event.key) || event.code === "Space") {
        event.preventDefault();
      }
      if (event.code === "Space" && gameState !== "playing") {
        resetGame();
        return;
      }
      if (event.code === "Space" || event.key === "ArrowUp" || event.key.toLowerCase() === "w") {
        keysRef.current.jump = true;
      }
    };
    const up = (event: KeyboardEvent) => {
      if (gameKeys.has(event.key) || event.code === "Space") {
        event.preventDefault();
      }
      if (event.code === "Space" || event.key === "ArrowUp" || event.key.toLowerCase() === "w") {
        keysRef.current.jump = false;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [gameState, resetGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId = 0;
    let entities: Entity[] = [];
    let floatingTexts: FloatingText[] = [];
    let turtle = { x: 118, y: CANVAS_HEIGHT / 2 - TURTLE_SIZE / 2, width: TURTLE_SIZE, height: TURTLE_SIZE };
    let turtleVelocity = 0;
    let jumpWasHeld = false;
    let internalHealth = MAX_HEALTH;
    let internalScore = 0;
    let spawnTimer = 0;
    let lastHit = -120;

    const renderStatic = () => {
      drawOcean(ctx, frameRef.current);
      drawAnimal(ctx, turtle.x, turtle.y, frameRef.current, selectedAnimal);
      ctx.fillStyle = "rgba(3, 18, 28, 0.58)";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      drawPixelText(ctx, gameState === "ended" ? "Migration ended. Press Space to swim again." : "Press Space or Start to begin.", 278, 262);
    };

    const loop = () => {
      frameRef.current += 1;
      const tick = frameRef.current;
      drawOcean(ctx, tick);

      if (gameState !== "playing") {
        renderStatic();
        animationId = requestAnimationFrame(loop);
        return;
      }

      const keys = keysRef.current;
      if (keys.jump && !jumpWasHeld) {
        turtleVelocity = JUMP_FORCE;
        floatingTexts.push({
          id: floatingTextIdRef.current,
          text: "JUMP!",
          x: turtle.x + 44,
          y: turtle.y + 12,
          color: "#e8fcff",
          life: 34
        });
        floatingTextIdRef.current += 1;
      }
      jumpWasHeld = keys.jump;
      turtleVelocity = clamp(turtleVelocity + GRAVITY, JUMP_FORCE, MAX_FALL_SPEED);
      turtle.y += turtleVelocity;

      if (turtle.y < 12) {
        turtle.y = 12;
        turtleVelocity = 1.8;
      }

      if (turtle.y > CANVAS_HEIGHT - TURTLE_SIZE - 18) {
        turtle.y = CANVAS_HEIGHT - TURTLE_SIZE - 18;
        turtleVelocity = JUMP_FORCE * 0.55;
        internalHealth = clamp(internalHealth - 12, 0, MAX_HEALTH);
        setHealth(internalHealth);
        setLastFact("A tired turtle loses health when it sinks too low. Tap Space to keep a steady rhythm.");
        floatingTexts.push({
          id: floatingTextIdRef.current,
          text: "-12 Sank too low!",
          x: turtle.x + 42,
          y: turtle.y,
          color: "#ff6f7c",
          life: 72
        });
        floatingTextIdRef.current += 1;
      }

      spawnTimer -= 1;
      if (spawnTimer <= 0) {
        entities.push(randomEntity(entityIdRef.current, internalScore, selectedRoute));
        const currentPollution = pollutionLevel(internalScore);
        if (currentPollution > 25 && Math.random() < currentPollution / 135) {
          entities.push(randomEntity(entityIdRef.current + 1, Math.max(0, internalScore - 60), selectedRoute));
          entityIdRef.current += 1;
        }
        if (currentPollution > 65 && Math.random() < currentPollution / 185) {
          entities.push(randomEntity(entityIdRef.current + 1, Math.max(0, internalScore - 120), selectedRoute));
          entityIdRef.current += 1;
        }
        entityIdRef.current += 1;
        spawnTimer = Math.max(12, 104 - Math.floor(internalScore / 70) - Math.floor(currentPollution / 2));
      }

      entities = entities
        .map((entity) => ({ ...entity, x: entity.x - entity.speed }))
        .filter((entity) => entity.x + entity.width > -40);
      floatingTexts = floatingTexts
        .map((text) => ({ ...text, y: text.y - 0.65, life: text.life - 1 }))
        .filter((text) => text.life > 0);

      for (const entity of entities) {
        drawEntity(ctx, entity, tick);
      }

      const turtleBox = { ...turtle, x: turtle.x + 7, y: turtle.y + 7, width: turtle.width - 12, height: turtle.height - 14 };
      const collided = entities.find((entity) =>
        intersects(turtleBox, { x: entity.x, y: entity.y, width: entity.width, height: entity.height })
      );

      if (collided && tick - lastHit > 34) {
        const meta = entityMeta[collided.kind];
        entities = entities.filter((entity) => entity.id !== collided.id);
        lastHit = tick;

        if (meta.danger < 0) {
          internalHealth = clamp(internalHealth - meta.danger, 0, MAX_HEALTH);
          internalScore += meta.points;
          setRescued((value) => value + 1);
          const lesson = lessons[collided.kind];
          activeLessonRef.current = lesson;
          setActiveLesson(lesson);
          if (!learnedLessonsRef.current.includes(lesson.title)) {
            learnedLessonsRef.current = [...learnedLessonsRef.current, lesson.title];
            setLearnedLessons(learnedLessonsRef.current);
          }
          setLastFact(lesson.action);
          floatingTexts.push({
            id: floatingTextIdRef.current,
            text: `+${Math.abs(meta.danger)} ${meta.label}!`,
            x: turtle.x + 42,
            y: turtle.y + 8,
            color: "#7dff9c",
            life: 70
          });
        } else {
          internalHealth = clamp(internalHealth - meta.danger, 0, MAX_HEALTH);
          internalScore = Math.max(0, internalScore - Math.floor(meta.points / 2));
          const lesson = lessons[collided.kind];
          activeLessonRef.current = lesson;
          setActiveLesson(lesson);
          if (!learnedLessonsRef.current.includes(lesson.title)) {
            learnedLessonsRef.current = [...learnedLessonsRef.current, lesson.title];
            setLearnedLessons(learnedLessonsRef.current);
          }
          setLastFact(lesson.action);
          floatingTexts.push({
            id: floatingTextIdRef.current,
            text: `-${meta.danger} Hit by ${meta.label}!`,
            x: turtle.x + 42,
            y: turtle.y + 8,
            color: "#ff6f7c",
            life: 78
          });
        }
        floatingTextIdRef.current += 1;
        setHealth(internalHealth);
        setScore(internalScore);
      }

      internalScore += routes[selectedRoute].scoreRate + Math.min(internalScore / 20000, 0.12);
      setScore(Math.floor(internalScore));
      const currentPollution = pollutionLevel(internalScore);
      setPollution(currentPollution);
      drawAnimal(ctx, turtle.x, turtle.y, tick, selectedAnimal);
      for (const text of floatingTexts) {
        drawFloatingText(ctx, text);
      }

      ctx.fillStyle = "rgba(5, 24, 38, 0.68)";
      ctx.fillRect(18, 16, 228, 52);
      ctx.fillStyle = "#e8fcff";
      ctx.font = "700 14px 'Courier New', monospace";
      ctx.fillText(`DISTANCE ${Math.floor(internalScore).toString().padStart(5, "0")}`, 30, 39);
      ctx.fillText(`HEALTH ${Math.ceil(internalHealth).toString().padStart(3, "0")}`, 30, 58);
      if (currentPollution >= 35) {
        ctx.fillStyle = "rgba(3, 18, 28, 0.58)";
        ctx.fillRect(CANVAS_WIDTH - 274, 16, 256, 32);
        ctx.fillStyle = currentPollution >= 70 ? "#ff6f7c" : "#ffdd8b";
        ctx.fillText(`POLLUTION RISING ${currentPollution}%`, CANVAS_WIDTH - 260, 38);
      }

      if (internalHealth <= 0) {
        const finalScore = Math.floor(internalScore);
        setGameState("ended");
        setHealth(0);
        setScore(finalScore);
        setRunSummary({
          distance: finalScore,
          lessons: learnedLessonsRef.current.length > 0 ? learnedLessonsRef.current : ["Steady migration rhythm"],
          hardestThreat: activeLessonRef.current?.title ?? "Habitat pressure"
        });
        setBestScore((previous) => {
          const next = Math.max(previous, finalScore);
          localStorage.setItem("wildfile-best", String(next));
          return next;
        });
      }

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [gameState, runId, selectedAnimal, selectedRoute]);

  return (
    <main className="app-shell">
      <section className="game-panel" aria-label="WildFile game">
        <div className="title-row">
          <div>
            <p className="eyebrow">Endangered animal survival game</p>
            <h1>WildFile</h1>
          </div>
          <div className="status-pill">
            <Shield size={18} />
            {animals[selectedAnimal].status}
          </div>
        </div>

        <div className="canvas-wrap">
          <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} aria-label="A pixel sea turtle swimming through ocean obstacles." />
          {gameState !== "playing" && (
            <div className="mission-overlay">
              <p className="eyebrow">Mission briefing</p>
              <h2>{animals[selectedAnimal].mission}</h2>
              <p>{routes[selectedRoute].description}</p>
              <p className="action-line">Watch how pollution rises over time: more trash means more danger.</p>
            </div>
          )}
          <div className="controls-strip">
            <span>Jump: Space / W / Arrow Up</span>
            <span>{routes[selectedRoute].label}</span>
          </div>
        </div>

        {gameState !== "playing" && (
          <section className="menu-board" aria-label="Choose playable animal">
            <div className="icon-title">
              <Shield size={18} />
              <h2>Choose your animal</h2>
            </div>
            <div className="animal-grid">
              {(Object.keys(animals) as AnimalKey[]).map((animalKey) => (
                <button
                  type="button"
                  className={selectedAnimal === animalKey ? "animal-select-card selected" : "animal-select-card"}
                  key={animalKey}
                  onClick={() => setSelectedAnimal(animalKey)}
                >
                  <span className="pixel-badge" style={{ background: animals[animalKey].color }} />
                  <strong>{animals[animalKey].species}</strong>
                  <span>{animals[animalKey].habitat}</span>
                  <small>{animals[animalKey].status}</small>
                </button>
              ))}
            </div>
          </section>
        )}

        {gameState !== "playing" && (
          <section className="menu-board" aria-label="Choose migration route">
            <div className="icon-title">
              <Map size={18} />
              <h2>Choose a migration route</h2>
            </div>
            <div className="route-grid">
              {(Object.keys(routes) as RouteKey[]).map((routeKey) => (
                <button
                  type="button"
                  className={selectedRoute === routeKey ? "route-card selected" : "route-card"}
                  key={routeKey}
                  onClick={() => setSelectedRoute(routeKey)}
                >
                  <strong>{routes[routeKey].label}</strong>
                  <span>{routes[routeKey].description}</span>
                  <small>{routes[routeKey].risk}</small>
                </button>
              ))}
            </div>
          </section>
        )}

        {runSummary && (
          <section className="summary-box">
            <div className="icon-title">
              <Shield size={18} />
              <h2>Run report</h2>
            </div>
            <p>Distance: {runSummary.distance}</p>
            <p>Main lesson: {runSummary.hardestThreat}</p>
            <p>Learned: {runSummary.lessons.join(", ")}</p>
          </section>
        )}

        <div className="button-row">
          <button type="button" className="primary" onClick={resetGame}>
            {gameState === "playing" ? <RotateCcw size={18} /> : <Play size={18} />}
            {gameState === "playing" ? "Restart" : "Start"}
          </button>
        </div>
      </section>
    </main>
  );
}
