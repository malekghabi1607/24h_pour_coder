let pastSnakePositions = [];
const historySize = 10;
const gridSize = 1000;
let snakeBody = new Set(); // Track Snake's body positions
const alpha = 0.1; // Learning Rate
const gamma = 0.9; // Discount Factor
const epsilon = 0.2; // Exploration Rate
let QTable = {}; // Q-Table (State -> Best Action)
// New variable to track velocity over time
let snakeVelocity = { x: 10, y: 0 };

const actions = [
    { dx: 10, dy: 0 }, { dx: -10, dy: 0 }, { dx: 0, dy: 10 }, { dx: 0, dy: -10 },
    { dx: 10, dy: 10 }, { dx: -10, dy: 10 }, { dx: 10, dy: -10 }, { dx: -10, dy: -10 }
];


function getRandomCoordinates() {
    let x = Math.random() * 1000;
    let y = Math.random() * 1000;

    // Round to the nearest tenth, ensuring last digit is always zero
    x = Math.floor(x / 10) * 10;
    y = Math.floor(y / 10) * 10;

    return { x, y };
}

function trainBeast(episodes) {
    for (let i = 0; i < episodes; i++) {
        console.log(i);
        snake = getRandomCoordinates();
        beast = getRandomCoordinates();
        pastSnakePositions = [];
        snakeBody.clear();

        for (let step = 0; step < 300; step++) {

            // Track the Snake's past positions
            pastSnakePositions.push({ x: snake.x, y: snake.y });
            if (pastSnakePositions.length > historySize) {
                pastSnakePositions.shift(); // Keep only last `historySize` positions
            }

            snakeBody.add(snake)

            let predictedSnake = predictSnakeFuturePosition();

            let escapePaths = countEscapePaths(snake);

            let state = `${beast.x},${beast.y},${snake.x},${snake.y}`;

            let action = chooseAction(state);

            let newBeast = { x: beast.x + action.dx, y: beast.y + action.dy };

            let reward = getReward(beast, newBeast, snake, predictedSnake, escapePaths);

            let newState = `${newBeast.x},${newBeast.y},${snake.x},${snake.y}`;
            updateQTable(state, action, reward, newState);

            beast = newBeast;

            // Update snake's position so it doesn't remain static.
            updateSnake();

            if (reward < -100) break;
        }
        saveQTableToFile();

    }
    console.log("✅ Training Complete!");

}


function predictSnakeFuturePosition() {
    if (pastSnakePositions.length < 2) {
        return pastSnakePositions.length > 0 ? pastSnakePositions[pastSnakePositions.length - 1] : { x: snake.x, y: snake.y };
    }


    let sumWX = 0, sumWY = 0, sumWT = 0, sumWXY = 0, sumWX2 = 0;
    let sumW = 0;
    let n = Math.min(pastSnakePositions.length, historySize);
    
    let recentPositions = pastSnakePositions.slice(-n);

    for (let i = 0; i < n; i++) {
        let t = i + 1;
        let weight = Math.exp(i - n);

        sumWX += weight * t;
        sumWY += weight * recentPositions[i].x;
        sumWXY += weight * t * recentPositions[i].x;
        sumWX2 += weight * t * t;
        sumW += weight;
    }

    let slopeX = (sumW * sumWXY - sumWX * sumWY) / (sumW * sumWX2 - sumWX * sumWX);
    let interceptX = (sumWY - slopeX * sumWX) / sumW;

    sumWY = sumWXY = sumWX2 = 0;
    for (let i = 0; i < n; i++) {
        let t = i + 1;
        let weight = Math.exp(i - n);

        sumWY += weight * recentPositions[i].y;
        sumWXY += weight * t * recentPositions[i].y;
        sumWX2 += weight * t * t;
    }

    let slopeY = (sumW * sumWXY - sumWX * sumWY) / (sumW * sumWX2 - sumWX * sumWX);
    let interceptY = (sumWY - slopeY * sumWX) / sumW;

    let predictedX = slopeX * (n + 3) + interceptX; // Predict further ahead
    let predictedY = slopeY * (n + 3) + interceptY;

    // Round values to the nearest multiple of 10
    predictedX = Math.round(predictedX / 10) * 10;
    predictedY = Math.round(predictedY / 10) * 10;

    return { x: predictedX, y: predictedY };
}

