import { Boid } from "./Boids.js"

const canvas = document.getElementById("gameCanvas");
const context = canvas.getContext("2d");
const accueil = document.getElementById("accueil");
const start_button = document.getElementById("startButton");

const canvas_size = 600;
canvas.width = canvas_size;
canvas.height = canvas_size;


let bestScore = localStorage.getItem("bestScore") ? parseInt(localStorage.getItem("bestScore")) : 0;
const bestScoreElement = document.getElementById("bestScore"); // Assure-toi d'avoir un élément HTML pour afficher le meilleur score
bestScoreElement.textContent = bestScore;

/**
 * Defining game parameters and draw rules
 */
const snake_width = 10;
let snake_length = 10;
const max_snake_length = 20; // Longueur maximale du Snake
const head_proportion = (snake_length / 100) * 10;
let non_boids_speed = 1.5;
const min_speed = 1.5; // Vitesse de départ
const max_speed = 4;   // Vitesse maximale atteignable
const speed_increment = 3000; // Score nécessaire pour atteindre la vitesse max
const boids_number = 25;
const max_turn_angle = Math.PI / 5; // ~5 degrees max turn per frame
let current_direction = Math.PI / 2;

/**
 * Mouse placed at the center when starting game
 */
const center = canvas_size / 2;
let mouse_x = center + 100;
let mouse_y = center + 100;
let prev_mouse_x = mouse_x;
let prev_mouse_y = mouse_y;

let score = 0;
const scoreElement = document.getElementById("score");

/**
 * Game flags
 */
let game_running = false;

let enemy_speed = 1.5; // Ajuste cette valeur pour modifier la vitesse de l'ennemi
let historySize = 10;
/**
 * Game data
 */
let boids = [];
let snake_positions = [];
let level = 1;
let objective;
let ennemy = {
    color: "red",
    position: {
        x: undefined,
        y: undefined
    },
    target_pos: {
        x: undefined,
        y: undefined
    }
}
const compute_objective = () => {
    objective = 100 * level * (level + 5);
}

function isSnakeBody(x, y) {
    return snake_positions.some(segment => segment.x === x && segment.y === y);
}

