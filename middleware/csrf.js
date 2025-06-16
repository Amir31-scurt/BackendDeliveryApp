import { createHash } from 'crypto';

// Generate a random CSRF token
const generateCSRFToken = () => {
    return createHash('sha256')
        .update(Math.random().toString())
        .digest('hex');
};

// CSRF protection middleware
export const csrfProtection = (req, res, next) => {
    // Skip CSRF check for GET requests
    if (req.method === 'GET') {
        // Generate new CSRF token for GET requests
        const csrfToken = generateCSRFToken();
        res.cookie('csrfToken', csrfToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });
        res.locals.csrfToken = csrfToken;
        return next();
    }

    // For non-GET requests, verify CSRF token
    const csrfToken = req.headers['x-csrf-token'];
    const cookieToken = req.cookies.csrfToken;

    if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    next();
};

export default csrfProtection; 