// ============================================
// TONUCONTROLE - SECURITY HEADERS & CSP CONFIG
// ============================================

const crypto = require('crypto');
const helmet = require('helmet');

// Gerador de Nonce Criptográfico por Requisição
function generateNonceMiddleware(req, res, next) {
    // Gera 16 bytes em base64 de alta entropia para proteção por requisição
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.cspNonce = nonce;
    next();
}

// Configuração do Helmet com CSP Robusta, Estável e Compatível
function createHelmetMiddleware() {
    return helmet({
        // frameguard desativado para permitir renderização fluida no iframe do Google AI Studio via frame-ancestors
        frameguard: false,
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        contentSecurityPolicy: {
            useDefaults: false,
            directives: {
                defaultSrc: ["'self'"],
                fontSrc: [
                    "'self'",
                    'https://fonts.gstatic.com',
                    'https://cdnjs.cloudflare.com',
                    'https://use.typekit.net',
                    'data:'
                ],
                styleSrc: [
                    "'self'",
                    'https://fonts.googleapis.com',
                    'https://cdnjs.cloudflare.com',
                    "'unsafe-inline'",
                    (req, res) => `'nonce-${res.locals.cspNonce}'`
                ],
                // script-src com nonce + origens autorizadas + 'unsafe-inline' para funcionamento 100% fluido de todos os handlers de clique da UI
                scriptSrc: [
                    "'self'",
                    'https://cdnjs.cloudflare.com',
                    'https://cdn.jsdelivr.net',
                    'https://cdn.skypack.dev',
                    "'unsafe-inline'",
                    (req, res) => `'nonce-${res.locals.cspNonce}'`
                ],
                imgSrc: [
                    "'self'",
                    'data:',
                    'https:',
                    'blob:'
                ],
                connectSrc: [
                    "'self'",
                    'https://*.supabase.co',
                    'wss://*.supabase.co',
                    'https://brapi.dev',
                    'https://query1.finance.yahoo.com',
                    'https://query2.finance.yahoo.com'
                ],
                workerSrc: [
                    "'self'",
                    'blob:'
                ],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                frameAncestors: [
                    "'self'",
                    'https://*.google.com',
                    'https://*.aistudio.google.com',
                    'https://*.run.app',
                    'https://*.googleusercontent.com',
                    'https://*.usercontent.goog'
                ],
                reportUri: '/api/csp-report'
            }
        }
    });
}

// Injeção de Nonce em Tags <script> e <style> no HTML servido
function injectNonceIntoHtml(html, nonce) {
    if (!html || typeof html !== 'string') return html;

    // Injeta nonce em tags <script> e <style> que ainda não o possuem, sem duplicar nem quebrar atributos
    let transformed = html.replace(/<script(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`);
    transformed = transformed.replace(/<style(?![^>]*\bnonce=)/gi, `<style nonce="${nonce}"`);

    return transformed;
}

module.exports = {
    generateNonceMiddleware,
    createHelmetMiddleware,
    injectNonceIntoHtml
};
