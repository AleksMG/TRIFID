// Trifid Cipher Worker
const ENGLISH_TRIGRAMS = {
    "THE": 0.0181, "AND": 0.0073, "ING": 0.0072, "ENT": 0.0042, "ION": 0.0042,
    "HER": 0.0036, "FOR": 0.0034, "THA": 0.0033, "NTH": 0.0033, "INT": 0.0032,
    "ERE": 0.0031, "TIO": 0.0031, "TER": 0.0030, "EST": 0.0028, "ERS": 0.0028,
    "ATI": 0.0026, "HAT": 0.0026, "ATE": 0.0025, "ALL": 0.0025, "ETH": 0.0024,
    "HIS": 0.0024, "VER": 0.0024, "ITH": 0.0023, "STH": 0.0023, "OTH": 0.0022
};

// Score text based on trigram frequency
function scoreText(text) {
    let score = 0;
    text = text.toUpperCase();
    for (let i = 0; i < text.length - 2; i++) {
        const trigram = text.substr(i, 3);
        if (ENGLISH_TRIGRAMS[trigram]) {
            score += ENGLISH_TRIGRAMS[trigram];
        }
    }
    return score / (text.length / 3);
}

// Generate Trifid cube
function generateCube(alphabet, size) {
    const cube = [];
    for (let layer = 0; layer < size; layer++) {
        cube.push([]);
        for (let row = 0; row < size; row++) {
            cube[layer].push([]);
            for (let col = 0; col < size; col++) {
                const index = layer * size * size + row * size + col;
                cube[layer][row][col] = alphabet[index % alphabet.length];
            }
        }
    }
    return cube;
}

// Generate key based on pattern
function generateKey(pattern, index, workerId, totalWorkers) {
    // This is a simplified key generation for demonstration
    // In a real implementation, you would generate actual Trifid keys
    
    if (pattern === 'sequential') {
        return 'KEY' + index.toString().padStart(6, '0');
    } else if (pattern === 'random') {
        return 'RND' + Math.random().toString(36).substring(2, 8).toUpperCase();
    } else {
        // Default pattern combines worker ID and index
        return `W${workerId}K${index.toString(36).toUpperCase()}`;
    }
}

// Full Trifid decryption with key
function decryptTrifid(ciphertext, cube, key) {
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
    
    // Apply key permutation to cube
    if (key && key.length > 0) {
        // Key-based cube permutation would go here
        // This is a simplified version for demonstration
    }
    
    let decrypted = "";
    const groupSize = size;
    
    for (let i = 0; i < ciphertext.length; i += groupSize) {
        const group = ciphertext.substr(i, groupSize);
        if (group.length < groupSize) break;
        
        // Extract coordinates
        const coordsGroup = [];
        for (let j = 0; j < groupSize; j++) {
            const char = group[j];
            coordsGroup.push(coords[char] || [0, 0, 0]);
        }
        
        // Reconstruct plaintext
        for (let j = 0; j < groupSize; j++) {
            const l = coordsGroup[j][0];
            const r = coordsGroup[(j + 1) % groupSize][1];
            const c = coordsGroup[(j + 2) % groupSize][2];
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
    
    const cube = generateCube(alphabet, cubeSize);
    let bestScore = -Infinity;
    let bestText = "";
    let bestKey = "";
    
    for (let i = 0; i < keysToTest; i++) {
        // Generate test key based on search mode
        let testKey;
        if (searchMode === 'full') {
            testKey = generateKey('full', i, workerId, totalWorkers);
        } else if (searchMode === 'partial') {
            testKey = generateKey('partial', i, workerId, totalWorkers).substring(0, keyLength);
        } else {
            testKey = generateKey('known', i, workerId, totalWorkers);
        }
        
        // Decrypt with current key
        const decrypted = decryptTrifid(ciphertext, cube, testKey);
        const score = scoreText(decrypted);
        
        // Check for known plaintext if provided
        let valid = true;
        if (knownPlaintext && knownPlaintext.length > 0) {
            valid = decrypted.includes(knownPlaintext);
        }
        
        // Send progress update every 100 keys
        if (i % 100 === 0) {
            self.postMessage({
                type: 'progress',
                progress: Math.min(100, (i / keysToTest) * 100),
                keysTested: i
            });
        }
        
        // Send result if it's good
        if (valid && score > bestScore * 0.9) { // Send anything close to best
            bestScore = score;
            bestText = decrypted;
            bestKey = testKey;
            
            self.postMessage({
                type: 'result',
                key: testKey,
                text: decrypted,
                score: score
            });
        }
    }
    
    self.postMessage({ type: 'complete' });
};
