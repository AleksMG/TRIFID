class TrifidWorker {
    constructor() {
        this.ngramStats = this.loadFullNgramStats();
        this.weights = {
            letters: 0.5,
            bigrams: 1.0,
            trigrams: 1.5,
            quadgrams: 2.0
        };
        this.paused = false;
        this.shouldStop = false;
        this.keysPerSecond = 0;
        this.lastCalculationTime = 0;
    }

    loadFullNgramStats() {
        return {
            letters: {
                'A': 8.167, 'B': 1.492, 'C': 2.782, 'D': 4.253, 'E': 12.702,
                'F': 2.228, 'G': 2.015, 'H': 6.094, 'I': 6.966, 'J': 0.153,
                'K': 0.772, 'L': 4.025, 'M': 2.406, 'N': 6.749, 'O': 7.507,
                'P': 1.929, 'Q': 0.095, 'R': 5.987, 'S': 6.327, 'T': 9.056,
                'U': 2.758, 'V': 0.978, 'W': 2.360, 'X': 0.150, 'Y': 1.974,
                'Z': 0.074, '?': 0.1
            },
            bigrams: {
                'TH': 1.52, 'HE': 1.28, 'IN': 0.94, 'ER': 0.94, 'AN': 0.82,
                'RE': 0.68, 'ND': 0.63, 'AT': 0.59, 'ON': 0.57, 'NT': 0.56,
                'HA': 0.56, 'ES': 0.56, 'ST': 0.55, 'EN': 0.55, 'ED': 0.53,
                'TO': 0.52, 'IT': 0.50, 'OU': 0.50, 'EA': 0.47, 'HI': 0.46,
                'IS': 0.46, 'OR': 0.43, 'TI': 0.34, 'AS': 0.33, 'TE': 0.27,
                'ET': 0.19, 'NG': 0.18, 'OF': 0.16, 'AL': 0.09, 'DE': 0.09,
                'SE': 0.08, 'LE': 0.08, 'SA': 0.06, 'SI': 0.05, 'AR': 0.04
            },
            trigrams: {
                'THE': 1.81, 'AND': 0.73, 'ING': 0.72, 'ENT': 0.42, 'ION': 0.42,
                'HER': 0.36, 'FOR': 0.34, 'THA': 0.33, 'NTH': 0.33, 'INT': 0.32,
                'ERE': 0.31, 'TIO': 0.31, 'TER': 0.30, 'EST': 0.28, 'ERS': 0.28,
                'ATI': 0.26, 'HAT': 0.26, 'ATE': 0.25, 'ALL': 0.25, 'ETH': 0.24,
                'HIS': 0.24, 'VER': 0.24, 'HES': 0.24, 'HIM': 0.23, 'OFT': 0.22,
                'ITH': 0.21, 'FTH': 0.21, 'STH': 0.21, 'OTH': 0.21, 'DTH': 0.21,
                'ONT': 0.20, 'EDT': 0.20, 'ARE': 0.20, 'REA': 0.19, 'EAR': 0.19,
                'RES': 0.19, 'CON': 0.19, 'EVE': 0.19, 'PER': 0.19, 'ECT': 0.19
            },
            quadgrams: {
                'TION': 0.31, 'NTHE': 0.27, 'THER': 0.24, 'THAT': 0.21,
                'OFTH': 0.19, 'FTHE': 0.19, 'THES': 0.18, 'WITH': 0.18,
                'INTH': 0.17, 'ATIO': 0.17, 'OTHE': 0.16, 'ETHE': 0.15,
                'TOTH': 0.15, 'DTHE': 0.15, 'INGT': 0.15, 'SAND': 0.14,
                'STHE': 0.14, 'HERE': 0.14, 'THEC': 0.14, 'MENT': 0.14,
                'THEM': 0.13, 'THEP': 0.13, 'RTHE': 0.13, 'TAND': 0.13,
                'THEY': 0.13, 'NGTH': 0.13, 'IONS': 0.13, 'EDTH': 0.12,
                'ANDT': 0.12, 'OFTHE': 0.12, 'TIVE': 0.12, 'FROM': 0.12,
                'THIS': 0.12, 'TING': 0.12, 'THEI': 0.12, 'WHIC': 0.11,
                'HICH': 0.11, 'INCE': 0.11, 'ECTI': 0.11, 'HAVE': 0.11,
                'CTIO': 0.11, 'SSIO': 0.11, 'COMM': 0.11, 'LLY': 0.10
            }
        };
    }

    async start(data) {
        try {
            this.initParams(data);
            await this.processKeys();
            this.sendCompletion();
        } catch (error) {
            this.sendError(error);
        }
    }

    initParams(data) {
        this.ciphertext = data.ciphertext.replace(/[^A-Z?*]/g, '').toUpperCase();
        this.alphabet = data.alphabet.toUpperCase();
        this.keyLength = parseInt(data.keyLength) || 5;
        this.period = parseInt(data.period) || 5;
        this.knownPlaintext = data.knownPlaintext?.toUpperCase();
        this.workerId = data.workerId || 0;
        
        if (this.alphabet.length !== 27) {
            throw new Error('Alphabet must contain exactly 27 characters');
        }

        this.keysToTest = data.keysToTest || Math.pow(this.alphabet.length, this.keyLength);
        this.startIndex = data.startIndex || 0;
        this.keysTested = 0;
    }

    async processKeys() {
        const BATCH_SIZE = 1000;
        let batchResults = [];
        let lastProgressTime = 0;

        while (this.keysTested < this.keysToTest && !this.shouldStop) {
            if (this.paused) {
                await this.waitWhilePaused();
                continue;
            }

            const key = this.generateKey(this.startIndex + this.keysTested);
            const result = this.processKey(key);
            
            if (result) batchResults.push(result);
            this.keysTested++;

            if (batchResults.length >= BATCH_SIZE || 
                Date.now() - lastProgressTime >= 1000 || 
                this.keysTested >= this.keysToTest) {
                
                this.sendResults(batchResults);
                batchResults = [];
                lastProgressTime = Date.now();
            }

            if (this.keysTested % 100 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    }

    generateKey(index) {
        let key = '';
        let remaining = index;
        
        for (let i = 0; i < this.keyLength; i++) {
            const charIndex = remaining % this.alphabet.length;
            key = this.alphabet[charIndex] + key;
            remaining = Math.floor(remaining / this.alphabet.length);
        }
        
        return key;
    }

    processKey(key) {
        try {
            const cube = this.generateCube(key);
            const plaintext = this.decrypt(cube);
            const score = this.scoreText(plaintext);

            if (!this.knownPlaintext || plaintext.includes(this.knownPlaintext)) {
                return {
                    key: key,
                    text: plaintext,
                    score: score.total,
                    cube: cube,
                    counts: score.counts,
                    workerId: this.workerId
                };
            }
            return null;
        } catch (error) {
            console.error(`Error processing key ${key}:`, error);
            return null;
        }
    }

    generateCube(key) {
        const uniqueKeyChars = [];
        const seenChars = new Set();
        
        for (const char of key.toUpperCase()) {
            if (this.alphabet.includes(char) && !seenChars.has(char)) {
                uniqueKeyChars.push(char);
                seenChars.add(char);
            }
        }

        const remainingChars = [];
        for (const char of this.alphabet) {
            if (!seenChars.has(char)) {
                remainingChars.push(char);
            }
        }

        const keyedAlphabet = uniqueKeyChars.concat(remainingChars).join('');
        const cube = [[[], [], []], [[], [], []], [[], [], []]];
        
        for (let i = 0; i < 27; i++) {
            const layer = Math.floor(i / 9);
            const row = Math.floor((i % 9) / 3);
            const col = i % 3;
            cube[layer][row][col] = keyedAlphabet[i % keyedAlphabet.length];
        }
        
        return cube;
    }

    decrypt(cube) {
        const coordMap = new Map();
        for (let layer = 0; layer < 3; layer++) {
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3; col++) {
                    coordMap.set(cube[layer][row][col], [layer, row, col]);
                }
            }
        }

        const groups = [];
        for (let i = 0; i < this.ciphertext.length; i += this.period) {
            groups.push(this.ciphertext.slice(i, i + this.period));
        }

        const allCoords = [];
        for (const group of groups) {
            for (const char of group) {
                const coords = coordMap.get(char);
                if (coords) allCoords.push(...coords);
            }
        }

        let plaintext = '';
        for (let i = 0; i < allCoords.length; i += 3) {
            if (i + 2 >= allCoords.length) break;
            const [l, r, c] = [allCoords[i], allCoords[i+1], allCoords[i+2]];
            plaintext += cube[l][r][c];
        }

        return plaintext;
    }

    scoreText(text) {
        const cleanText = text.toUpperCase().replace(/[^A-Z]/g, '');
        if (cleanText.length === 0) return { total: -Infinity, counts: {} };
        
        const counts = this.countNGrams(cleanText);
        return this.calculateScore(counts, cleanText.length);
    }

    countNGrams(text) {
        const counts = { letters: {}, bigrams: {}, trigrams: {}, quadgrams: {} };

        for (const char of text) {
            counts.letters[char] = (counts.letters[char] || 0) + 1;
        }

        for (let i = 0; i < text.length; i++) {
            if (i < text.length - 1) {
                const bigram = text.substr(i, 2);
                counts.bigrams[bigram] = (counts.bigrams[bigram] || 0) + 1;
            }
            if (i < text.length - 2) {
                const trigram = text.substr(i, 3);
                counts.trigrams[trigram] = (counts.trigrams[trigram] || 0) + 1;
            }
            if (i < text.length - 3) {
                const quadgram = text.substr(i, 4);
                counts.quadgrams[quadgram] = (counts.quadgrams[quadgram] || 0) + 1;
            }
        }

        return counts;
    }

    calculateScore(counts, length) {
        let total = 0;
        const weightSum = Object.values(this.weights).reduce((a, b) => a + b, 0);

        // Letters score
        let lettersScore = 0;
        for (const char in counts.letters) {
            if (this.ngramStats.letters[char]) {
                const expected = (this.ngramStats.letters[char] / 100) * length;
                lettersScore += Math.log10((counts.letters[char] + 1) / (expected + 1));
            }
        }

        // Bigrams score
        let bigramsScore = 0;
        for (const gram in counts.bigrams) {
            if (this.ngramStats.bigrams[gram]) {
                const expected = (this.ngramStats.bigrams[gram] / 100) * (length - 1);
                bigramsScore += Math.log10((counts.bigrams[gram] + 1) / (expected + 1));
            }
        }

        // Trigrams score
        let trigramsScore = 0;
        for (const gram in counts.trigrams) {
            if (this.ngramStats.trigrams[gram]) {
                const expected = (this.ngramStats.trigrams[gram] / 100) * (length - 2);
                trigramsScore += Math.log10((counts.trigrams[gram] + 1) / (expected + 1));
            }
        }

        // Quadgrams score
        let quadgramsScore = 0;
        for (const gram in counts.quadgrams) {
            if (this.ngramStats.quadgrams[gram]) {
                const expected = (this.ngramStats.quadgrams[gram] / 100) * (length - 3);
                quadgramsScore += Math.log10((counts.quadgrams[gram] + 1) / (expected + 1));
            }
        }

        total = (
            lettersScore * this.weights.letters +
            bigramsScore * this.weights.bigrams +
            trigramsScore * this.weights.trigrams +
            quadgramsScore * this.weights.quadgrams
        ) / weightSum;

        return { 
            total, 
            counts: {
                letters: Object.keys(counts.letters).length,
                bigrams: Object.keys(counts.bigrams).length,
                trigrams: Object.keys(counts.trigrams).length,
                quadgrams: Object.keys(counts.quadgrams).length
            }
        };
    }

    sendResults(results) {
        if (results.length > 0) {
            self.postMessage({
                type: 'results',
                results: results,
                keysTested: this.keysTested,
                workerId: this.workerId
            });
        }
    }

    sendCompletion() {
        self.postMessage({
            type: 'complete',
            keysTested: this.keysTested,
            workerId: this.workerId
        });
    }

    sendError(error) {
        self.postMessage({
            type: 'error',
            error: error.message,
            workerId: this.workerId
        });
    }

    async waitWhilePaused() {
        while (this.paused && !this.shouldStop) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}

const worker = new TrifidWorker();

self.onmessage = async (e) => {
    const { type, data } = e.data;
    try {
        switch (type) {
            case 'start': await worker.start(data); break;
            case 'pause': worker.paused = true; break;
            case 'resume': worker.paused = false; break;
            case 'stop': worker.shouldStop = true; break;
        }
    } catch (error) {
        worker.sendError(error);
    }
};
