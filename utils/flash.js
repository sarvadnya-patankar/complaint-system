const FLASH_KEY = "flashMessage";

const setFlash = (req, type, message) => {
    if (!req.session) {
        return;
    }
    req.session[FLASH_KEY] = { type, message };
};

const consumeFlash = req => {
    if (!req.session) {
        return null;
    }
    const flash = req.session[FLASH_KEY] || null;
    delete req.session[FLASH_KEY];
    return flash;
};

module.exports = {
    setFlash,
    consumeFlash
};
