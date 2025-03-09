const fs = require("fs"); // Module de gestion des fichiers en Node.js

// Configuration de la grille
const gridSize = 1000;
const historySize = 10; // Profondeur de l'historique pour la prédiction des mouvements

// Paramètres d'apprentissage par renforcement (Q-Learning)
let QTable = {}; // Q-Table : associe un état aux meilleures actions possibles
const epsilon = 0.05; // Taux d'exploration pour la sélection des actions
const alpha = 0.1; // Taux d'apprentissage pour la mise à jour des valeurs
const gamma = 0.9; // Facteur d'escompte pour les récompenses futures
const saveInterval = 10; // Fréquence d'enregistrement de la Q-Table

// Initialisation du serpent et de la bête
let pastSnakePositions = [];
let beast = { x: 50, y: 50 };
let snake = { x: 300, y: 300 };

// Déplacements possibles : 4 directions cardinales + 4 diagonales
const actions = [
    { dx: 10, dy: 0 }, { dx: -10, dy: 0 }, { dx: 0, dy: 10 }, { dx: 0, dy: -10 },
    { dx: 10, dy: 10 }, { dx: -10, dy: 10 }, { dx: 10, dy: -10 }, { dx: -10, dy: -10 }
];

/**
 * Charge la Q-Table à partir d'un fichier JSON
 * @param {string} filename - Chemin du fichier de sauvegarde
 */
function loadQTableFromFile(filename = "q_table.json") {
    if (!fs.existsSync(filename)) {
        console.warn(`⚠️ Aucun fichier Q-Table trouvé, démarrage à neuf.`);
        return;
    }
    try {
        QTable = JSON.parse(fs.readFileSync(filename, "utf-8"));
        console.log(`📂 Q-Table chargée avec ${Object.keys(QTable).length} entrées.`);
    } catch (error) {
        console.error(" Erreur lors du chargement de la Q-Table :", error);
    }
}

/**
 * Sauvegarde la Q-Table dans un fichier JSON
 * @param {string} filename - Chemin du fichier de sauvegarde
 */
function saveQTableToFile(filename = "q_table.json") {
    fs.writeFileSync(filename, JSON.stringify(QTable, null, 2), "utf-8");
    console.log(` Q-Table mise à jour et enregistrée.`);
}

/**
 * Prédit la future position du serpent en utilisant une régression pondérée
 * @returns {Object} - Coordonnées prédites (x, y) du serpent
 */
function predictSnakeFuturePosition() {
    if (pastSnakePositions.length < 2) {
        return pastSnakePositions.length > 0 ? pastSnakePositions[pastSnakePositions.length - 1] : { ...snake };
    }

    let sumWX = 0, sumWY = 0, sumWT = 0, sumWXY = 0, sumWX2 = 0, sumW = 0;
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
    
    let predictedX = Math.round((slopeX * (n + 3) + interceptX) / 10) * 10;
    let predictedY = Math.round((slopeY * (n + 3) + interceptY) / 10) * 10;
    
    return { x: predictedX, y: predictedY };
}

/**
 * Récupère l'état actuel de l'environnement sous forme de chaîne de caractères
 * @returns {string} - Représentation de l'état actuel
 */
function getCurrentState() {
    return `${beast.x},${beast.y},${snake.x},${snake.y}`;
}

/**
 * Sélectionne la meilleure action pour la bête en utilisant Q-Learning
 * @param {string} state - État actuel
 * @returns {Object} - Action choisie (dx, dy)
 */
function chooseBestAction(state) {
    if (!QTable[state] || Math.random() < epsilon) {
        return actions[Math.floor(Math.random() * actions.length)]; // Exploration
    }

    return actions.reduce((best, action) => {
        let key = `${state}-${action.dx}-${action.dy}`;
        return (!QTable[key] || QTable[key] > QTable[`${state}-${best.dx}-${best.dy}`]) ? action : best;
    });
}

/**
 * Met à jour la Q-Table en fonction de la récompense reçue
 * @param {string} state - État précédent
 * @param {Object} action - Action effectuée (dx, dy)
 * @param {number} reward - Récompense obtenue
 * @param {string} newState - Nouvel état après l'action
 */
function updateQTable(state, action, reward, newState) {
    let key = `${state}-${action.dx}-${action.dy}`;
    if (!QTable[key]) QTable[key] = Math.random() * 0.01;

    let futureQ = Math.max(...actions.map(a => QTable[`${newState}-${a.dx}-${a.dy}`] || 0));
    QTable[key] = (1 - alpha) * QTable[key] + alpha * (reward + gamma * futureQ);

    saveQTableToFile(); // Enregistrer immédiatement après mise à jour
}

/**
 * Met à jour la position de la bête en suivant la politique d'apprentissage
 */
function updateBeast() {
    let state = getCurrentState();
    let action = chooseBestAction(state);
    let newBeast = { x: beast.x + action.dx, y: beast.y + action.dy };

    // Assurer que le déplacement reste dans les limites de la grille
    newBeast.x = Math.max(0, Math.min(newBeast.x, gridSize - 1));
    newBeast.y = Math.max(0, Math.min(newBeast.y, gridSize - 1));

    let predictedSnake = predictSnakeFuturePosition();
    let reward = 0; // Placeholder pour le calcul de la récompense

    let newState = `${newBeast.x},${newBeast.y},${snake.x},${snake.y}`;
    updateQTable(state, action, reward, newState);
    beast = newBeast; // Appliquer le déplacement

    console.log(`🐍 Bête déplacée à : (${beast.x}, ${beast.y})`);
}

updateBeast();