class TrifidWorker {
    constructor() {
        // Инициализация статистики n-грамм
        this.ngramStats = this.loadFullNgramStats();
        
        // Веса для различных типов n-грамм
        this.weights = {
            letters: 0.5,
            bigrams: 1.0,
            trigrams: 1.5,
            quadgrams: 2.0
        };
        
        // Флаги управления состоянием воркера
        this.paused = false;
        this.shouldStop = false;
        
        // Статистика производительности
        this.keysPerSecond = 0;
        this.lastCalculationTime = 0;
    }

    // Полная загрузка статистики n-грамм английского языка
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
        // Очистка и нормализация входных данных
        this.ciphertext = data.ciphertext.replace(/[^A-Z?*]/g, '').toUpperCase();
        this.alphabet = data.alphabet.toUpperCase();
        this.keyLength = parseInt(data.keyLength) || 5;
        this.period = parseInt(data.period) || 5;
        this.knownPlaintext = data.knownPlaintext?.toUpperCase();
        this.workerId = data.workerId || 0;
        
        // Расчет общего количества ключей для проверки
        const totalPossibleKeys = Math.pow(this.alphabet.length, this.keyLength);
        this.keysToTest = data.keysToTest || totalPossibleKeys;
        this.startIndex = data.startIndex || 0;
        
        // Сброс счетчиков
        this.keysTested = 0;
        this.keysPerSecond = 0;
        this.lastCalculationTime = 0;
        
