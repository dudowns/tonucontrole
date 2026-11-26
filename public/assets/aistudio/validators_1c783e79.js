// ==========================================================================
// TONUCONTROLE - VALIDATORS.JS
// Validação robusta de entrada, sanitização e schemas
// ==========================================================================

(function () {
    'use strict';

    // ============================================
    // 1. VALIDAÇÕES DE TIPO E FORMATO
    // ============================================

    const Validators = {
        // Tipos básicos
        isString: (value) => typeof value === 'string',
        isNumber: (value) => typeof value === 'number' && !isNaN(value),
        isBoolean: (value) => typeof value === 'boolean',
        isObject: (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
        isArray: (value) => Array.isArray(value),
        isDate: (value) => value instanceof Date && !isNaN(value),
        isFunction: (value) => typeof value === 'function',
        isNull: (value) => value === null,
        isUndefined: (value) => value === undefined,
        isEmpty: (value) => {
            if (value === null || value === undefined) return true;
            if (typeof value === 'string') return value.trim().length === 0;
            if (Array.isArray(value)) return value.length === 0;
            if (typeof value === 'object') return Object.keys(value).length === 0;
            return false;
        },

        // ============================================
        // VALIDAÇÕES ESPECÍFICAS
        // ============================================

        isEmail: (value) => {
            if (!value || typeof value !== 'string') return false;
            return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
        },

        isStrongPassword: (value) => {
            if (!value || typeof value !== 'string') return false;
            // Mínimo 8 caracteres, 1 maiúscula, 1 minúscula, 1 número, 1 caractere especial
            return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(value);
        },

        isMediumPassword: (value) => {
            if (!value || typeof value !== 'string') return false;
            // Mínimo 6 caracteres, 1 maiúscula, 1 minúscula, 1 número
            return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{6,}$/.test(value);
        },

        isUUID: (value) => {
            if (!value || typeof value !== 'string') return false;
            return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
        },

        isDateString: (value) => {
            if (!value || typeof value !== 'string') return false;
            return /^\d{4}-\d{2}-\d{2}$/.test(value);
        },

        isDateTimeString: (value) => {
            if (!value || typeof value !== 'string') return false;
            return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(value);
        },

        isAmount: (value) => {
            const num = Number(value);
            return !isNaN(num) && num > 0 && num <= 999999999.99;
        },

        isPercentage: (value) => {
            const num = Number(value);
            return !isNaN(num) && num >= 0 && num <= 100;
        },

        isTicker: (value) => {
            if (!value || typeof value !== 'string') return false;
            return /^[A-Z0-9]{3,6}$/.test(value.toUpperCase().trim());
        },

        isCPF: (value) => {
            if (!value || typeof value !== 'string') return false;
            const cleaned = value.replace(/\D/g, '');
            if (cleaned.length !== 11) return false;

            const invalid = [
                '00000000000', '11111111111', '22222222222',
                '33333333333', '44444444444', '55555555555',
                '66666666666', '77777777777', '88888888888',
                '99999999999'
            ];
            if (invalid.includes(cleaned)) return false;

            let sum = 0;
            for (let i = 0; i < 9; i++) {
                sum += parseInt(cleaned.charAt(i)) * (10 - i);
            }
            let rev = 11 - (sum % 11);
            if (rev === 10 || rev === 11) rev = 0;
            if (rev !== parseInt(cleaned.charAt(9))) return false;

            sum = 0;
            for (let i = 0; i < 10; i++) {
                sum += parseInt(cleaned.charAt(i)) * (11 - i);
            }
            rev = 11 - (sum % 11);
            if (rev === 10 || rev === 11) rev = 0;
            if (rev !== parseInt(cleaned.charAt(10))) return false;

            return true;
        },

        isCNPJ: (value) => {
            if (!value || typeof value !== 'string') return false;
            const cleaned = value.replace(/\D/g, '');
            if (cleaned.length !== 14) return false;

            const invalid = [
                '00000000000000', '11111111111111', '22222222222222',
                '33333333333333', '44444444444444', '55555555555555',
                '66666666666666', '77777777777777', '88888888888888',
                '99999999999999'
            ];
            if (invalid.includes(cleaned)) return false;

            let size = cleaned.length - 2;
            let numbers = cleaned.substring(0, size);
            const digits = cleaned.substring(size);
            let sum = 0;
            let pos = size - 7;

            for (let i = size; i >= 1; i--) {
                sum += parseInt(numbers.charAt(size - i)) * pos--;
                if (pos < 2) pos = 9;
            }

            let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
            if (result !== parseInt(digits.charAt(0))) return false;

            size = size + 1;
            numbers = cleaned.substring(0, size);
            sum = 0;
            pos = size - 7;

            for (let i = size; i >= 1; i--) {
                sum += parseInt(numbers.charAt(size - i)) * pos--;
                if (pos < 2) pos = 9;
            }

            result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
            if (result !== parseInt(digits.charAt(1))) return false;

            return true;
        },

        isPhone: (value) => {
            if (!value || typeof value !== 'string') return false;
            const cleaned = value.replace(/\D/g, '');
            return cleaned.length >= 10 && cleaned.length <= 11;
        },

        isURL: (value) => {
            if (!value || typeof value !== 'string') return false;
            try {
                const url = new URL(value);
                return url.protocol === 'http:' || url.protocol === 'https:';
            } catch {
                return false;
            }
        },

        isHexColor: (value) => {
            if (!value || typeof value !== 'string') return false;
            return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value);
        },

        // ============================================
        // VALIDAÇÕES DE TAMANHO
        // ============================================

        minLength: (value, min) => {
            if (!value || typeof value !== 'string') return false;
            return value.length >= min;
        },

        maxLength: (value, max) => {
            if (!value || typeof value !== 'string') return false;
            return value.length <= max;
        },

        betweenLength: (value, min, max) => {
            if (!value || typeof value !== 'string') return false;
            return value.length >= min && value.length <= max;
        },

        minValue: (value, min) => {
            const num = Number(value);
            return !isNaN(num) && num >= min;
        },

        maxValue: (value, max) => {
            const num = Number(value);
            return !isNaN(num) && num <= max;
        },

        betweenValue: (value, min, max) => {
            const num = Number(value);
            return !isNaN(num) && num >= min && num <= max;
        }
    };

    // ============================================
    // 2. CLASSE DE VALIDAÇÃO COM SCHEMAS
    // ============================================

    class Validator {
        constructor() {
            this.rules = [];
            this.errors = [];
            this.validatedData = {};
        }

        addRule(field, validations) {
            this.rules.push({ field, validations });
            return this;
        }

        validate(data) {
            this.errors = [];
            this.validatedData = { ...data };

            for (const rule of this.rules) {
                const value = data[rule.field];

                for (const validation of rule.validations) {
                    const { type, params, message } = validation;
                    let isValid = true;

                    switch (type) {
                        case 'required':
                            isValid = value !== undefined && value !== null && value !== '';
                            break;
                        case 'string':
                            isValid = Validators.isString(value);
                            break;
                        case 'number':
                            isValid = Validators.isNumber(value);
                            break;
                        case 'boolean':
                            isValid = Validators.isBoolean(value);
                            break;
                        case 'email':
                            isValid = Validators.isEmail(value);
                            break;
                        case 'password':
                            isValid = Validators.isStrongPassword(value);
                            break;
                        case 'mediumPassword':
                            isValid = Validators.isMediumPassword(value);
                            break;
                        case 'minLength':
                            isValid = Validators.minLength(value, params);
                            break;
                        case 'maxLength':
                            isValid = Validators.maxLength(value, params);
                            break;
                        case 'betweenLength':
                            isValid = Validators.betweenLength(value, params.min, params.max);
                            break;
                        case 'amount':
                            isValid = Validators.isAmount(value);
                            break;
                        case 'dateString':
                            isValid = Validators.isDateString(value);
                            break;
                        case 'enum':
                            isValid = params.includes(value);
                            break;
                        case 'ticker':
                            isValid = Validators.isTicker(value);
                            break;
                        case 'cpf':
                            isValid = Validators.isCPF(value);
                            break;
                        case 'cnpj':
                            isValid = Validators.isCNPJ(value);
                            break;
                        case 'phone':
                            isValid = Validators.isPhone(value);
                            break;
                        case 'url':
                            isValid = Validators.isURL(value);
                            break;
                        case 'hexColor':
                            isValid = Validators.isHexColor(value);
                            break;
                        case 'minValue':
                            isValid = Validators.minValue(value, params);
                            break;
                        case 'maxValue':
                            isValid = Validators.maxValue(value, params);
                            break;
                        case 'betweenValue':
                            isValid = Validators.betweenValue(value, params.min, params.max);
                            break;
                        default:
                            isValid = true;
                    }

                    if (!isValid) {
                        this.errors.push({
                            field: rule.field,
                            message: message || `Campo ${rule.field} inválido`
                        });
                    }
                }
            }

            return this.errors.length === 0;
        }

        getErrors() {
            return this.errors;
        }

        getFirstError() {
            return this.errors.length > 0 ? this.errors[0] : null;
        }

        getValidatedData() {
            return this.validatedData;
        }

        clear() {
            this.rules = [];
            this.errors = [];
            this.validatedData = {};
            return this;
        }

        // Validação rápida para um único campo
        static validateField(field, value, rules) {
            const validator = new Validator();
            validator.addRule(field, rules);
            return validator.validate({ [field]: value });
        }

        // Validação assíncrona (para APIs)
        static async validateAsync(data, schema) {
            return new Promise((resolve) => {
                const isValid = schema.validate(data);
                resolve({
                    valid: isValid,
                    errors: schema.getErrors(),
                    data: schema.getValidatedData()
                });
            });
        }
    }

    // ============================================
    // 3. SCHEMAS PRÉ-DEFINIDOS
    // ============================================

    const Schemas = {
        transaction: new Validator()
            .addRule('description', [
                { type: 'required', message: 'Descrição é obrigatória' },
                { type: 'string', message: 'Descrição deve ser texto' },
                { type: 'betweenLength', params: { min: 2, max: 200 }, message: 'Descrição deve ter entre 2 e 200 caracteres' }
            ])
            .addRule('amount', [
                { type: 'required', message: 'Valor é obrigatório' },
                { type: 'amount', message: 'Valor deve ser um número positivo válido' }
            ])
            .addRule('type', [
                { type: 'required', message: 'Tipo é obrigatório' },
                { type: 'enum', params: ['income', 'expense'], message: 'Tipo deve ser "income" ou "expense"' }
            ])
            .addRule('date', [
                { type: 'required', message: 'Data é obrigatória' },
                { type: 'dateString', message: 'Data deve estar no formato YYYY-MM-DD' }
            ]),

        bill: new Validator()
            .addRule('description', [
                { type: 'required', message: 'Descrição é obrigatória' },
                { type: 'string', message: 'Descrição deve ser texto' },
                { type: 'betweenLength', params: { min: 2, max: 200 }, message: 'Descrição deve ter entre 2 e 200 caracteres' }
            ])
            .addRule('amount', [
                { type: 'required', message: 'Valor é obrigatório' },
                { type: 'amount', message: 'Valor deve ser um número positivo válido' }
            ])
            .addRule('date', [
                { type: 'required', message: 'Data é obrigatória' },
                { type: 'dateString', message: 'Data deve estar no formato YYYY-MM-DD' }
            ]),

        login: new Validator()
            .addRule('email', [
                { type: 'required', message: 'E-mail é obrigatório' },
                { type: 'email', message: 'E-mail inválido' }
            ])
            .addRule('password', [
                { type: 'required', message: 'Senha é obrigatória' },
                { type: 'string', message: 'Senha deve ser texto' },
                { type: 'minLength', params: 6, message: 'Senha deve ter pelo menos 6 caracteres' }
            ]),

        register: new Validator()
            .addRule('name', [
                { type: 'required', message: 'Nome é obrigatório' },
                { type: 'string', message: 'Nome deve ser texto' },
                { type: 'betweenLength', params: { min: 2, max: 100 }, message: 'Nome deve ter entre 2 e 100 caracteres' }
            ])
            .addRule('email', [
                { type: 'required', message: 'E-mail é obrigatório' },
                { type: 'email', message: 'E-mail inválido' }
            ])
            .addRule('password', [
                { type: 'required', message: 'Senha é obrigatória' },
                { type: 'string', message: 'Senha deve ser texto' },
                { type: 'minLength', params: 6, message: 'Senha deve ter pelo menos 6 caracteres' }
            ]),

        investment: new Validator()
            .addRule('ticker', [
                { type: 'required', message: 'Ticker é obrigatório' },
                { type: 'ticker', message: 'Ticker inválido (ex: RZTR11, PETR4)' }
            ])
            .addRule('type', [
                { type: 'required', message: 'Tipo de operação é obrigatório' },
                { type: 'enum', params: ['Compra', 'Venda'], message: 'Tipo deve ser "Compra" ou "Venda"' }
            ])
            .addRule('quantity', [
                { type: 'required', message: 'Quantidade é obrigatória' },
                { type: 'number', message: 'Quantidade deve ser um número' },
                { type: 'minValue', params: 0.001, message: 'Quantidade deve ser maior que zero' }
            ])
            .addRule('unit_price', [
                { type: 'required', message: 'Preço unitário é obrigatório' },
                { type: 'amount', message: 'Preço unitário deve ser um número positivo válido' }
            ])
            .addRule('date', [
                { type: 'required', message: 'Data é obrigatória' },
                { type: 'dateString', message: 'Data deve estar no formato YYYY-MM-DD' }
            ]),

        goal: new Validator()
            .addRule('title', [
                { type: 'required', message: 'Título é obrigatório' },
                { type: 'string', message: 'Título deve ser texto' },
                { type: 'betweenLength', params: { min: 2, max: 100 }, message: 'Título deve ter entre 2 e 100 caracteres' }
            ])
            .addRule('target_amount', [
                { type: 'required', message: 'Valor alvo é obrigatório' },
                { type: 'amount', message: 'Valor alvo deve ser um número positivo válido' }
            ])
            .addRule('current_amount', [
                { type: 'number', message: 'Valor atual deve ser um número' },
                { type: 'minValue', params: 0, message: 'Valor atual não pode ser negativo' }
            ])
            .addRule('deadline', [
                { type: 'dateString', message: 'Data limite deve estar no formato YYYY-MM-DD' }
            ]),

        profile: new Validator()
            .addRule('full_name', [
                { type: 'required', message: 'Nome é obrigatório' },
                { type: 'string', message: 'Nome deve ser texto' },
                { type: 'betweenLength', params: { min: 2, max: 100 }, message: 'Nome deve ter entre 2 e 100 caracteres' }
            ])
            .addRule('currency', [
                { type: 'required', message: 'Moeda é obrigatória' },
                { type: 'enum', params: ['BRL', 'USD', 'EUR'], message: 'Moeda inválida' }
            ]),

        budget: new Validator()
            .addRule('category_id', [
                { type: 'required', message: 'Categoria é obrigatória' },
                { type: 'string', message: 'ID da categoria inválido' }
            ])
            .addRule('limit', [
                { type: 'required', message: 'Limite é obrigatório' },
                { type: 'amount', message: 'Limite deve ser um número positivo válido' }
            ]),

        dividend: new Validator()
            .addRule('ticker', [
                { type: 'required', message: 'Ticker é obrigatório' },
                { type: 'ticker', message: 'Ticker inválido' }
            ])
            .addRule('quantity', [
                { type: 'required', message: 'Quantidade é obrigatória' },
                { type: 'number', message: 'Quantidade deve ser um número' },
                { type: 'minValue', params: 0.001, message: 'Quantidade deve ser maior que zero' }
            ])
            .addRule('unit_value', [
                { type: 'required', message: 'Valor unitário é obrigatório' },
                { type: 'amount', message: 'Valor unitário deve ser um número positivo válido' }
            ])
            .addRule('date', [
                { type: 'required', message: 'Data é obrigatória' },
                { type: 'dateString', message: 'Data deve estar no formato YYYY-MM-DD' }
            ])
    };

    // ============================================
    // 4. SANITIZAÇÃO AVANÇADA
    // ============================================

    function sanitizeInput(value, options = {}) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'number' && !isNaN(value)) return value;
        if (typeof value === 'boolean') return value;

        let str = String(value);

        // Remover tags HTML
        if (options.stripTags !== false) {
            str = str.replace(/<[^>]*>/g, '');
        }

        // Remover protocolos perigosos
        str = str.replace(/javascript:/gi, '');
        str = str.replace(/on\w+=/gi, '');
        str = str.replace(/vbscript:/gi, '');
        str = str.replace(/data:text\/html/gi, '');

        // Codificar entidades HTML
        const entities = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
            '/': '&#47;',
            '`': '&#96;',
            '=': '&#61;',
            ';': '&#59;'
        };

        if (options.encodeEntities !== false) {
            str = str.replace(/[&<>"'/`=;]/g, (match) => entities[match] || match);
        }

        // Remover espaços extras
        if (options.trim !== false) {
            str = str.trim();
        }

        if (options.squashSpaces) {
            str = str.replace(/\s+/g, ' ');
        }

        // Limitar comprimento
        if (options.maxLength) {
            str = str.substring(0, options.maxLength);
        }

        // Converter para maiúsculas (para tickers)
        if (options.toUpperCase) {
            str = str.toUpperCase();
        }

        // Converter para minúsculas (para emails)
        if (options.toLowerCase) {
            str = str.toLowerCase();
        }

        return str;
    }

    // ============================================
    // 5. EXPORTAÇÃO PARA O ESCOPO GLOBAL
    // ============================================

    window.TonuValidators = Validators;
    window.TonuSchemas = Schemas;
    window.TonuValidator = Validator;
    window.sanitizeInput = sanitizeInput;

    console.log('✅ Validators.js carregado com sucesso');

})();