function astar(start, goal) {
    let openList = [];
    let closedList = new Set();

    openList.push({ pos: start, parent: null, g: 0, h: heuristic(start, goal), f: 0 });

    function heuristic(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    while (openList.length > 0) {
        openList.sort((a, b) => a.f - b.f);
        let current = openList.shift();

        const distance = Math.hypot(current.pos.x - goal.x, current.pos.y - goal.y);
        console.log(distance);

        if (distance < snake_width) {
            let path = [];
            while (current) {
                path.push(current.pos);
                current = current.parent;
            }
            return path.reverse();
        }

        closedList.add(`${current.pos.x},${current.pos.y}`);

        let neighbors = [
            { x: current.pos.x + 10, y: current.pos.y },
            { x: current.pos.x - 10, y: current.pos.y },
            { x: current.pos.x, y: current.pos.y + 10 },
            { x: current.pos.x, y: current.pos.y - 10 },
            { x: current.pos.x + 10, y: current.pos.y + 10 },
            { x: current.pos.x - 10, y: current.pos.y + 10 },
            { x: current.pos.x + 10, y: current.pos.y - 10 },
            { x: current.pos.x - 10, y: current.pos.y - 10 }
        ];

        for (let neighbor of neighbors) {
            if (
                neighbor.x < 0 || neighbor.y < 0 ||
                neighbor.x >= canvas_size || neighbor.y >= canvas_size ||
                closedList.has(`${neighbor.x},${neighbor.y}`) ||
                isSnakeBody(neighbor.x, neighbor.y)
            ) {
                continue;
            }

            let g = current.g + (Math.abs(neighbor.x - current.pos.x) + Math.abs(neighbor.y - current.pos.y) === 20 ? 14 : 10);
            let h = heuristic(neighbor, goal);
            let f = g + h;

            openList.push({ pos: neighbor, parent: current, g, h, f });
        }
    }
    return [];
}

function predictSnakeFuturePosition() {
    if (snake_positions.length < 2) {
        console.warn("🚨 Pas assez de positions pour prédire !");
        return snake_positions[0]; // Retourne la tête du Snake comme fallback
    }

    let n = Math.min(snake_positions.length, historySize);
    let recentPositions = snake_positions.slice(0, n).reverse();

    let sumWX = 0, sumW_X = 0, sumWXY_X = 0, sumWX2_X = 0, sumW = 0;
    for (let i = 0; i < n; i++) {
        let t = i + 1;
        let weight = Math.exp(i - n);
        sumWX += weight * t;
        sumW_X += weight * recentPositions[i].x;
        sumWXY_X += weight * t * recentPositions[i].x;
        sumWX2_X += weight * t * t;
        sumW += weight;
    }

    if (sumW === 0) {
        return recentPositions[recentPositions.length - 1];
    }

    let denomX = sumW * sumWX2_X - sumWX * sumWX;
    let slopeX = denomX !== 0 ? (sumW * sumWXY_X - sumWX * sumW_X) / denomX : 0;
    let interceptX = sumW !== 0 ? (sumW_X - slopeX * sumWX) / sumW : 0;

    let sumW_Y = 0, sumWXY_Y = 0, sumWX2_Y = 0;
    for (let i = 0; i < n; i++) {
        let t = i + 1;
        let weight = Math.exp(i - n);
        sumW_Y += weight * recentPositions[i].y;
        sumWXY_Y += weight * t * recentPositions[i].y;
        sumWX2_Y += weight * t * t;
    }

    let denomY = sumW * sumWX2_Y - sumWX * sumWX;
    let slopeY = denomY !== 0 ? (sumW * sumWXY_Y - sumWX * sumW_Y) / denomY : 0;
    let interceptY = sumW !== 0 ? (sumW_Y - slopeY * sumWX) / sumW : 0;

    let predictionFactor = n + 20;
    let predictedX = slopeX * predictionFactor + interceptX;
    let predictedY = slopeY * predictionFactor + interceptY;

    if (isNaN(predictedX) || isNaN(predictedY)) {
        console.error("❌ Prédiction invalide !");
        return snake_positions[0];
    }

    predictedX = Math.max(10, Math.min(canvas_size - 10, predictedX));
    predictedY = Math.max(10, Math.min(canvas_size - 10, predictedY));

    console.log("🔮 Position prédite après correction :", { x: predictedX, y: predictedY });
    return { x: predictedX, y: predictedY };
}




canvas.addEventListener("mousemove", event => {
    /**
     * If the game didn't start do nothing
     */
    if (!game_running) return;

    /**
     * Mouse position relative to the canvas' center and set it as the new position
     */
    const rectangle = canvas.getBoundingClientRect();
    const new_mouse_x = event.clientX - rectangle.left;
    const new_mouse_y = event.clientY - rectangle.top;
    prev_mouse_x = mouse_x;
    prev_mouse_y = mouse_y;
    mouse_x = new_mouse_x;
    mouse_y = new_mouse_y;
});

/**
 * Speaks for itself
 */
const create_boids = () => {
    boids = [];
    for (let i = 0; i < boids_number; i++)
        boids.push(new Boid(canvas_size, boids)); // Passer la liste
};

const check_snake_death = () => {
    const snake_head = snake_positions[0];

    for (let i = head_proportion + 10; i < snake_positions.length; i++) {
        const position = snake_positions[i];
        const distance = Math.hypot(snake_head.x - position.x, snake_head.y - position.y);

        if (distance < non_boids_speed) {
            game_running = false;
            score = 0;
            scoreElement.textContent = score;
            document.getElementById("gameOverScreen").style.display = "block";
        }
    }
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem("bestScore", bestScore);
        bestScoreElement.textContent = bestScore;
    }
    
};

