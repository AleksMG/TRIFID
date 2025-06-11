// trifid-worker.js

// Нормализованные частоты n-грамм (на 1000 символов)
const NGRAM_SCORES = {
    // Буквы (на 1000 символов)
    letters: {
        'A': 81.67, 'B': 14.92, 'C': 27.82, 'D': 42.53, 'E': 127.02,
        'F': 22.28, 'G': 20.15, 'H': 60.94, 'I': 69.66, 'J': 1.53,
        'K': 7.72, 'L': 40.25, 'M': 24.06, 'N': 67.49, 'O': 75.07,
        'P': 19.29, 'Q': 0.95, 'R': 59.87, 'S': 63.27, 'T': 90.56,
        'U': 27.58, 'V': 9.78, 'W': 23.60, 'X': 1.50, 'Y': 19.74,
        'Z': 0.74, '?': 0.01, '*': 0.01
    },

    // Биграммы (на 10000 символов)
    bigrams: {
        'TH': 15.2, 'HE': 12.5, 'IN': 9.4, 'ER': 9.4, 'AN': 8.2,
        'RE': 6.8, 'ND': 6.4, 'AT': 5.9, 'ON': 5.7, 'NT': 5.6,
        'HA': 5.6, 'ES': 5.6, 'ST': 5.5, 'EN': 5.5, 'ED': 5.3,
        'TO': 5.2, 'IT': 5.0, 'OU': 5.0, 'EA': 4.9, 'HI': 4.9
    },

    // Триграммы (на 100000 символов)
    trigrams: {
        'THE': 18.1, 'AND': 7.3, 'ING': 7.2, 'ENT': 4.2, 'ION': 4.2,
        'HER': 3.6, 'FOR': 3.4, 'THA': 3.3, 'NTH': 3.3, 'INT': 3.2,
        'ERE': 3.1, 'TIO': 3.1, 'TER': 3.0, 'EST': 2.8, 'ERS': 2.8,
        'ATI': 2.6, 'HAT': 2.6, 'ATE': 2.5, 'ALL': 2.5, 'ETH': 2.4
    },

    // Квадрограммы (на 1000000 символов)
    quadgrams: {
        'TION': 15.0, 'NTHE': 14.0, 'THER': 13.0, 'THAT': 12.0,
        'OFTHE': 11.0, 'INGT': 10.0, 'THEM': 9.0, 'THEI': 9.0,
        'DTHE': 9.0, 'ATIO': 9.0, 'ETHE': 8.0, 'THIS': 8.0,
        'TING': 8.0, 'WITH': 8.0, 'STHE': 8.0, 'HERE': 7.0
    }
};

// Веса для разных типов n-грамм
const WEIGHTS = {
    letters: 0.1,    // 10%
    bigrams: 0.2,     // 20%
    trigrams: 0.3,    // 30%
    quadgrams: 0.4    // 40%
};

// Новая улучшенная система оценки
function scoreText(text) {
    // Приводим к верхнему регистру и удаляем неалфавитные символы
    const cleanText = text.toUpperCase().replace(/[^A-Z?*]/g, '');
    const length = cleanText.length;
    
    if (length < 4) return 0; // Слишком короткий текст
    
    let totalScore = 0;
    let counts = {
        letters: {},
        bigrams: {},
        trigrams: {},
        quadgrams: {}
    };
    
    // Считаем n-граммы
    for (let i = 0; i < length; i++) {
        // Одиночные буквы
        const char = cleanText[i];
        counts.letters[char] = (counts.letters[char] || 0) + 1;
        
        // Биграммы
        if (i < length - 1) {
            const bigram = cleanText.substr(i, 2);
            counts.bigrams[bigram] = (counts.bigrams[bigram] || 0) + 1;
        }
        
        // Триграммы
        if (i < length - 2) {
            const trigram = cleanText.substr(i, 3);
            counts.trigrams[trigram] = (counts.trigrams[trigram] || 0) + 1;
        }
        
        // Квадрограммы
        if (i < length - 3) {
            const quadgram = cleanText.substr(i, 4);
            counts.quadgrams[quadgram] = (counts.quadgrams[quadgram] || 0) + 1;
        }
    }
    
    // Рассчитываем баллы для каждого типа n-грамм
    const scores = {
        letters: 0,
        bigrams: 0,
        trigrams: 0,
        quadgrams: 0
    };
    
    // Баллы для букв
    for (const char in counts.letters) {
        const expected = (NGRAM_SCORES.letters[char] || 0) * (length / 1000);
        const observed = counts.letters[char];
        scores.letters += Math.min(observed, expected); // Штрафуем за избыток тоже
    }
    
    // Баллы для биграмм
    for (const bigram in counts.bigrams) {
        const expected = (NGRAM_SCORES.bigrams[bigram] || 0) * (length / 10000);
        const observed = counts.bigrams[bigram];
        scores.bigrams += Math.min(observed, expected);
    }
    
    // Баллы для триграмм
    for (const trigram in counts.trigrams) {
        const expected = (NGRAM_SCORES.trigrams[trigram] || 0) * (length / 100000);
        const observed = counts.trigrams[trigram];
        scores.trigrams += Math.min(observed, expected);
    }
    
    // Баллы для квадрограмм
    for (const quadgram in counts.quadgrams) {
        const expected = (NGRAM_SCORES.quadgrams[quadgram] || 0) * (length / 1000000);
        const observed = counts.quadgrams[quadgram];
        scores.quadgrams += Math.min(observed, expected);
    }
    
    // Нормализуем и взвешиваем
    totalScore = (
        WEIGHTS.letters * scores.letters +
        WEIGHTS.bigrams * scores.bigrams +
        WEIGHTS.trigrams * scores.trigrams +
        WEIGHTS.quadgrams * scores.quadgrams
    );
    
    // Дополнительный бонус за известный plaintext
    if (self.knownPlaintext && cleanText.includes(self.knownPlaintext)) {
        totalScore *= 1.5;
    }
    
    return {
        score: totalScore,
        trigrams: Object.keys(counts.trigrams).length,
        quadgrams: Object.keys(counts.quadgrams).length,
        counts: counts // Для статистики
    };
}

