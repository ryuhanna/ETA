document.addEventListener('DOMContentLoaded', function() {
    const gameCanvas = document.getElementById('gameCanvas');
    const gameCtx = gameCanvas.getContext('2d');
    const scoreElement = document.getElementById('score');
    const livesElement = document.getElementById('lives');
    const levelElement = document.getElementById('level');
    
    let score = 0;
    let lives = 3;
    let level = 1;
    let fallSpeed = 2;
    let levelUpTime = 10000; // 10 seconds per level

    const words = {
        'alphabet': [],
        'numbers': [],
        'words': []
    };
    let fallingWords = [];
    let currentMode = 'words';
    let samePredictionCount = 0;
    const minPredictionCount = 10;

    async function fetchLabels(mode) {
        let url = '';
        if (mode === 'alphabet') url = '/recognition/get_alphabet_labels/';
        else if (mode === 'numbers') url = '/recognition/get_number_labels/';
        else if (mode === 'words') url = '/recognition/get_word_labels/';

        try {
            const response = await fetch(url);
            const data = await response.json();
            words[mode] = data[mode];
            console.log(`Fetched ${mode} labels:`, words[mode]);
        } catch (error) {
            console.error(`Error fetching ${mode} labels:`, error);
        }
    }

    function createFallingWord() {
        if (words[currentMode].length === 0) return;
        const word = words[currentMode][Math.floor(Math.random() * words[currentMode].length)];
        const x = Math.random() * (gameCanvas.width - 100);
        const y = 0;
        fallingWords.push({ word, x, y });
    }

    function updateFallingWords() {
        gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
        fallingWords.forEach((wordObj, index) => {
            wordObj.y += fallSpeed;
            gameCtx.font = '20px Arial';
            gameCtx.fillStyle = 'black';
            gameCtx.fillText(wordObj.word, wordObj.x, wordObj.y);
            if (wordObj.y > gameCanvas.height) {
                createExplosion(wordObj.x, gameCanvas.height - 20, wordObj.word);
                fallingWords.splice(index, 1);
                lives--;
                livesElement.innerText = `Lives: ${lives}`;
                if (lives <= 0) {
                    gameOver();
                }
            }
        });
    }

    function createExplosion(x, y, word) {
        const wordElement = document.createElement('div');
        wordElement.textContent = word;
        wordElement.style.position = 'absolute';
        wordElement.style.left = x + 'px';
        wordElement.style.top = y + 'px';
        wordElement.classList.add('explode');
        document.getElementById('game-area').appendChild(wordElement);

        wordElement.addEventListener('animationend', () => {
            wordElement.remove();
        });
    }

    function startGame() {
        setInterval(createFallingWord, 2000);
        setInterval(updateFallingWords, 30);
        setInterval(levelUp, levelUpTime);
    }

    function checkCollision(predictedWord) {
        console.log(`Checking collision for: ${predictedWord}`);
        fallingWords.forEach((wordObj, index) => {
            console.log(`Comparing with: ${wordObj.word}`);
            if (String(wordObj.word) === String(predictedWord) && wordObj.y < gameCanvas.height - 50) {
                createExplosion(wordObj.x, wordObj.y, wordObj.word);
                fallingWords.splice(index, 1);
                score += 10;
                scoreElement.innerText = `Score: ${score}`;
                console.log(`Removed word: ${wordObj.word}`);
            }
        });
    }

    function resetGame() {
        score = 0;
        lives = 3;
        level = 1;
        fallSpeed = 2;
        scoreElement.innerText = `Score: ${score}`;
        livesElement.innerText = `Lives: ${lives}`;
        levelElement.innerText = `Level: ${level}`;
        fallingWords = [];
        samePredictionCount = 0;
    }

    function levelUp() {
        level++;
        fallSpeed += 1; // Increase fall speed
        levelElement.innerText = `Level: ${level}`;
        console.log(`Level up! Current level: ${level}, Fall speed: ${fallSpeed}`);
    }

    function gameOver() {
        alert(`Game Over\nFinal Score: ${score}\nFinal Level: ${level}`);
        resetGame();
    }

    window.setMode = function(mode) {
        currentMode = mode;
        fetchLabels(mode);
        resetGame();
    };

    document.querySelector('.button-container').onclick = (event) => {
        if (event.target.tagName === 'BUTTON') {
            setMode(event.target.textContent.toLowerCase());
        }
    };

    startGame();

    const video = document.createElement('video');
    const canvas = document.getElementById('outputCanvas');
    const ctx = canvas.getContext('2d');
    const csrfToken = document.querySelector('input[name="csrfmiddlewaretoken"]').value;

    video.style.display = 'none';
    document.body.appendChild(video);

    const hands = new Hands({locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }});
    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    const camera = new Camera(video, {
        onFrame: async () => {
            await hands.send({image: video});
            drawVideoAndResults();
        },
        width: 160,
        height: 120
    });
    camera.start();

    let handsResults = null;

    hands.onResults((results) => {
        handsResults = results;
    });

    function drawVideoAndResults() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        if (handsResults && handsResults.multiHandLandmarks) {
            handsResults.multiHandLandmarks.forEach((landmarks) => {
                drawBoundingBox(ctx, landmarks, {color: 'brown', lineWidth: 2});
            });

            const landmarksArray = handsResults.multiHandLandmarks.flat().map(landmark => [landmark.x, landmark.y, landmark.z]);
            if (landmarksArray.length > 0) {
                sendLandmarks(landmarksArray);
            }
        }
    }

    function drawBoundingBox(ctx, landmarks, {color, lineWidth}) {
        const xValues = landmarks.map(landmark => (1 - landmark.x) * canvas.width);
        const yValues = landmarks.map(landmark => landmark.y * canvas.height);

        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues);
        const minY = Math.min(...yValues);
        const maxY = Math.max(...yValues);

        ctx.beginPath();
        ctx.rect(minX, minY, maxX - minX, maxY - minY);
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = color;
        ctx.stroke();
    }

    function sendLandmarks(landmarks) {
        fetch('/recognition/predict/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify({ landmarks: landmarks, category: currentMode })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            const finalPrediction = data.final_prediction;
            console.log(`Predicted word: ${finalPrediction}`);
            if (finalPrediction !== 'Try Again') {
                samePredictionCount++;
                if (samePredictionCount >= minPredictionCount) {
                    checkCollision(finalPrediction);
                    samePredictionCount = 0;
                }
            }

            const predictedWordElement = document.getElementById('predicted-word');
            if (predictedWordElement) {
                predictedWordElement.innerText = finalPrediction;
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
    }
});