// trifid-worker.js

// English language statistics for scoring
const ENGLISH_FREQUENCY = {
    'A': 0.08167, 'B': 0.01492, 'C': 0.02782, 'D': 0.04253, 'E': 0.12702,
    'F': 0.02228, 'G': 0.02015, 'H': 0.06094, 'I': 0.06966, 'J': 0.00153,
    'K': 0.00772, 'L': 0.04025, 'M': 0.02406, 'N': 0.06749, 'O': 0.07507,
    'P': 0.01929, 'Q': 0.00095, 'R': 0.05987, 'S': 0.06327, 'T': 0.09056,
    'U': 0.02758, 'V': 0.00978, 'W': 0.02360, 'X': 0.00150, 'Y': 0.01974,
    'Z': 0.00074
};

const ENGLISH_TRIGRAMS = {
    "THE": 0.0181, "AND": 0.0073, "ING": 0.0072, "ENT": 0.0042, "ION": 0.0042,
    "HER": 0.0036, "FOR": 0.0034, "THA": 0.0033, "NTH": 0.0033, "INT": 0.0032,
    "ERE": 0.0031, "TIO": 0.0031, "TER": 0.0030, "EST": 0.0028, "ERS": 0.0028,
    "ATI": 0.0026, "HAT": 0.0026, "ATE": 0.0025, "ALL": 0.0025, "ETH": 0.0024
};

const ENGLISH_QUADGRAMS = {
    "TION": 0.0015, "NTHE": 0.0014, "THER": 0.0013, "THAT": 0.0012, 
    "OFTHE": 0.0011, "INGT": 0.0010, "THEM": 0.0009, "THEI": 0.0009,
    "DTHE": 0.0009, "ATIO": 0.0009, "ETHE": 0.0008, "THIS": 0.0008
};

// Score text based on letter, trigram and quadgram frequency
function scoreText(text) {
    let letterScore = 0;
    const letterCounts = {};
    let totalLetters = 0;
    
    for (const char of text.toUpperCase()) {
        if (ENGLISH_FREQUENCY[char]) {
            letterCounts[char] = (letterCounts[char] || 0) + 1;
            totalLetters++;
        }
    }
    
    for (const char in ENGLISH_FREQUENCY) {
        const expected = ENGLISH_FREQUENCY[char] * totalLetters;
        const observed = letterCounts[char] || 0;
        const difference = observed - expected;
        letterScore += (difference * difference) / expected;
    }
    
    letterScore = 1 / (1 + letterScore);
    
    let trigramScore = 0;
    let trigramCount = 0;
    text = text.toUpperCase();
    for (let i = 0; i < text.length - 2; i++) {
        const trigram = text.substr(i, 3);
        if (ENGLISH_TRIGRAMS[trigram]) {
            trigramScore += ENGLISH_TRIGRAMS[trigram];
            trigramCount++;
        }
    }
    
    let quadgramScore = 0;
    let quadgramCount = 0;
    for (let i = 0; i < text.length - 3; i++) {
        const quadgram = text.substr(i, 4);
        if (ENGLISH_QUADGRAMS[quadgram]) {
            quadgramScore += ENGLISH_QUADGRAMS[quadgram];
            quadgramCount++;
        }
    }
    
    trigramScore = trigramScore / (text.length / 3);
    quadgramScore = quadgramScore / (text.length / 4);
    
    return {
        score: (letterScore * 0.2 + trigramScore * 0.5 + quadgramScore * 0.3) * 100,
        trigrams: trigramCount,
        quadgrams: quadgramCount
    };
}

// Generate Trifid cube with key-based permutation (3×3×3 only)
function generateCube(alphabet, key = '') {
    const cube = [[[], [], []], [[], [], []], [[], [], []]];
    let keyedAlphabet = '';
    const usedChars = new Set();
    
    for (const char of key.toUpperCase()) {
        if (!usedChars.has(char) && alphabet.includes(char)) {
            keyedAlphabet += char;
            usedChars.add(char);
        }
    }
    
    for (const char of alphabet) {
        if (!usedChars.has(char)) {
            keyedAlphabet += char;
        }
    }
    
    for (let layer = 0; layer < 3; layer++) {
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const index = layer * 9 + row * 3 + col;
                cube[layer][row][col] = keyedAlphabet[index % keyedAlphabet.length];
            }
        }
    }
    
    return cube;
}