// Генерация куба (оптимизированная версия)
function generateCube(alphabet, key = '') {
    const cubeSize = 3;
    const cube = Array.from({length: cubeSize}, () => 
        Array.from({length: cubeSize}, () => 
            Array(cubeSize).fill('')
        )
    );

    // Создаем уникальный алфавит с ключом
    const keyChars = [...new Set(key.toUpperCase().split('').filter(c => alphabet.includes(c)))];
    const remainingChars = alphabet.split('').filter(c => !keyChars.includes(c));
    const keyedAlphabet = [...keyChars, ...remainingChars].join('');

    // Заполняем куб
    for (let i = 0; i < 27; i++) {
        const layer = Math.floor(i / 9);
        const row = Math.floor((i % 9) / 3);
        const col = i % 3;
        cube[layer][row][col] = keyedAlphabet[i % keyedAlphabet.length];
    }

    return cube;
}

// Оптимизированная функция дешифрования
function decryptTrifid(ciphertext, cube, period = 5) {
    // Создаем карту координат
    const coordMap = new Map();
    for (let l = 0; l < 3; l++) {
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                coordMap.set(cube[l][r][c], [l, r, c]);
            }
        }
    }

    // Обрабатываем текст группами по period символов
    const groups = [];
    for (let i = 0; i < ciphertext.length; i += period) {
        groups.push(ciphertext.slice(i, i + period));
    }

    // Получаем все координаты
    const allCoords = groups.flatMap(group => 
        [...group].map(c => coordMap.get(c) || [0, 0, 0])
    ).flat();

    // Собираем расшифрованный текст
    let plaintext = '';
    for (let i = 0; i < allCoords.length; i += 3) {
        if (i + 2 >= allCoords.length) break;
        const l = allCoords[i];
        const r = allCoords[i+1];
        const c = allCoords[i+2];
        plaintext += cube[l][r][c];
    }

    return plaintext;
}

// Главная функция воркера
self.onmessage = async function(e) {
    const { type, data } = e.data;
    
    if (type === 'init') {
        self.ciphertext = data.ciphertext;
        self.alphabet = data.alphabet;
        self.keyLength = data.keyLength;
        self.period = data.period;
        self.knownPlaintext = data.knownPlaintext?.toUpperCase();
        self.workerId = data.workerId;
        self.keysToTest = data.keysToTest;
        self.startIndex = data.startIndex;
        return;
    }
    
    if (type === 'pause') {
        self.paused = true;
        return;
    }
    
    if (type === 'resume') {
        self.paused = false;
        return;
    }
    
    if (type !== 'start') return;

    const endIndex = self.startIndex + self.keysToTest - 1;
    const alphabetSize = self.alphabet.length;
    let keysTested = 0;
    let lastUpdate = performance.now();
    const batchSize = 1000;

    while (keysTested < self.keysToTest) {
        if (self.paused) {
            await new Promise(resolve => setTimeout(resolve, 100));
            continue;
        }

        const batchResults = [];
        const batchStart = performance.now();
        
        for (let i = 0; i < batchSize && keysTested < self.keysToTest; i++) {
            // Генерируем уникальный ключ
            let index = self.startIndex + keysTested;
            let key = '';
            for (let j = 0; j < self.keyLength; j++) {
                key += self.alphabet[index % alphabetSize];
                index = Math.floor(index / alphabetSize);
            }

            // Генерируем куб и дешифруем
            const cube = generateCube(self.alphabet, key);
            const plaintext = decryptTrifid(self.ciphertext, cube, self.period);
            
            // Оцениваем текст
            const scoreData = scoreText(plaintext);
            
            // Фильтруем по известному plaintext если нужно
            if (!self.knownPlaintext || plaintext.includes(self.knownPlaintext)) {
                batchResults.push({
                    key,
                    text: plaintext,
                    score: scoreData.score,
                    trigrams: scoreData.trigrams,
                    quadgrams: scoreData.quadgrams,
                    counts: scoreData.counts,
                    cube
                });
            }

            keysTested++;
        }

        // Отправляем результаты батчами
        if (batchResults.length > 0) {
            self.postMessage({
                type: 'results',
                data: {
                    results: batchResults,
                    keysTested: keysTested,
                    workerId: self.workerId
                }
            });
        }

        // Отправляем прогресс
        const now = performance.now();
        if (now - lastUpdate >= 1000 || keysTested >= self.keysToTest) {
            self.postMessage({
                type: 'progress',
                data: {
                    keysTested: keysTested,
                    workerId: self.workerId
                }
            });
            lastUpdate = now;
        }

        // Даем дыхать event loop
        if (performance.now() - batchStart > 50) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    self.postMessage({
        type: 'complete',
        data: {
            workerId: self.workerId,
            keysTested: keysTested
        }
    });
};
