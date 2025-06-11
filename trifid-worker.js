class TrifidWorker {
    constructor() {
        this.ngramStats = this.loadNgramStats();
        this.weights = { letters: 0.5, bigrams: 1.0, trigrams: 1.5, quadgrams: 2.0 };
        this.paused = false;
        this.shouldStop = false;
        this.lastProgressTime = 0;
    }

    loadNgramStats() {
        // Полная статистика n-грамм (сокращено для примера)
        return {
            letters: { 'E': 12.7, 'T': 9.1, 'A': 8.2, 'O': 7.5, /* ... */ },
            bigrams: { 'TH': 15.2, 'HE': 12.5, 'IN': 9.4, 'ER': 9.4, /* ... */ },
            trigrams: { 'THE': 18.1, 'AND': 7.3, 'ING': 7.2, 'ENT': 4.2, /* ... */ },
            quadgrams: { 'TION': 15.0, 'NTHE': 14.0, 'THER': 13.0, 'THAT': 12.0, /* ... */ }
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
        this.keysToTest = data.keysToTest || Math.pow(this.alphabet.length, this.keyLength);
        this.startIndex = data.startIndex || 0;
        this.keysTested = 0;
        this.keysPerSecond = 0;
        this.lastCalculationTime = 0;
        
        if (this.alphabet.length !== 27) {
            throw new Error('Alphabet must contain exactly 27 characters for Trifid cipher');
        }
    }

    async processKeys() {
        const BATCH_SIZE = 1000;
        const PROGRESS_INTERVAL = 1000; // 1 секунда
        let batchResults = [];
        let lastProgressTime = 0;
        let lastKeyTime = performance.now();
        let processedInSecond = 0;

        while (this.keysTested < this.keysToTest && !this.shouldStop) {
            if (this.paused) {
                await this.waitWhilePaused();
                continue;
            }

            const currentTime = performance.now();
            if (currentTime - lastKeyTime >= 1000) {
                this.keysPerSecond = processedInSecond;
                processedInSecond = 0;
                lastKeyTime = currentTime;
            }

            const key = this.generateKey(this.startIndex + this.keysTested);
            const result = this.processKey(key);
            
            if (result) batchResults.push(result);
            this.keysTested++;
            processedInSecond++;

            // Отправляем прогресс не реже чем раз в секунду
            const now = Date.now();
            if (batchResults.length >= BATCH_SIZE || 
                now - lastProgressTime >= PROGRESS_INTERVAL || 
                this.keysTested >= this.keysToTest) {
                
                this.sendResults(batchResults);
                batchResults = [];
                lastProgressTime = now;
            }

            // Даем циклу событий дышать
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
                    key,
                    text: plaintext,
                    score: score.total,
                    cube,
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
        const uniqueKeyChars = [...new Set(key.toUpperCase().split('')
            .filter(c => this.alphabet.includes(c)))];
        
        const remainingChars = this.alphabet.split('')
            .filter(c => !uniqueKeyChars.includes(c));
        
        const keyedAlphabet = [...uniqueKeyChars, ...remainingChars].join('');

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
        // Создаем карту символов в координаты
        const coordMap = new Map();
        for (let l = 0; l < 3; l++) {
            for (let r = 0; r < 3; r++) {
                for (let c = 0; c < 3; c++) {
                    const char = cube[l][r][c];
                    coordMap.set(char, [l, r, c]);
                }
            }
        }

        // Разбиваем на группы по периоду
        const groups = [];
        for (let i = 0; i < this.ciphertext.length; i += this.period) {
            groups.push(this.ciphertext.slice(i, i + this.period));
        }

        // Получаем все координаты
        const allCoords = [];
        for (const group of groups) {
            for (const char of group) {
                const coords = coordMap.get(char);
                if (coords) {
                    allCoords.push(...coords);
                }
            }
        }

        // Собираем расшифрованный текст
        let plaintext = '';
        for (let i = 0; i < allCoords.length; i += 3) {
            if (i + 2 >= allCoords.length) break;
            const l = allCoords[i];
            const r = allCoords[i + 1];
            const c = allCoords[i + 2];
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
        const counts = {
            letters: {},
            bigrams: {},
            trigrams: {},
            quadgrams: {}
        };

        // Подсчет букв
        for (const char of text) {
            counts.letters[char] = (counts.letters[char] || 0) + 1;
        }

        // Подсчет n-грамм
        for (let i = 0; i < text.length - 1; i++) {
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
        const weightSum = Object.values(this.weights).reduce((a, b) => a + b, 0);

        for (const type of ['letters', 'bigrams', 'trigrams', 'quadgrams']) {
            scores[type] = 0;

            for (const gram in counts[type]) {
                if (this.ngramStats[type][gram]) {
                    const expected = (this.ngramStats[type][gram] / 100) * (length / Math.pow(10, type.length - 1));
                    const observed = counts[type][gram];
                    scores[type] += Math.log10((observed + 1) / (expected + 1));
                }
            }

            total += scores[type] * (this.weights[type] / weightSum);
        }

        return { total, counts };
    }

    sendResults(results) {
        if (results.length > 0) {
            self.postMessage({
                type: 'results',
                results,
                keysTested: this.keysTested,
                keysPerSecond: this.keysPerSecond,
                workerId: this.workerId
            });
        }

        self.postMessage({
            type: 'progress',
            keysTested: this.keysTested,
            keysPerSecond: this.keysPerSecond,
            workerId: this.workerId
        });
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
        const MAX_PAUSE_TIME = 60000; // 1 минута максимум
        const startTime = Date.now();

        while (this.paused && !this.shouldStop) {
            if (Date.now() - startTime > MAX_PAUSE_TIME) {
                this.paused = false;
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}

// Инициализация воркера
const worker = new TrifidWorker();

self.onmessage = async (e) => {
    const { type, data } = e.data;

    try {
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
            case 'stop':
                worker.shouldStop = true;
                break;
        }
    } catch (error) {
        worker.sendError(error);
    }
};

self.onerror = (error) => {
    worker.sendError(error);
    return true; // Предотвращаем вывод ошибки по умолчанию
};