        // Валидация алфавита
        if (this.alphabet.length !== 27) {
            throw new Error('Alphabet must contain exactly 27 characters for Trifid cipher');
        }
    }

    async processKeys() {
        const BATCH_SIZE = 1000;
        const PROGRESS_INTERVAL = 1000; // Отправлять прогресс каждую секунду
        let batchResults = [];
        let lastProgressTime = 0;
        let lastKeyTime = performance.now();
        let processedInSecond = 0;

        while (this.keysTested < this.keysToTest && !this.shouldStop) {
            if (this.paused) {
                await this.waitWhilePaused();
                continue;
            }

            // Расчет скорости обработки (ключей в секунду)
            const currentTime = performance.now();
            if (currentTime - lastKeyTime >= 1000) {
                this.keysPerSecond = processedInSecond;
                processedInSecond = 0;
                lastKeyTime = currentTime;
            }

            // Генерация и обработка ключа
            const key = this.generateKey(this.startIndex + this.keysTested);
            const result = this.processKey(key);
            
            if (result) batchResults.push(result);
            this.keysTested++;
            processedInSecond++;

            // Отправка промежуточных результатов
            const now = Date.now();
            if (batchResults.length >= BATCH_SIZE || 
                now - lastProgressTime >= PROGRESS_INTERVAL || 
                this.keysTested >= this.keysToTest) {
                
                this.sendResults(batchResults);
                batchResults = [];
                lastProgressTime = now;
            }

            // Периодически даем циклу событий дышать
            if (this.keysTested % 100 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
    }

    generateKey(index) {
        let key = '';
        let remaining = index;
        
        // Генерация ключа заданной длины
        for (let i = 0; i < this.keyLength; i++) {
            const charIndex = remaining % this.alphabet.length;
            key = this.alphabet[charIndex] + key; // Добавляем символы в начало
            remaining = Math.floor(remaining / this.alphabet.length);
        }
        
        return key;
    }

    processKey(key) {
        try {
            // Генерация куба на основе ключа
            const cube = this.generateCube(key);
            
            // Дешифровка текста
            const plaintext = this.decrypt(cube);
            
            // Оценка качества расшифровки
            const score = this.scoreText(plaintext);

            // Проверка на соответствие известному тексту (если задан)
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
        // Уникальные символы ключа в порядке их появления
        const uniqueKeyChars = [];
        const seenChars = new Set();
        
        for (const char of key.toUpperCase()) {
            if (this.alphabet.includes(char) && !seenChars.has(char)) {
                uniqueKeyChars.push(char);
                seenChars.add(char);
            }
        }

        // Оставшиеся символы алфавита
        const remainingChars = [];
        for (const char of this.alphabet) {
            if (!seenChars.has(char)) {
                remainingChars.push(char);
            }
        }

        // Объединенный алфавит с приоритетом ключевых символов
        const keyedAlphabet = uniqueKeyChars.concat(remainingChars).join('');

        // Построение 3D куба 3x3x3
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
        // Создание карты символов в координаты
        const coordMap = new Map();
        for (let layer = 0; layer < 3; layer++) {
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3; col++) {
                    const char = cube[layer][row][col];
                    coordMap.set(char, [layer, row, col]);
                }
            }
        }

        // Разбиение шифротекста на группы по периоду
        const groups = [];
        for (let i = 0; i < this.ciphertext.length; i += this.period) {
            groups.push(this.ciphertext.slice(i, i + this.period));
        }

        // Преобразование символов в координаты
        const allCoords = [];
        for (const group of groups) {
            for (const char of group) {
                const coords = coordMap.get(char);
                if (coords) {
                    allCoords.push(...coords);
                }
            }
        }

        // Сборка расшифрованного текста из координат
        let plaintext = '';
        for (let i = 0; i < allCoords.length; i += 3) {
            if (i + 2 >= allCoords.length) break;
            
            const layer = allCoords[i];
            const row = allCoords[i + 1];
            const col = allCoords[i + 2];
            
            plaintext += cube[layer][row][col];
        }

        return plaintext;
    }

    scoreText(text) {
        // Очистка текста от неалфавитных символов
        const cleanText = text.toUpperCase().replace(/[^A-Z]/g, '');
        if (cleanText.length === 0) return { total: -Infinity, counts: {} };

        // Подсчет n-грамм
        const counts = this.countNGrams(cleanText);
        
        // Расчет оценки
        return this.calculateScore(counts, cleanText.length);
    }

    countNGrams(text) {
        const counts = {
            letters: {},
            bigrams: {},
            trigrams: {},
            quadgrams: {}
        };

        // Подсчет отдельных букв
        for (const char of text) {
            counts.letters[char] = (counts.letters[char] || 0) + 1;
        }

        // Подсчет биграмм, триграмм и квадграмм
        for (let i = 0; i < text.length; i++) {
            if (i < text.length - 1) {
                const bigram = text.substr(i, 2);
                if (this.ngramStats.bigrams.hasOwnProperty(bigram)) {
                    counts.bigrams[bigram] = (counts.bigrams[bigram] || 0) + 1;
                }
            }

            if (i < text.length - 2) {
                const trigram = text.substr(i, 3);
                if (this.ngramStats.trigrams.hasOwnProperty(trigram)) {
                    counts.trigrams[trigram] = (counts.trigrams[trigram] || 0) + 1;
                }
            }

            if (i < text.length - 3) {
                const quadgram = text.substr(i, 4);
                if (this.ngramStats.quadgrams.hasOwnProperty(quadgram)) {
                    counts.quadgrams[quadgram] = (counts.quadgrams[quadgram] || 0) + 1;
                }
            }
        }

        return counts;
    }

    calculateScore(counts, length) {
        const scores = {
            letters: 0,
            bigrams: 0,
            trigrams: 0,
            quadgrams: 0
        };
        
        let total = 0;
        const weightSum = this.weights.letters + this.weights.bigrams + 
                         this.weights.trigrams + this.weights.quadgrams;

        // Расчет оценки для букв
        for (const char in counts.letters) {
            if (this.ngramStats.letters.hasOwnProperty(char)) {
                const expected = (this.ngramStats.letters[char] / 100) * length;
                const observed = counts.letters[char];
                scores.letters += Math.log10((observed + 1) / (expected + 1));
            }
        }

        // Расчет оценки для биграмм
        for (const gram in counts.bigrams) {
            if (this.ngramStats.bigrams.hasOwnProperty(gram)) {
                const expected = (this.ngramStats.bigrams[gram] / 100) * (length / 10);
                const observed = counts.bigrams[gram];
                scores.bigrams += Math.log10((observed + 1) / (expected + 1));
            }
        }

        // Расчет оценки для триграмм
        for (const gram in counts.trigrams) {
            if (this.ngramStats.trigrams.hasOwnProperty(gram)) {
                const expected = (this.ngramStats.trigrams[gram] / 100) * (length / 100);
                const observed = counts.trigrams[gram];
                scores.trigrams += Math.log10((observed + 1) / (expected + 1));
            }
        }

        // Расчет оценки для квадграмм
        for (const gram in counts.quadgrams) {
            if (this.ngramStats.quadgrams.hasOwnProperty(gram)) {
                const expected = (this.ngramStats.quadgrams[gram] / 100) * (length / 1000);
                const observed = counts.quadgrams[gram];
                scores.quadgrams += Math.log10((observed + 1) / (expected + 1));
            }
        }

        // Взвешенная сумма оценок
        total = (scores.letters * this.weights.letters +
                scores.bigrams * this.weights.bigrams +
                scores.trigrams * this.weights.trigrams +
                scores.quadgrams * this.weights.quadgrams) / weightSum;

        return { total, counts };
    }

    sendResults(results) {
        if (results.length > 0) {
            self.postMessage({
                type: 'results',
                results: results,
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
        const MAX_PAUSE_TIME = 60000; // Максимальное время паузы - 1 минута
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

// Инициализация и управление воркером
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
            default:
                console.warn('Unknown message type:', type);
        }
    } catch (error) {
        worker.sendError(error);
    }
};

// Глобальный обработчик ошибок
self.onerror = (error) => {
    worker.sendError(error);
    return true; // Предотвращаем вывод ошибки по умолчанию
};
