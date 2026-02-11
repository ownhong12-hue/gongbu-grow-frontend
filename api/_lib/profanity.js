const bannedWords = [
    '씨발', '시발', 'tlqkf',
    '병신', '븅신', 'qudtls',
    '새끼', '색히', '쌔끼', '개새', 'tofrl',
    '좆', '존나', '졸라', 'wot', 'whdwk',
    '지랄', 'wlwkf',
    '닥쳐', '닥치', 'ekzcj',
    '엿먹', 'djaaus',
    '개같', 'rorejem',
    '꺼져', 'rjwj',
    '섹스', 'sex', 'tprtm',
    '자지', 'wkwl',
    '보지', 'qhwl',
    '야동', 'dkehd',
    '음란', 'dmfks',
    'fuck', 'fuk', 'fxck',
    'shit', 'sht',
    'bitch',
    'ass',
    'dick',
    'pussy',
    'cock',
    'ㅅㅂ', 'ㅂㅅ', 'ㅄ', 'ㅈㄴ', 'ㅈㄹ', 'ㄲㅈ'
];

function cleanText(text) {
    if (!text) return '';
    return text.replace(/[^가-힣a-zA-Zㄱ-ㅎㅏ-ㅣ]/g, '').toLowerCase();
}

function hasProfanity(text) {
    if (!text) return false;
    const cleaned = cleanText(text);
    for (const word of bannedWords) {
        if (cleaned.includes(word)) {
            return true;
        }
    }
    return false;
}

function checkMultipleTexts(texts) {
    for (const text of texts) {
        if (hasProfanity(text)) {
            return true;
        }
    }
    return false;
}

function checkQuizProfanity(quizData) {
    const textsToCheck = [
        quizData.title,
        quizData.description
    ];
    
    if (quizData.questions && Array.isArray(quizData.questions)) {
        quizData.questions.forEach(q => {
            textsToCheck.push(q.question);
            if (q.options && Array.isArray(q.options)) {
                textsToCheck.push(...q.options);
            }
        });
    }
    
    return checkMultipleTexts(textsToCheck);
}

module.exports = {
    hasProfanity,
    checkMultipleTexts,
    checkQuizProfanity,
    cleanText
};