function countEscapePaths(snake) {
    let escapePaths = 0;
    for (let d of actions) {
        let newX = snake.x + d.dx;
        let newY = snake.y + d.dy;
        
        // Check if within grid limits
        if (newX < 0 || newY < 0 || newX >= gridSize || newY >= gridSize) {
            continue; // Ignore moves that go out of bounds
        }
        
        // Check if the position is occupied by the snake body
        if (isSnakeBody(newX, newY)) {
            continue; // Ignore if the Snake’s body is in the way
        }
        
        // Check if the Beast is currently at this position
        if (beast.x === newX && beast.y === newY) {
            continue; // Ignore if the Beast is already occupying this space
        }
        
        // Check if the Beast can reach this position in its next move (i.e., it is one step ahead)
        for (let b of actions) {
            let beastNextX = beast.x + b.dx;
            let beastNextY = beast.y + b.dy;
            if (beastNextX === newX && beastNextY === newY) {
                continue; // Ignore if the Beast will reach this position first
            }
        }
        
        escapePaths++; // Count this as a valid escape path
    }
    return escapePaths;
}

function chooseAction(state) {
    if (Math.random() < epsilon || !QTable[state]) {
        return actions[Math.floor(Math.random() * actions.length)];
    }
    return actions.reduce((best, action) => {
        let key = `${state}-${action.dx}-${action.dy}`;
        return (!QTable[key] || QTable[key] > QTable[`${state}-${best.dx}-${best.dy}`]) ? action : best;
    });
}

function getReward(oldBeast, newBeast, snake, predictedSnake, escapePaths) {
    let reward = 0;

    // 🔹 Calculate Manhattan distances to snake's current and predicted position
    let oldDistance = Math.abs(oldBeast.x - snake.x) + Math.abs(oldBeast.y - snake.y);
    let newDistance = Math.abs(newBeast.x - snake.x) + Math.abs(newBeast.y - snake.y);

    let currentPredictedDistance = Math.abs(oldBeast.x - predictedSnake.x) + Math.abs(oldBeast.y - predictedSnake.y);
    let newPredictedDistance = Math.abs(newBeast.x - predictedSnake.x) + Math.abs(newBeast.y - predictedSnake.y);

    // 🔹 Weighting current vs predicted position
    let weightCurrent = 0.6; // Prioritize immediate closeness
    let weightPredicted = 0.4; // Factor in future positioning

    let compositeOldDistance = weightCurrent * oldDistance + weightPredicted * currentPredictedDistance;
    let compositeNewDistance = weightCurrent * newDistance + weightPredicted * newPredictedDistance;

    // 🔹 **Scaled** reward based on **how much closer** the beast gets
    let distanceChange = compositeOldDistance - compositeNewDistance;
    reward += Math.round(distanceChange * 3); // Scale factor applied

    // 🔹 **Scaled** reward for trapping the snake (instead of fixed values)
    let escapePenalty = Math.max(0, (escapePaths - 3) * -7); // -7 per extra escape route
    let trapBonus = Math.max(0, (3 - escapePaths) * 12); // +12 per reduced escape path

    reward += escapePenalty + trapBonus;

    // 🔹 Apply **scaled** penalty for being near snake body
    let surroundingPenalty = getSurroundingAndDistancePenalty(newBeast.x, newBeast.y);
    reward -= surroundingPenalty * 0.3; // **Lower weight** to prevent over-penalization

    return reward;
}

function updateQTable(state, action, reward, newState) {
    let key = `${state}-${action.dx}-${action.dy}`;
    if (QTable[key] === undefined) QTable[key] = 0; // Initialize if never seen before

    let futureQ = Math.max(...actions.map(a => QTable[`${newState}-${a.dx}-${a.dy}`] || 0));

    QTable[key] = (1 - alpha) * QTable[key] + alpha * (reward + gamma * futureQ);
}

function isSnakeBody(x, y) {
    return snakeBody.has(`${x},${y}`);
}

