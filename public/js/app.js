/* eslint-env browser */
(function () {
    const showToast = () => {
        const toast = document.querySelector("[data-toast]");
        if (!toast) {
            return;
        }

        requestAnimationFrame(() => {
            toast.classList.add("visible");
        });

        setTimeout(() => {
            toast.classList.remove("visible");
            setTimeout(() => toast.remove(), 250);
        }, 3800);
    };

    const setupEnhancedForms = () => {
        const forms = document.querySelectorAll("form[data-enhanced-form]");
        forms.forEach(form => {
            form.addEventListener("submit", () => {
                const submitButton = form.querySelector('button[type="submit"]');
                if (!submitButton) {
                    return;
                }
                const loadingText = submitButton.getAttribute("data-loading-text");
                if (loadingText) {
                    submitButton.dataset.originalText = submitButton.textContent;
                    submitButton.textContent = loadingText;
                }
                submitButton.disabled = true;
                submitButton.classList.add("is-loading");
            });
        });
    };

    const setupInlineValidation = () => {
        const fields = document.querySelectorAll("[data-inline-validate]");
        fields.forEach(field => {
            const validationMessageEl = document.createElement("small");
            validationMessageEl.className = "inline-error";
            field.insertAdjacentElement("afterend", validationMessageEl);

            const validate = () => {
                if (field.checkValidity()) {
                    validationMessageEl.textContent = "";
                    field.classList.remove("input-error");
                    return;
                }
                validationMessageEl.textContent = field.validationMessage;
                field.classList.add("input-error");
            };

            field.addEventListener("blur", validate);
            field.addEventListener("input", () => {
                if (field.classList.contains("input-error")) {
                    validate();
                }
            });
        });
    };

    showToast();
    setupEnhancedForms();
    setupInlineValidation();
})();
