// Trifid Cipher Worker Implementation

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
    "ATI": 0.0026, "HAT": 0.0026, "ATE": 0.0025, "ALL": 0.0025, "ETH": 0.0024,
    "HIS": 0.0024, "VER": 0.0024, "ITH": 0.0023, "STH": 0.0023, "OTH": 0.0022
};

// Score text based on letter and trigram frequency
function scoreText(text) {
    // Letter frequency score
    let letterScore = 0;
    const letterCounts = {};
    let totalLetters = 0;
    
    for (const char of text.toUpperCase()) {
        if (ENGLISH_FREQUENCY[char]) {
            letterCounts[char] = (letterCounts[char] || 0) + 1;
            totalLetters++;
        }
    }
    
    // Calculate chi-squared statistic
    for (const char in ENGLISH_FREQUENCY) {
        const expected = ENGLISH_FREQUENCY[char] * totalLetters;
        const observed = letterCounts[char] || 0;
        const difference = observed - expected;
        letterScore += (difference * difference) / expected;
    }
    
    // Invert so higher is better
    letterScore = 1 / (1 + letterScore);
    
    // Trigram score
    let trigramScore = 0;
    text = text.toUpperCase();
    for (let i = 0; i < text.length - 2; i++) {
        const trigram = text.substr(i, 3);
        if (ENGLISH_TRIGRAMS[trigram]) {
            trigramScore += ENGLISH_TRIGRAMS[trigram];
        }
    }
    
    // Normalize trigram score by text length
    trigramScore = trigramScore / (text.length / 3);
    
    // Combined score (weighted)
    return (letterScore * 0.3 + trigramScore * 0.7) * 100;
}

// Generate Trifid cube with key-based permutation
function generateCube(alphabet, size, key = '') {
    const cube = [];
    const cubeSize = size * size * size;
    
    // Create keyed alphabet
    let keyedAlphabet = '';
    const usedChars = new Set();
    
    // Add key characters first (without duplicates)
    for (const char of key.toUpperCase()) {
        if (!usedChars.has(char) && alphabet.includes(char)) {
            keyedAlphabet += char;
            usedChars.add(char);
        }
    }
    
    // Add remaining alphabet characters
    for (const char of alphabet) {
        if (!usedChars.has(char)) {
            keyedAlphabet += char;
        }
    }
    
    // Fill the cube
    for (let layer = 0; layer < size; layer++) {
        cube.push([]);
        for (let row = 0; row < size; row++) {
            cube[layer].push([]);
            for (let col = 0; col < size; col++) {
                const index = layer * size * size + row * size + col;
                cube[layer][row][col] = keyedAlphabet[index % keyedAlphabet.length];
            }
        }
    }
    
    return cube;
}

// Generate random key of specified length
function generateRandomKey(length, alphabet) {
    let key = '';
    for (let i = 0; i < length; i++) {
        key += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return key;
}

// Generate sequential key for exhaustive search
function generateSequentialKey(index, alphabet, keyLength) {
    let key = '';
    for (let i = 0; i < keyLength; i++) {
        key += alphabet[index % alphabet.length];
        index = Math.floor(index / alphabet.length);
    }
    return key;
}

// Full Trifid decryption with key
function decryptTrifid(ciphertext, cube, key, period = 5) {
    const size = cube.length;
    const coords = {};
    
    // Build coordinate map
    for (let l = 0; l < size; l++) {
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                coords[cube[l][r][c]] = [l, r, c];
            }
        }
    }
    
    let decrypted = '';
    const groupSize = period;
    
    // Process ciphertext in groups
    for (let i = 0; i < ciphertext.length; i += groupSize) {
        const group = ciphertext.substr(i, groupSize);
        if (group.length === 0) break;
        
        // Extract coordinates for each character in group
        const layers = [];
        const rows = [];
        const cols = [];
        
        for (const char of group) {
            const coord = coords[char];
            if (coord) {
                layers.push(coord[0]);
                rows.push(coord[1]);
                cols.push(coord[2]);
            } else {
                // Handle missing characters (use first layer as default)
                layers.push(0);
                rows.push(0);
                cols.push(0);
            }
        }
        
        // Reconstruct plaintext from coordinates
        for (let j = 0; j < group.length; j++) {
            const l = layers[j];
            const r = rows[j];
            const c = cols[j];
            decrypted += cube[l][r][c];
        }
    }
    
    return decrypted;
}

// Main worker function
self.onmessage = function(e) {
    const { 
        type, 
        ciphertext, 
        alphabet, 
        cubeSize, 
        searchMode, 
        knownPlaintext, 
        keyLength,
        workerId,
        totalWorkers,
        keysToTest
    } = e.data;
    
    if (type !== 'start') return;
    
    let bestScore = -Infinity;
    let bestText = '';
    let bestKey = '';
    let keysTested = 0;
    const startTime = performance.now();
    
    // Generate base cube without key permutation
    const baseCube = generateCube(alphabet, cubeSize);
    
    // Main cracking loop
    for (let i = 0; i < keysToTest; i++) {
        // Generate test key based on search mode
        let testKey;
        if (searchMode === 'full') {
            testKey = generateRandomKey(10, alphabet);
        } else if (searchMode === 'partial') {
            testKey = generateSequentialKey(i, alphabet, keyLength);
        } else {
            // Known plaintext mode - generate keys that might contain the known text
            testKey = generateRandomKey(keyLength, alphabet);
        }
        
        // Generate cube with key permutation
        const cube = generateCube(alphabet, cubeSize, testKey);
        
        // Decrypt with current key
        const decrypted = decryptTrifid(ciphertext, cube, testKey);
        const score = scoreText(decrypted);
        
        // Check for known plaintext if provided
        let valid = true;
        if (knownPlaintext && knownPlaintext.length > 0) {
            valid = decrypted.includes(knownPlaintext);
        }
        
        // Send progress update periodically
        keysTested++;
        if (keysTested % 100 === 0 || i === keysToTest - 1) {
            self.postMessage({
                type: 'progress',
                keysTested: keysTested,
                progress: (i / keysToTest) * 100
            });
        }
        
        // Send result if it's good
        if (valid && score > bestScore * 0.9) { // Send anything close to best
            if (score > bestScore) {
                bestScore = score;
                bestText = decrypted;
                bestKey = testKey;
            }
            
            self.postMessage({
                type: 'result',
                key: testKey,
                text: decrypted,
                score: score
            });
        }
    }
    
    self.postMessage({ 
        type: 'complete',
        keysTested: keysTested
    });
};