const update_snake = () => {
    /**
     * If the game doesnt run do nothing
     */
    if (!game_running) return;

    /**
     * Get the current position of the snake's head
     */
    const current_head = snake_positions[0] || { x: center, y: center };

    check_snake_death();

    /**
     * If the head is at the cursor's position do nothing
     */
    if (current_head.x == mouse_x && current_head.y == mouse_y) return;

    /**
     * Distance of head from mouse
     */
    const dx = mouse_x - current_head.x;
    const dy = mouse_y - current_head.y;
    const distance = Math.sqrt((dx ** 2) + (dy ** 2));

    /**
     * Calculate desired direction towards mouse
     */
    let target_angle = Math.atan2(dy, dx);
    let angle_diff = target_angle - current_direction;

    /**
     * Limit turning angle
     */
    angle_diff = ((angle_diff + Math.PI) % (2 * Math.PI)) - Math.PI; // Normalize
    angle_diff = Math.sign(angle_diff) * Math.min(Math.abs(angle_diff), max_turn_angle);
    current_direction += angle_diff;

    /**
     * Move along current direction
     */
    let head_x = current_head.x + Math.cos(current_direction) * non_boids_speed;
    let head_y = current_head.y + Math.sin(current_direction) * non_boids_speed;

    if (head_x < 0 || head_x > canvas_size || head_y < 0 || head_y > canvas_size) {
        console.log("Game Over - Bordure touchée");
        game_running = false;
        score = 0;
        scoreElement.textContent = score;
        document.getElementById("gameOverScreen").style.display = "block";
        return;
    }

    non_boids_speed = min_speed + ((max_speed - min_speed) * (score / speed_increment));
    non_boids_speed = Math.min(non_boids_speed, max_speed);


    /**
     * If close enough, snap the head to the mouse
     */
    if (distance < non_boids_speed) {
        head_x = mouse_x;
        head_y = mouse_y;
        current_direction = Math.atan2(
            head_y - current_head.y,
            head_x - current_head.x
        );
    }

    /**
     * Update snake position
     */
    snake_positions.unshift({ x: head_x, y: head_y });

    while (snake_positions.length > Math.min(snake_length, max_snake_length)) {
    snake_positions.pop();
}

};

const update_ennemy = () => {
    if (!game_running) return;

    if (score < 2000) {
        // L'ennemi est caché avant 1000 points
        ennemy.position.x = -100; 
        ennemy.position.y = -100;
        return;
    }

    // S'il apparaît pour la première fois, on lui donne une position initiale
    if (score === 2000 && (ennemy.position.x === -100 || ennemy.position.y === -100)) {
        console.log("👹 L'ennemi apparaît !");
        ennemy.position.x = Math.random() * (canvas_size - 50) + 25;
        ennemy.position.y = Math.random() * (canvas_size - 50) + 25;
    }

    let targetPos;
    
    if (score < 4000) {
        // L'ennemi suit la tête du Snake avec A*
        let path = astar(ennemy.position, snake_positions[0]);
        enemy_speed = 0.7;
        if (path.length > 1) {
            targetPos = path[1]; // Prendre la prochaine position
        } else {
            console.warn("⚠️ A* n'a trouvé aucun chemin ! L'ennemi attend...");
            return;
        }
    } else {
        // L'ennemi anticipe la position future du Snake
        targetPos = predictSnakeFuturePosition();
        console.log("🔮 L'ennemi cible la position prédite :", targetPos);
        let path = astar(ennemy.position, targetPos);

        if (path.length > 1) {
            targetPos = path[1]; // Prendre la prochaine position
        } else {
            console.warn("⚠️ A* n'a trouvé aucun chemin ! L'ennemi attend...");
            return;
        }

    }

    // Déplacement progressif vers la cible
    let dx = targetPos.x - ennemy.position.x;
    let dy = targetPos.y - ennemy.position.y;
    let distance = Math.hypot(dx, dy);

    if (distance > enemy_speed) {
        ennemy.position.x += (dx / distance) * enemy_speed;
        ennemy.position.y += (dy / distance) * enemy_speed;
    } else {
        ennemy.position.x = targetPos.x;
        ennemy.position.y = targetPos.y;
    }

    // Vérifier la collision avec la tête du Snake
    let snake_head = snake_positions[0];
    let dist_to_head = Math.hypot(ennemy.position.x - snake_head.x, ennemy.position.y - snake_head.y);

    if (dist_to_head < snake_width) {
        console.log("💀 L'ennemi a touché le Snake ! GAME OVER");
        game_running = false;
        document.getElementById("gameOverScreen").style.display = "block";
    }
};