// Generate sequential key for exhaustive search with better distribution
function generateSequentialKey(index, alphabet, keyLength) {
    let key = '';
    let remaining = index;
    
    for (let i = 0; i < keyLength; i++) {
        const pos = remaining % alphabet.length;
        key += alphabet[pos];
        remaining = Math.floor(remaining / alphabet.length);
    }
    
    return key;
}

// Full Trifid decryption with key
function decryptTrifid(ciphertext, cube, key, period = 5) {
    const coords = {};
    
    for (let l = 0; l < 3; l++) {
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                coords[cube[l][r][c]] = [l, r, c];
            }
        }
    }
    
    let decrypted = '';
    const groupSize = period;
    let allLayers = [];
    let allRows = [];
    let allCols = [];
    
    for (let i = 0; i < ciphertext.length; i += groupSize) {
        const group = ciphertext.substr(i, groupSize);
        if (group.length === 0) break;
        
        for (const char of group) {
            const coord = coords[char] || [0, 0, 0];
            allLayers.push(coord[0]);
            allRows.push(coord[1]);
            allCols.push(coord[2]);
        }
    }
    
    const allCoords = allLayers.concat(allRows).concat(allCols);
    
    for (let i = 0; i < allCoords.length; i += 3) {
        if (i + 2 >= allCoords.length) break;
        const l = allCoords[i];
        const r = allCoords[i+1];
        const c = allCoords[i+2];
        decrypted += cube[l][r][c];
    }
    
    return decrypted;
}

// Main worker function with improved key management
self.onmessage = async function(e) {
    const { 
        type, 
        ciphertext, 
        alphabet, 
        searchMode, 
        knownPlaintext, 
        keyLength,
        period,
        workerId,
        keysToTest,
        startIndex
    } = e.data;
    
    if (type === 'pause') {
        self.paused = true;
        return;
    }
    
    if (type === 'resume') {
        self.paused = false;
        return;
    }
    
    if (type !== 'start') return;
    
    let bestScore = -Infinity;
    let keysTested = 0;
    let lastUpdateTime = performance.now();
    const batchSize = 1000; // Process keys in batches to prevent UI freeze
    
    // Calculate total keys this worker should process
    const totalKeys = keysToTest;
    let currentIndex = startIndex;
    
    while (keysTested < totalKeys) {
        if (self.paused) {
            await new Promise(resolve => {
                const checkPause = () => {
                    if (!self.paused) resolve();
                    else setTimeout(checkPause, 100);
                };
                checkPause();
            });
        }
        
        // Process a batch of keys
        const batchEnd = Math.min(currentIndex + batchSize, startIndex + totalKeys);
        let batchResults = [];
        
        for (; currentIndex < batchEnd; currentIndex++) {
            let testKey;
            if (searchMode === 'full') {
                testKey = generateRandomKey(keyLength, alphabet);
            } else {
                testKey = generateSequentialKey(currentIndex, alphabet, keyLength);
            }
            
            const cube = generateCube(alphabet, testKey);
            const decrypted = decryptTrifid(ciphertext, cube, testKey, period);
            const scoreData = scoreText(decrypted);
            
            let valid = true;
            if (knownPlaintext && knownPlaintext.length > 0) {
                valid = decrypted.toUpperCase().includes(knownPlaintext);
            }
            
            if (valid && scoreData.score > bestScore * 0.9) {
                if (scoreData.score > bestScore) {
                    bestScore = scoreData.score;
                }
                
                batchResults.push({
                    type: 'result',
                    key: testKey,
                    text: decrypted,
                    score: scoreData.score,
                    trigrams: scoreData.trigrams,
                    quadgrams: scoreData.quadgrams,
                    cube: cube
                });
            }
            
            keysTested++;
        }
        
        // Send batch results
        if (batchResults.length > 0) {
            self.postMessage({
                type: 'batch_results',
                results: batchResults
            });
        }
        
        // Send progress update
        const now = performance.now();
        if (now - lastUpdateTime > 1000 || keysTested >= totalKeys) {
            self.postMessage({
                type: 'progress',
                keysTested: keysTested,
                cube: null, // Don't send cube with progress updates
                key: ''
            });
            lastUpdateTime = now;
        }
    }
    
    self.postMessage({ 
        type: 'complete',
        keysTested: keysTested
    });
};
