// trifid-worker.js
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
        this.keysTested = 0;
    }

    loadFullNgramStats() {
        return {
            letters: {
                'A': 8.167, 'B': 1.492, 'C': 2.782, 'D': 4.253, 'E': 12.702,
                'F': 2.228, 'G': 2.015, 'H': 6.094, 'I': 6.966, 'J': 0.153,
                'K': 0.772, 'L': 4.025, 'M': 2.406, 'N': 6.749, 'O': 7.507,
                'P': 1.929, 'Q': 0.095, 'R': 5.987, 'S': 6.327, 'T': 9.056,
                'U': 2.758, 'V': 0.978, 'W': 2.360, 'X': 0.150, 'Y': 1.974,
                'Z': 0.074, '?': 0.1, '*': 0.1
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
            this.validateInput(data);
            this.initParams(data);
            
            const results = [];
            for (let i = 0; i < this.keysToTest && !this.shouldStop; i++) {
                if (this.paused) await this.waitWhilePaused();
                
                const key = this.generateKey(this.startIndex + i);
                const result = this.processKey(key);
                if (result) results.push(result);
                this.keysTested++;

                if (results.length >= 100 || i === this.keysToTest - 1) {
                    self.postMessage({
                        type: 'results',
                        results: results,
                        keysTested: this.keysTested
                    });
                    results.length = 0;
                }
            }

            self.postMessage({ type: 'complete', keysTested: this.keysTested });
        } catch (error) {
            this.sendError(error);
        }
    }

    validateInput(data) {
        if (!data.ciphertext || typeof data.ciphertext !== 'string') {
            throw new Error('Неверный шифротекст');
        }
        if (!data.alphabet || data.alphabet.length !== 27) {
            throw new Error('Алфавит должен содержать 27 символов');
        }
        if (isNaN(data.keyLength) || data.keyLength < 1) {
            throw new Error('Неверная длина ключа');
        }
    }

    initParams(data) {
        this.ciphertext = data.ciphertext.toUpperCase().replace(/[^A-Z?*]/g, '');
        this.alphabet = data.alphabet.toUpperCase();
        this.keyLength = parseInt(data.keyLength);
        this.period = parseInt(data.period) || 5;
        this.knownPlaintext = data.knownPlaintext?.toUpperCase();
        this.keysToTest = data.keysToTest || Math.pow(this.alphabet.length, this.keyLength);
        this.startIndex = data.startIndex || 0;
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
                    key,
                    text: plaintext,
                    score: score.total,
                    cube,
                    counts: score.counts
                };
            }
            return null;
        } catch (error) {
            console.error(`Ошибка обработки ключа ${key}:`, error);
            return null;
        }
    }

    generateCube(key) {
        const uniqueKeyChars = [...new Set(key.toUpperCase().split('').filter(c => this.alphabet.includes(c)))];
        const remainingChars = this.alphabet.split('').filter(c => !uniqueKeyChars.includes(c));
        const keyedAlphabet = [...uniqueKeyChars, ...remainingChars].join('');

        const cube = [[[], [], []], [[], [], []], [[], [], []]];
        for (let i = 0; i < 27; i++) {
            const layer = Math.floor(i / 9);
            const row = Math.floor((i % 9) / 3);
            const col = i % 3;
            cube[layer][row][col] = keyedAlphabet[i];
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

        const allCoords = [];
        for (let i = 0; i < this.ciphertext.length; i += this.period) {
            const group = this.ciphertext.slice(i, i + this.period);
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

        const counts = {
            letters: {},
            bigrams: {},
            trigrams: {},
            quadgrams: {}
        };

        // Подсчёт n-грамм
        for (let i = 0; i < cleanText.length; i++) {
            const char = cleanText[i];
            counts.letters[char] = (counts.letters[char] || 0) + 1;

            if (i < cleanText.length - 1) {
                const bigram = cleanText.substr(i, 2);
                counts.bigrams[bigram] = (counts.bigrams[bigram] || 0) + 1;
            }
            if (i < cleanText.length - 2) {
                const trigram = cleanText.substr(i, 3);
                counts.trigrams[trigram] = (counts.trigrams[trigram] || 0) + 1;
            }
            if (i < cleanText.length - 3) {
                const quadgram = cleanText.substr(i, 4);
                counts.quadgrams[quadgram] = (counts.quadgrams[quadgram] || 0) + 1;
            }
        }

        // Расчёт оценки
        let total = 0;
        const weightSum = Object.values(this.weights).reduce((a, b) => a + b, 0);

        for (const [type, weight] of Object.entries(this.weights)) {
            let typeScore = 0;
            for (const gram in counts[type]) {
                if (this.ngramStats[type][gram]) {
                    const expected = (this.ngramStats[type][gram] / 100) * (cleanText.length - gram.length + 1);
                    const observed = counts[type][gram];
                    typeScore += Math.log10((observed + 1) / (expected + 1));
                }
            }
            total += typeScore * weight;
        }

        return {
            total: total / weightSum,
            counts: {
                letters: Object.keys(counts.letters).length,
                bigrams: Object.keys(counts.bigrams).length,
                trigrams: Object.keys(counts.trigrams).length,
                quadgrams: Object.keys(counts.quadgrams).length
            }
        };
    }

    async waitWhilePaused() {
        while (this.paused && !this.shouldStop) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    sendError(error) {
        self.postMessage({
            type: 'error',
            error: error.message,
            stack: error.stack
        });
    }
}

self.onmessage = async (e) => {
    const worker = new TrifidWorker();
    try {
        switch (e.data.type) {
            case 'start': await worker.start(e.data); break;
            case 'pause': worker.paused = true; break;
            case 'resume': worker.paused = false; break;
            case 'stop': worker.shouldStop = true; break;
        }
    } catch (error) {
        worker.sendError(error);
    }
};
