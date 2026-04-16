const generateCaptchaChallenge = () => {
    const left = Math.floor(Math.random() * 9) + 1;
    const right = Math.floor(Math.random() * 9) + 1;
    return {
        question: `${left} + ${right} = ?`,
        answer: String(left + right)
    };
};

module.exports = {
    generateCaptchaChallenge
};
