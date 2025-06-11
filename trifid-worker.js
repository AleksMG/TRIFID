// trifid-worker.js

class TrifidWorker {
    constructor() {
        this.ngramStats = this.loadNgramStats();
        this.weights = { letters: 0.1, bigrams: 0.2, trigrams: 0.3, quadgrams: 0.4 };
        this.paused = false;
    }

    loadNgramStats() {
        return {
            letters: { 'E': 12.7, 'T': 9.1, 'A': 8.2, 'O': 7.5, ... },
            bigrams: { 'TH': 15.2, 'HE': 12.5, 'IN': 9.4, 'ER': 9.4, ... },
            trigrams: { 'THE': 18.1, 'AND': 7.3, 'ING': 7.2, 'ENT': 4.2, ... },
            quadgrams: { 'TION': 15.0, 'NTHE': 14.0, 'THER': 13.0, 'THAT': 12.0, ... }
        };
    }

    async start(data) {
        this.initParams(data);
        await this.processKeys();
        self.postMessage({ type: 'complete', keysTested: this.keysTested });
    }

    initParams(data) {
        this.ciphertext = data.ciphertext.replace(/\s/g, '');
        this.alphabet = data.alphabet;
        this.keyLength = data.keyLength;
        this.period = data.period;
        this.knownPlaintext = data.knownPlaintext?.toUpperCase();
        this.workerId = data.workerId;
        this.keysToTest = data.keysToTest;
        this.startIndex = data.startIndex;
        this.keysTested = 0;
    }

    async processKeys() {
        const batchSize = 5000;
        let batchResults = [];

        while (this.keysTested < this.keysToTest) {
            if (this.paused) await this.waitWhilePaused();
            
            const key = this.generateKey(this.startIndex + this.keysTested);
            const result = this.processKey(key);
            
            if (result) batchResults.push(result);
            this.keysTested++;

            if (batchResults.length >= batchSize || this.keysTested >= this.keysToTest) {
                this.sendResults(batchResults);
                batchResults = [];
            }
        }
    }

    generateKey(index) {
        let key = '';
        for (let i = 0; i < this.keyLength; i++) {
            key += this.alphabet[index % this.alphabet.length];
            index = Math.floor(index / this.alphabet.length);
        }
        return key;
    }

    processKey(key) {
        const cube = this.generateCube(key);
        const plaintext = this.decrypt(cube);
        const score = this.scoreText(plaintext);

        if (!this.knownPlaintext || plaintext.includes(this.knownPlaintext)) {
            return {
                key,
                text: plaintext,
                score: score.total,
                cube,
                counts: score.counts
            };
        }
        return null;
    }

    generateCube(key) {
        const keyChars = [...new Set(key.toUpperCase().split('').filter(c => this.alphabet.includes(c)))];
        const remainingChars = this.alphabet.split('').filter(c => !keyChars.includes(c));
        const keyedAlphabet = [...keyChars, ...remainingChars].join('');

        const cube = [];
        for (let i = 0; i < 27; i++) {
            const layer = Math.floor(i / 9);
            const row = Math.floor((i % 9) / 3);
            const col = i % 3;
            
            if (!cube[layer]) cube[layer] = [];
            if (!cube[layer][row]) cube[layer][row] = [];
            
            cube[layer][row][col] = keyedAlphabet[i % keyedAlphabet.length];
        }
        return cube;
    }

    decrypt(cube) {
        const coordMap = new Map();
        for (let l = 0; l < 3; l++) {
            for (let r = 0; r < 3; r++) {
                for (let c = 0; c < 3; c++) {
                    coordMap.set(cube[l][r][c], [l, r, c]);
                }
            }
        }

        const groups = [];
        for (let i = 0; i < this.ciphertext.length; i += this.period) {
            groups.push(this.ciphertext.slice(i, i + this.period));
        }

        const allCoords = groups.flatMap(group => 
            [...group].map(c => coordMap.get(c) || [0, 0, 0])
        ).flat();

        let plaintext = '';
        for (let i = 0; i < allCoords.length; i += 3) {
            if (i + 2 >= allCoords.length) break;
            plaintext += cube[allCoords[i]][allCoords[i+1]][allCoords[i+2]];
        }

        return plaintext;
    }

    scoreText(text) {
        const cleanText = text.toUpperCase().replace(/[^A-Z?*]/g, '');
        const counts = this.countNGrams(cleanText);
        return this.calculateScore(counts, cleanText.length);
    }

    countNGrams(text) {
        const counts = { letters: {}, bigrams: {}, trigrams: {}, quadgrams: {} };
        
        for (let i = 0; i < text.length; i++) {
            counts.letters[text[i]] = (counts.letters[text[i]] || 0) + 1;
            
            if (i < text.length - 1) {
                const bigram = text.substr(i, 2);
                if (this.ngramStats.bigrams[bigram]) {
                    counts.bigrams[bigram] = (counts.bigrams[bigram] || 0) + 1;
                }
            }
            
            if (i < text.length - 2) {
                const trigram = text.substr(i, 3);
                if (this.ngramStats.trigrams[trigram]) {
                    counts.trigrams[trigram] = (counts.trigrams[trigram] || 0) + 1;
                }
            }
            
            if (i < text.length - 3) {
                const quadgram = text.substr(i, 4);
                if (this.ngramStats.quadgrams[quadgram]) {
                    counts.quadgrams[quadgram] = (counts.quadgrams[quadgram] || 0) + 1;
                }
            }
        }
        
        return counts;
    }

    calculateScore(counts, length) {
        const scores = {};
        let total = 0;
        
        for (const type of ['letters', 'bigrams', 'trigrams', 'quadgrams']) {
            scores[type] = 0;
            
            for (const gram in counts[type]) {
                const expected = this.ngramStats[type][gram] * (length / (10 ** (type.length + 2)));
                scores[type] += Math.min(counts[type][gram], expected * 1.5);
            }
            
            total += scores[type] * this.weights[type];
        }
        
        return { total, counts };
    }

    sendResults(results) {
        if (results.length > 0) {
            self.postMessage({
                type: 'results',
                results,
                keysTested: this.keysTested,
                workerId: this.workerId
            });
        }
        
        self.postMessage({
            type: 'progress',
            keysTested: this.keysTested,
            workerId: this.workerId
        });
    }

    async waitWhilePaused() {
        while (this.paused) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}

const worker = new TrifidWorker();

self.onmessage = async (e) => {
    const { type, data } = e.data;
    
    switch (type) {
        case 'start':
            await worker.start(data);
            break;
        case 'pause':
            worker.paused = true;
            break;
        case 'resume':
            worker.paused = false;
            break;
    }
};