/**
 * Check if the snake collided with an active boid
 */
const check_boids_collision = () => {
    for (let i = 0; i < boids.length; i++) {
        const boid = boids[i];
        const snake_head = snake_positions[0];

        // Calcul de la distance entre la tête du Snake et le Boid
        let distance = Math.hypot(snake_head.x - boid.x, snake_head.y - boid.y);
        if (level <= 3 && snake_length < max_snake_length) {
            snake_length += 10; // Augmenter la taille du Snake
        }

        // Si la tête touche le Boid, on le mange
        if (distance < snake_width / 2 + 7) { // 7 étant le rayon du Boid

            if (level <= 3) {
                snake_length += 10; // Augmenter la taille du Snake
            }

            boids.splice(i, 1); // Supprimer le Boid mangé
            boids.push(new Boid(canvas_size, boids)); // Ajouter un nouveau Boid

            // Augmenter le score de 100 et l'afficher
            score += 100;
            scoreElement.textContent = score;
            if (score > bestScore) {
                bestScore = score;
                localStorage.setItem("bestScore", bestScore);
                bestScoreElement.textContent = bestScore;
            }
            

            break; // Sortir de la boucle pour éviter des erreurs d'index
        }
    }
};


const draw = () => {
    context.fillStyle = "#222";
    context.fillRect(0, 0, canvas.width, canvas.height);

    for (let point of snake_positions) {
        context.fillStyle = `rgb(0, 255, 0)`;
        context.beginPath();
        context.arc(point.x, point.y, snake_width / 2, 0, Math.PI * 2);
        context.fill();
    }

    for (let boid of boids) {
        boid.draw(context);
    }

    // Dessiner l'ennemi
    context.fillStyle = ennemy.color;
    context.beginPath();
    context.arc(ennemy.position.x, ennemy.position.y, snake_width * 1.3, 0, Math.PI * 2);
    context.fill();

    console.log("Started pathfinding");
    let path = astar(ennemy.position, snake_positions[0]);
    console.log("Pathfinding ended.");

    if (path.length > 0) { // Vérifier que le chemin existe avant d'afficher
        context.fillStyle = "blue";
        context.beginPath();
        context.arc(path[0].x, path[0].y, 10, 0, Math.PI * 2);
        context.fill();
    }
};


const game_loop = () => {
    if (!game_running) return;

    update_snake();
    update_ennemy(); // ✅ Toujours appelé, même avant 1000 points

    check_boids_collision();
    for (let boid of boids) {
        boid.update(boids);
    }

    draw();

    if (score === objective) {
        level++;
        compute_objective();
    }

    if (game_running) {
        requestAnimationFrame(game_loop);
    }
};



start_button.addEventListener("click", () => {
    game_running = true;
    accueil.style.display = "none";
    canvas.style.display = "block";

    score = 0;

    snake_positions = [{
        x: Math.random() * (canvas_size - 200) + 100,
        y: Math.random() * (canvas_size - 200) + 100,
    }];

    const player_pos = snake_positions[0];
    ennemy.position.x = canvas_size - player_pos.x;
    ennemy.position.y = canvas_size - player_pos.y;

    create_boids();
    game_loop();
});

document.getElementById("restartButton").addEventListener("click", () => {
    document.getElementById("gameOverScreen").style.display = "none";
    accueil.style.display = "flex";
    canvas.style.display = "none";
});