function getSurroundingAndDistancePenalty(x, y) {
    let penalty = 0;
    let nearbyCount = 0;
    let minDistance = Infinity;
    
    for (let d of actions) {
        let newX = x + d.dx;
        let newY = y + d.dy;
        if (isSnakeBody(newX, newY)) {
            nearbyCount++;
            let distance = Math.hypot(newX - x, newY - y);
            minDistance = Math.min(minDistance, distance);
            penalty += 5; // Lowered from 10 to 5
        }

        let fartherX = x + 2 * d.dx;
        let fartherY = y + 2 * d.dy;
        if (isSnakeBody(fartherX, fartherY)) {
            nearbyCount++;
            let fartherDistance = Math.hypot(fartherX - x, fartherY - y);
            minDistance = Math.min(minDistance, fartherDistance);
            penalty += 3; // Lowered from 5 to 3
        }
    }

    if (nearbyCount >= 5) penalty += 25; // Lowered from 50 to prevent extreme penalties
    if (minDistance < 20) penalty += (30 - minDistance) * 1.5; // Reduced weight factor

    return penalty;
}
function cohesion() {
    if (pastSnakePositions.length === 0) return { x: 0, y: 0 };

    let centerX = 0, centerY = 0;
    let weight = 1.2; // Increase effect of past positions

    for (let pos of pastSnakePositions) {
        centerX += pos.x;
        centerY += pos.y;
    }
    centerX /= pastSnakePositions.length;
    centerY /= pastSnakePositions.length;

    return {
        x: (centerX - snake.x) * 0.15 * weight, // Boosted force
        y: (centerY - snake.y) * 0.15 * weight
    };
}

function separation() {
    let moveX = 0, moveY = 0;
    let threshold = 70; // Detect obstacles farther away

    let distToBeast = Math.hypot(beast.x - snake.x, beast.y - snake.y);
    if (distToBeast < threshold) {
        moveX += (snake.x - beast.x) / distToBeast;
        moveY += (snake.y - beast.y) / distToBeast;
    }

    return { x: moveX * 0.3, y: moveY * 0.3 }; // Stronger effect
}

function alignment() {
    if (pastSnakePositions.length < 2) return { x: 0, y: 0 };

    let prev = pastSnakePositions[pastSnakePositions.length - 2];
    let dx = snake.x - prev.x;
    let dy = snake.y - prev.y;

    return { x: dx * 0.15, y: dy * 0.15 }; // Higher weight to push further
}

function breakoutMove() {
    return {
        x: (Math.random() - 0.5) * 300, // Large forced movement
        y: (Math.random() - 0.5) * 300
    };
}

function explore() {
    return {
        x: (Math.random() - 0.5) * 40, // Bigger random movement range
        y: (Math.random() - 0.5) * 40
    };
}

function getClosestAction(vx, vy) {
    let bestAction = null;
    let maxSimilarity = -Infinity;

    for (let action of actions) {
        // Compute the dot product to measure direction alignment
        let dotProduct = vx * action.dx + vy * action.dy;
        let magnitudeA = Math.hypot(vx, vy) + 0.0001; // Prevent division by zero
        let magnitudeB = Math.hypot(action.dx, action.dy);

        // Compute cosine similarity (closer to 1 means better alignment)
        let similarity = dotProduct / (magnitudeA * magnitudeB);

        if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
            bestAction = action;
        }
    }

    return bestAction || actions[Math.floor(Math.random() * actions.length)]; // Fallback to random action
}

let stuckCounter = 0;
let lastPosition = { x: 0, y: 0 };

function updateSnake() {
    if (pastSnakePositions.length > 10) pastSnakePositions.shift();

    let cohesionForce = cohesion();
    let separationForce = separation();
    let alignmentForce = alignment();
    let explorationForce = explore(); // NEW

    let vx = cohesionForce.x + separationForce.x + alignmentForce.x + explorationForce.x;
    let vy = cohesionForce.y + separationForce.y + alignmentForce.y + explorationForce.y;

    // Normalize velocity to match movement scale
    let speed = Math.hypot(vx, vy);
    if (speed > 0) {
        vx = (vx / speed) * 10; 
        vy = (vy / speed) * 10;
    }

    let bestAction = getClosestAction(vx, vy);

    snake.x += bestAction.dx;
    snake.y += bestAction.dy;

    snake.x = Math.max(0, Math.min(snake.x, gridSize - 1));
    snake.y = Math.max(0, Math.min(snake.y, gridSize - 1));

    snake.x = Math.floor(snake.x / 10) * 10;
    snake.y = Math.floor(snake.y / 10) * 10;

}

const fs = require("fs"); // Node.js module for file handling

function saveQTableToFile(filename = "q_table.json") {
    fs.writeFileSync(filename, JSON.stringify(QTable, null, 2), "utf-8");
}

trainBeast(100000);

